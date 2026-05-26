"""Slide session API routes."""
from datetime import datetime, timezone
import re
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from src.app.slide.models import (
    DEFAULT_MARKDOWN,
    SlideSessionCreate,
    SlideSessionOut,
    SlideSessionSummary,
    SlideSessionUpdate,
)
from src.app.slide.marp_export import (
    export_as_editable_pptx,
    export_as_html,
    export_as_pdf,
    export_as_pptx,
)
from src.libs.database import get_db

router = APIRouter(prefix="/api/slides", tags=["slides"])

EXPORT_MIME = {
    "html": "text/html",
    "pdf": "application/pdf",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "pptx-editable": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "md": "text/markdown",
}


def _activity_at(doc: dict) -> datetime:
    return doc.get("last_activity_at") or doc.get("updated_at") or doc.get("created_at") or datetime.now(timezone.utc)


def _preview(content: str, limit: int = 180) -> str:
    compact = re.sub(r"\s+", " ", content).strip()
    if len(compact) <= limit:
        return compact
    return f"{compact[: limit - 1].rstrip()}…"


def _serialize(doc: dict) -> SlideSessionOut:
    return SlideSessionOut(
        id=str(doc["_id"]),
        title=doc.get("title", "Untitled"),
        markdown=doc.get("markdown", ""),
        created_at=doc.get("created_at", datetime.now(timezone.utc)),
        updated_at=doc.get("updated_at", datetime.now(timezone.utc)),
        last_activity_at=_activity_at(doc),
    )


async def _summarize_sessions(
    docs: list[dict],
    match_previews: dict[str, str] | None = None,
) -> list[SlideSessionSummary]:
    if not docs:
        return []

    db = get_db()
    match_previews = match_previews or {}
    session_ids = [str(doc["_id"]) for doc in docs]

    counts = {session_id: 0 for session_id in session_ids}
    count_cursor = db.chat_messages.aggregate(
        [
            {"$match": {"session_id": {"$in": session_ids}}},
            {"$group": {"_id": "$session_id", "count": {"$sum": 1}}},
        ]
    )
    async for item in count_cursor:
        counts[item["_id"]] = item["count"]

    last_message_previews = {session_id: "" for session_id in session_ids}
    last_cursor = db.chat_messages.find({"session_id": {"$in": session_ids}}).sort("created_at", -1)
    async for message in last_cursor:
        session_id = message.get("session_id")
        if session_id in last_message_previews and not last_message_previews[session_id]:
            last_message_previews[session_id] = _preview(message.get("content", ""))
        if all(last_message_previews.values()):
            break

    return [
        SlideSessionSummary(
            id=session_id,
            title=doc.get("title", "Untitled"),
            created_at=doc.get("created_at", datetime.now(timezone.utc)),
            updated_at=doc.get("updated_at", datetime.now(timezone.utc)),
            last_activity_at=_activity_at(doc),
            message_count=counts.get(session_id, 0),
            last_message_preview=last_message_previews.get(session_id, ""),
            match_preview=match_previews.get(session_id),
        )
        for doc, session_id in zip(docs, session_ids)
    ]


def _session_sort_pipeline(limit: int) -> list[dict]:
    return [
        {
            "$addFields": {
                "_effective_last_activity_at": {
                    "$ifNull": [
                        "$last_activity_at",
                        {"$ifNull": ["$updated_at", "$created_at"]},
                    ]
                }
            }
        },
        {"$sort": {"_effective_last_activity_at": -1}},
        {"$limit": limit},
    ]


async def _meaningful_session_match() -> dict:
    db = get_db()
    active_session_ids = await db.chat_messages.distinct("session_id")
    active_object_ids = [
        ObjectId(session_id)
        for session_id in active_session_ids
        if ObjectId.is_valid(session_id)
    ]

    return {
        "$or": [
            {"has_user_activity": True},
            {"_id": {"$in": active_object_ids}},
            {
                "$and": [
                    {"title": {"$ne": "New Presentation"}},
                    {"markdown": {"$ne": DEFAULT_MARKDOWN}},
                ]
            },
        ]
    }


@router.get("", response_model=list[SlideSessionSummary])
async def list_sessions(
    q: str = Query(default=""),
    limit: int = Query(default=50, ge=1, le=100),
):
    db = get_db()
    query = q.strip()
    meaningful_match = await _meaningful_session_match()

    if not query:
        docs = [
            doc async for doc in db.slides.aggregate(
                [
                    {"$match": meaningful_match},
                    *_session_sort_pipeline(limit),
                ]
            )
        ]
        return await _summarize_sessions(docs)

    pattern = re.escape(query)
    regex = {"$regex": pattern, "$options": "i"}

    match_previews: dict[str, str] = {}
    matched_session_ids: set[str] = set()
    message_cursor = db.chat_messages.find({"content": regex}).sort("created_at", -1)
    async for message in message_cursor:
        session_id = message.get("session_id")
        if not session_id:
            continue
        matched_session_ids.add(session_id)
        if session_id not in match_previews:
            match_previews[session_id] = _preview(message.get("content", ""))

    object_ids = [ObjectId(session_id) for session_id in matched_session_ids if ObjectId.is_valid(session_id)]
    pipeline: list[dict] = [
        {
            "$match": {
                "$and": [
                    meaningful_match,
                    {"$or": [{"title": regex}, {"_id": {"$in": object_ids}}]},
                ]
            }
        },
        *_session_sort_pipeline(limit),
    ]
    docs = [doc async for doc in db.slides.aggregate(pipeline)]

    for doc in docs:
        session_id = str(doc["_id"])
        if session_id not in match_previews and re.search(pattern, doc.get("title", ""), re.IGNORECASE):
            match_previews[session_id] = _preview(doc.get("title", ""))

    return await _summarize_sessions(docs, match_previews)


@router.post("", response_model=SlideSessionOut, status_code=201)
async def create_session(body: SlideSessionCreate):
    db = get_db()
    now = datetime.now(timezone.utc)
    doc = {
        "title": body.title,
        "markdown": DEFAULT_MARKDOWN,
        "created_at": now,
        "updated_at": now,
        "last_activity_at": now,
        "has_user_activity": False,
    }
    result = await db.slides.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize(doc)


@router.get("/{session_id}", response_model=SlideSessionOut)
async def get_session(session_id: str):
    db = get_db()
    doc = await db.slides.find_one({"_id": ObjectId(session_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    return _serialize(doc)


@router.put("/{session_id}", response_model=SlideSessionOut)
async def update_session(session_id: str, body: SlideSessionUpdate):
    db = get_db()
    now = datetime.now(timezone.utc)
    updates: dict = {"updated_at": now, "last_activity_at": now}
    if body.title is not None:
        updates["title"] = body.title
        updates["has_user_activity"] = True
    if body.markdown is not None:
        updates["markdown"] = body.markdown
        updates["has_user_activity"] = True

    result = await db.slides.find_one_and_update(
        {"_id": ObjectId(session_id)},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    return _serialize(result)


@router.get("/{session_id}/export")
async def export_session(
    session_id: str,
    format: Literal["html", "pdf", "pptx", "pptx-editable", "md"] = Query(default="html"),
):
    db = get_db()
    doc = await db.slides.find_one({"_id": ObjectId(session_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")

    markdown: str = doc.get("markdown", "")
    title = doc.get("title", "slides").replace(" ", "_")

    if format == "md":
        return Response(
            content=markdown.encode("utf-8"),
            media_type=EXPORT_MIME["md"],
            headers={"Content-Disposition": f'attachment; filename="{title}.md"'},
        )

    try:
        if format == "html":
            data = await export_as_html(markdown)
        elif format == "pdf":
            data = await export_as_pdf(markdown)
        elif format == "pptx":
            data = await export_as_pptx(markdown)
        else:  # pptx-editable
            data = await export_as_editable_pptx(markdown)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    extension = "pptx" if format == "pptx-editable" else format
    return Response(
        content=data,
        media_type=EXPORT_MIME[format],
        headers={"Content-Disposition": f'attachment; filename="{title}.{extension}"'},
    )
