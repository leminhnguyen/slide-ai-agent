"""Chat API routes — streaming SSE responses from the AI agent."""
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.ai.agent.agent import stream_agent_response

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    session_id: str
    message: str
    selected_document_ids: list[str] = Field(default_factory=list)
    tagged_document_ids: list[str] = Field(default_factory=list)


async def _sse_generator(
    session_id: str,
    message: str,
    selected_document_ids: list[str],
    tagged_document_ids: list[str],
):
    async for chunk in stream_agent_response(
        session_id,
        message,
        selected_document_ids=selected_document_ids,
        tagged_document_ids=tagged_document_ids,
    ):
        if not isinstance(chunk, str):
            chunk = str(chunk)
        # SSE format: each data line followed by double newline
        for line in chunk.split("\n"):
            yield f"data: {line}\n"
        yield "\n"


@router.post("")
async def chat(body: ChatRequest):
    return StreamingResponse(
        _sse_generator(
            body.session_id,
            body.message,
            body.selected_document_ids,
            body.tagged_document_ids,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
