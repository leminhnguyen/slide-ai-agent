"""LangGraph agent for the slide AI assistant."""
from typing import Optional, AsyncGenerator

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
                    yield chunk.content

            # Detect tool calls that modify slides
            elif kind == "on_tool_end":
                tool_name = event.get("name", "")
                if tool_name in ("update_outline", "add_slide", "delete_slide"):
                    slide_updated = True

    except Exception as e:
        logger.error(f"Agent stream error: {e}")
        yield f"\n\n[Error: {e}]"

    # Final metadata line (always last)
    yield f"\n\n__META__:{{\"slide_updated\":{str(slide_updated).lower()}}}"
