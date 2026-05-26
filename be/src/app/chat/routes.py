"""Chat API routes — streaming SSE responses from the AI agent."""
from datetime import datetime, timezone
import json
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.ai.agent.agent import stream_agent_response
from src.libs.database import get_db

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    session_id: str
    message: str
    selected_document_ids: list[str] = Field(default_factory=list)
    tagged_document_ids: list[str] = Field(default_factory=list)


class ChatMessageOut(BaseModel):
    id: str
    session_id: str
    role: Literal["user", "assistant"]
    content: str
    slide_updated: bool = False
    created_at: datetime


def _serialize_message(doc: dict) -> ChatMessageOut:
    return ChatMessageOut(
        id=str(doc["_id"]),
        session_id=doc["session_id"],
        role=doc["role"],
        content=doc.get("content", ""),
        slide_updated=doc.get("slide_updated", False),
        created_at=doc.get("created_at", datetime.now(timezone.utc)),
    )


async def _touch_session(session_id: str, when: datetime):
    if not ObjectId.is_valid(session_id):
        return

    db = get_db()
    await db.slides.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"last_activity_at": when, "has_user_activity": True}},
    )


async def _save_message(
    session_id: str,
    role: Literal["user", "assistant"],
    content: str,
    *,
    slide_updated: bool = False,
) -> None:
    db = get_db()
    now = datetime.now(timezone.utc)
    await db.chat_messages.insert_one(
        {
            "session_id": session_id,
            "role": role,
            "content": content,
            "slide_updated": slide_updated,
            "created_at": now,
        }
    )
    await _touch_session(session_id, now)


async def _sse_generator(
    session_id: str,
    message: str,
    selected_document_ids: list[str],
    tagged_document_ids: list[str],
):
    await _save_message(session_id, "user", message)

    assistant_parts: list[str] = []
    slide_updated = False

    async for chunk in stream_agent_response(
        session_id,
        message,
        selected_document_ids=selected_document_ids,
        tagged_document_ids=tagged_document_ids,
    ):
        if not isinstance(chunk, str):
            chunk = str(chunk)

        normalized = chunk.strip()
        if normalized.startswith("__META__:") or normalized.startswith("META:"):
            try:
                prefix_length = 9 if normalized.startswith("__META__:") else 5
                meta = json.loads(normalized[prefix_length:])
                slide_updated = meta.get("slide_updated") is True
            except json.JSONDecodeError:
                pass
        elif not normalized.startswith("__EVENT__:"):
            assistant_parts.append(chunk)

        # SSE format: each data line followed by double newline
        for line in chunk.split("\n"):
            yield f"data: {line}\n"
        yield "\n"

    assistant_content = "".join(assistant_parts).strip()
    if assistant_content:
        await _save_message(
            session_id,
            "assistant",
            assistant_content,
            slide_updated=slide_updated,
        )


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


@router.get("/{session_id}/messages", response_model=list[ChatMessageOut])
async def list_messages(session_id: str):
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")

    db = get_db()
    session = await db.slides.find_one({"_id": ObjectId(session_id)}, {"_id": 1})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    cursor = db.chat_messages.find({"session_id": session_id}).sort("created_at", 1)
    return [_serialize_message(doc) async for doc in cursor]
