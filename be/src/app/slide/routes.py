"""Slide session API routes."""
from datetime import datetime, timezone
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from src.app.slide.models import (
    DEFAULT_MARKDOWN,
    SlideSessionCreate,
    SlideSessionOut,
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


def _serialize(doc: dict) -> SlideSessionOut:
    return SlideSessionOut(
        id=str(doc["_id"]),
        title=doc.get("title", "Untitled"),
        markdown=doc.get("markdown", ""),
        created_at=doc.get("created_at", datetime.now(timezone.utc)),
        updated_at=doc.get("updated_at", datetime.now(timezone.utc)),
    )


@router.post("", response_model=SlideSessionOut, status_code=201)
async def create_session(body: SlideSessionCreate):
    db = get_db()
    now = datetime.now(timezone.utc)
    doc = {
        "title": body.title,
        "markdown": DEFAULT_MARKDOWN,
        "created_at": now,
        "updated_at": now,
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
    updates: dict = {"updated_at": datetime.now(timezone.utc)}
    if body.title is not None:
        updates["title"] = body.title
    if body.markdown is not None:
        updates["markdown"] = body.markdown

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
