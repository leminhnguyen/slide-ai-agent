"""LangChain tools for the slide AI agent."""
from typing import Optional, List
from datetime import datetime, timezone

from langchain_core.tools import tool
from langchain_core.runnables import RunnableConfig
from loguru import logger

from src.app.rag.qdrant_ops import search_with_filter as qdrant_search
from src.libs.database import get_db
from bson import ObjectId


def _get_context(config: RunnableConfig) -> dict:
    return config.get("configurable", {}).get("context", {})


@tool
async def get_outline(config: RunnableConfig) -> str:
    """Get the current markdown outline for the presentation."""
    ctx = _get_context(config)
    session_id = ctx.get("session_id", "")
    db = get_db()
    doc = await db.slides.find_one({"_id": ObjectId(session_id)})
    if not doc:
        return "No presentation found."
    return doc.get("markdown", "")


@tool
async def update_outline(new_markdown: str, config: RunnableConfig) -> str:
    """
    Replace the entire markdown outline with a new version.

    Args:
        new_markdown: The complete new Marp markdown content for the presentation.
    """
    ctx = _get_context(config)
    session_id = ctx.get("session_id", "")
    db = get_db()
    await db.slides.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"markdown": new_markdown, "updated_at": datetime.now(timezone.utc)}},
    )
    # Signal to the agent context that slides were updated
    ctx["slide_updated"] = True
    logger.info(f"Outline updated for session {session_id}")
    return "Presentation outline updated successfully."


@tool
async def search_documents(query: str, config: RunnableConfig) -> str:
    """
    Search uploaded reference documents for information relevant to the query.

    Args:
        query: The search query to look up in the uploaded documents.
    """
    ctx = _get_context(config)
    session_id = ctx.get("session_id", "")
    tagged_document_ids = ctx.get("tagged_document_ids", []) or []
    selected_document_ids = ctx.get("selected_document_ids", []) or []
    scoped_document_ids = tagged_document_ids or selected_document_ids

    results = await qdrant_search(
        session_id,
        query,
        top_k=5,
        doc_ids=scoped_document_ids,
    )
    if not results:
        if tagged_document_ids:
            return "No relevant information found in the tagged documents."
        if selected_document_ids:
            return "No relevant information found in the selected documents."
        return "No relevant information found in uploaded documents."

    parts = []
    for r in results:
        parts.append(f"[{r['filename']} | score={r['score']:.2f}]\n{r['text']}")
    return "\n\n---\n\n".join(parts)


@tool
async def add_slide(
    position: int,
    title: str,
    content: str,
    config: RunnableConfig,
) -> str:
    """
    Insert a new slide at a given 1-based position in the presentation.

    Args:
        position: 1-based index where the new slide should be inserted.
        title: The slide title (will become the # heading).
        content: The slide body content in markdown (bullets, paragraphs, etc.).
    """
    ctx = _get_context(config)
    session_id = ctx.get("session_id", "")
    db = get_db()
    doc = await db.slides.find_one({"_id": ObjectId(session_id)})
    if not doc:
        return "Presentation not found."

    markdown: str = doc.get("markdown", "")
    # Split into slides on --- separators
    slides = _split_slides(markdown)
    new_slide = f"# {title}\n\n{content}"

    # Clamp position
    pos = max(1, min(position, len(slides) + 1))
    slides.insert(pos - 1, new_slide)

    new_markdown = _join_slides(slides)
    await db.slides.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"markdown": new_markdown, "updated_at": datetime.now(timezone.utc)}},
    )
    ctx["slide_updated"] = True
    return f"Slide inserted at position {pos}."


@tool
async def delete_slide(position: int, config: RunnableConfig) -> str:
    """
    Delete a slide by its 1-based index. Cannot delete the first or last slide.

    Args:
        position: 1-based index of the slide to delete.
    """
    ctx = _get_context(config)
    session_id = ctx.get("session_id", "")
    db = get_db()
    doc = await db.slides.find_one({"_id": ObjectId(session_id)})
    if not doc:
        return "Presentation not found."

    markdown: str = doc.get("markdown", "")
    slides = _split_slides(markdown)

    if len(slides) <= 2:
        return "Cannot delete — presentation must have at least 2 slides."
    if position < 2 or position > len(slides) - 1:
        return f"Invalid position {position}. Can only delete slides 2 to {len(slides) - 1}."

    slides.pop(position - 1)
    new_markdown = _join_slides(slides)
    await db.slides.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"markdown": new_markdown, "updated_at": datetime.now(timezone.utc)}},
    )
    ctx["slide_updated"] = True
    return f"Slide {position} deleted."


# ── helpers ──────────────────────────────────────────────────────────

def _split_slides(markdown: str) -> list[str]:
    """Split markdown on --- separators, preserving front-matter."""
    lines = markdown.split("\n")
    slides: list[str] = []
    current: list[str] = []
    in_frontmatter = False
    frontmatter_done = False
    frontmatter_lines: list[str] = []

    for i, line in enumerate(lines):
        # Handle YAML front-matter (first ---)
        if i == 0 and line.strip() == "---":
            in_frontmatter = True
            frontmatter_lines.append(line)
            continue
        if in_frontmatter and not frontmatter_done:
            frontmatter_lines.append(line)
            if line.strip() == "---":
                in_frontmatter = False
                frontmatter_done = True
            continue

        if line.strip() == "---":
            slides.append("\n".join(current).strip())
            current = []
        else:
            current.append(line)

    if current:
        slides.append("\n".join(current).strip())

    # Prepend front-matter to first slide
    fm = "\n".join(frontmatter_lines)
    if slides and fm:
        slides[0] = fm + "\n\n" + slides[0]

    return slides


def _join_slides(slides: list[str]) -> str:
    return "\n\n---\n\n".join(slides)


AGENT_TOOLS = [get_outline, update_outline, search_documents, add_slide, delete_slide]
