"""LangGraph agent for the slide AI assistant."""
from typing import Any, Optional, AsyncGenerator

from langchain_core.messages import SystemMessage, HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.mongodb import MongoDBSaver
from langgraph.prebuilt import create_react_agent
from loguru import logger

from src.ai.agent.prompts import AGENT_SYSTEM_PROMPT
from src.ai.agent.state import AgentContext
from src.ai.agent.tools import AGENT_TOOLS
from src.libs.config import get_settings

_agent = None
_saver_ctx = None


def _extract_text_fragments(value: Any) -> list[str]:
    """Flatten LangChain/OpenAI response content into plain text fragments."""
    if value is None:
        return []

    if isinstance(value, str):
        return [value] if value else []

    if isinstance(value, (list, tuple)):
        parts: list[str] = []
        for item in value:
            parts.extend(_extract_text_fragments(item))
        return parts

    if isinstance(value, dict):
        text = value.get("text")
        if isinstance(text, str) and text:
            return [text]

        parts: list[str] = []
        for key in ("content", "value", "delta"):
            if key in value:
                parts.extend(_extract_text_fragments(value[key]))
        return parts

    if hasattr(value, "text") and isinstance(value.text, str) and value.text:
        return [value.text]

    if hasattr(value, "model_dump"):
        return _extract_text_fragments(value.model_dump())

    if hasattr(value, "content"):
        return _extract_text_fragments(value.content)

    return []


def get_agent():
    """Build and return the LangGraph ReAct agent with MongoDB checkpointing (lazy singleton)."""
    global _agent, _saver_ctx
    if _agent is not None:
        return _agent

    settings = get_settings()

    llm = ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        streaming=True,
    )

    # MongoDBSaver.from_conn_string is a context manager; enter it once at init
    _saver_ctx = MongoDBSaver.from_conn_string(
        settings.mongodb_uri, db_name="slide_agent_memory"
    )
    saver = _saver_ctx.__enter__()

    _agent = create_react_agent(
        model=llm,
        tools=AGENT_TOOLS,
        checkpointer=saver,
        prompt=SystemMessage(content=AGENT_SYSTEM_PROMPT),
    )
    return _agent


async def stream_agent_response(
    session_id: str,
    user_message: str,
    selected_document_ids: Optional[list[str]] = None,
    tagged_document_ids: Optional[list[str]] = None,
) -> AsyncGenerator[str, None]:
    """
    Stream the agent's response as SSE-compatible text chunks.
    Yields: text chunks, then a final metadata line starting with '__META__:'.
    """
    agent = get_agent()

    context = AgentContext(
        session_id=session_id,
        selected_document_ids=selected_document_ids or [],
        tagged_document_ids=tagged_document_ids or [],
    )

    # Look up filenames for tagged documents so we can hint the agent about
    # which file(s) the user is referring to. The message itself may still
    # contain "@filename" but this ensures a structured hint reaches the agent
    # even if the user just writes "what's inside this file?".
    if tagged_document_ids:
        try:
            from bson import ObjectId
            from src.libs.database import get_db
            db = get_db()
            cursor = db.rag_documents.find(
                {"_id": {"$in": [ObjectId(x) for x in tagged_document_ids]}}
            )
            names = [d.get("filename", "") async for d in cursor]
            if names:
                hint = (
                    "[System note: the user has tagged the following uploaded "
                    f"file(s) for this turn: {', '.join(names)}. Call "
                    "search_documents (pre-scoped to these files) before "
                    "answering questions about their content.]\n\n"
                )
                user_message = hint + user_message
        except Exception as e:
            logger.warning(f"Could not resolve tagged document names: {e}")

    config = {
        "configurable": {
            "thread_id": session_id,
            "context": context.model_dump(),
        }
    }

    slide_updated = False
    try:
        async for event in agent.astream_events(
            {"messages": [HumanMessage(content=user_message)]},
            config=config,
            version="v2",
        ):
            kind = event.get("event")

            # Stream AI token chunks
            if kind == "on_chat_model_stream":
                chunk = event.get("data", {}).get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    for text in _extract_text_fragments(chunk.content):
                        if text:
                            yield text

            elif kind == "on_custom_event":
                event_name = event.get("name", "")
                data = event.get("data", {})
                if event_name in ("web_search_started", "web_search_links"):
                    import json
                    yield "__EVENT__:" + json.dumps(
                        {
                            "type": event_name,
                            "data": data,
                        },
                        ensure_ascii=False,
                    )

            # Detect tool calls that modify slides
            elif kind == "on_tool_end":
                tool_name = event.get("name", "")
                if tool_name in (
                    "update_outline",
                    "add_slide",
                    "delete_slide",
                    "edit_slide",
                    "add_image_to_slide",
                ):
                    slide_updated = True

    except Exception as e:
        logger.error(f"Agent stream error: {e}")
        yield f"[Error: {e}]"

    # Final metadata line (always last)
    yield f"__META__:{{\"slide_updated\":{str(slide_updated).lower()}}}"
