"""LangChain tools for the slide AI agent."""
import base64
import os
import uuid
from io import BytesIO
from pathlib import Path
from typing import Annotated, Literal, Optional
from datetime import datetime, timezone

from langchain_core.tools import tool
from langchain_core.runnables import RunnableConfig
from langchain_core.callbacks.manager import adispatch_custom_event
from langchain_openai import ChatOpenAI
from loguru import logger
from openai import OpenAI
from PIL import Image

from src.ai.tools.run_python_code import run_python_code as _run_python_code
from src.app.rag.qdrant_ops import search_with_filter as qdrant_search
from src.app.slide.models import DEFAULT_THEME_FRONTMATTER
from src.libs.config import get_settings
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
    current_doc = await db.slides.find_one({"_id": ObjectId(session_id)})
    current_markdown = current_doc.get("markdown", "") if current_doc else ""
    normalized_markdown = _normalize_outline_markdown(new_markdown, current_markdown)
    await db.slides.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"markdown": normalized_markdown, "updated_at": datetime.now(timezone.utc)}},
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
async def search_web(query: str, config: RunnableConfig = None) -> str:
    """
    Search the public web for up-to-date information and return a concise summary with sources.

    Args:
        query: The search query to look up on the public web.
    """
    await adispatch_custom_event(
        "web_search_started",
        {"query": query},
        config=config,
    )

    settings = get_settings()
    if not settings.openai_api_key:
        return "Error: OPENAI_API_KEY is not configured."

    llm = ChatOpenAI(
        model=settings.openai_web_search_model,
        api_key=settings.openai_api_key,
        use_responses_api=True,
    )
    llm_with_tools = llm.bind_tools([{"type": "web_search_preview"}])
    try:
        response = await llm_with_tools.ainvoke(
            (
                "Search the public web for this query and answer concisely. "
                "Prioritize recent, factual information useful for writing slides.\n\n"
                f"Query: {query}"
            )
        )
    except Exception as e:
        logger.exception("search_web failed")
        return f"Error searching the web: {e}"

    answer = (getattr(response, "text", None) or "").strip()
    if not answer:
        answer = "No relevant information found on the web."

    unique_sources: list[dict] = []
    seen_urls: set[str] = set()
    for block in getattr(response, "content_blocks", []) or []:
        if block.get("type") != "text":
            continue
        for annotation in block.get("annotations", []) or []:
            url = annotation.get("url")
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            unique_sources.append(annotation)
            if len(unique_sources) >= 5:
                break
        if len(unique_sources) >= 5:
            break

    if not unique_sources:
        return answer

    await adispatch_custom_event(
        "web_search_links",
        {
            "query": query,
            "links": [
                {
                    "title": source.get("title") or source.get("url"),
                    "url": source.get("url"),
                }
                for source in unique_sources
                if source.get("url")
            ],
        },
        config=config,
    )

    source_lines = []
    for source in unique_sources:
        title = source.get("title") or source.get("url")
        url = source.get("url")
        source_lines.append(f"- [{title}]({url})")

    return f"{answer}\n\nSources:\n" + "\n".join(source_lines)


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


def _extract_frontmatter(markdown: str) -> tuple[str, str]:
    """Return ``(frontmatter, body)`` from a Marp markdown document."""
    stripped = markdown.strip()
    if not stripped.startswith("---"):
        return "", stripped

    lines = stripped.split("\n")
    if not lines or lines[0].strip() != "---":
        return "", stripped

    for index in range(1, len(lines)):
        if lines[index].strip() == "---":
            frontmatter = "\n".join(lines[: index + 1]).strip()
            body = "\n".join(lines[index + 1 :]).strip()
            return frontmatter, body

    return "", stripped


def _split_body_slides(markdown_body: str) -> list[str]:
    return [slide.strip() for slide in markdown_body.split("\n---\n") if slide.strip()]


def _normalize_outline_markdown(new_markdown: str, current_markdown: str) -> str:
    """Keep the current/default Marp shell so agent-generated decks stay polished."""
    current_frontmatter, _ = _extract_frontmatter(current_markdown)
    incoming_frontmatter, incoming_body = _extract_frontmatter(new_markdown)

    frontmatter = incoming_frontmatter or current_frontmatter or DEFAULT_THEME_FRONTMATTER
    body = incoming_body if incoming_frontmatter else new_markdown.strip()
    slides = _split_body_slides(body)

    if not slides and body:
        slides = [body.strip()]

    if not slides:
        slides = ["# Untitled Presentation"]

    slides[0] = f"{frontmatter}\n\n{slides[0].lstrip()}"
    return _join_slides(slides)


def _join_slides(slides: list[str]) -> str:
    return "\n\n---\n\n".join(slides)


# ── helpers for image / chart tools ───────────────────────────────────

UPLOADS_ROOT = Path("uploads")
IMAGES_DIR = UPLOADS_ROOT / "images"


def _save_png_bytes(data: bytes, subdir: Path, prefix: str = "img") -> str:
    """Save PNG bytes to ``subdir`` and return the web URL path."""
    subdir.mkdir(parents=True, exist_ok=True)
    name = f"{prefix}-{datetime.now().strftime('%Y%m%d_%H%M%S')}-{uuid.uuid4().hex[:8]}.png"
    path = subdir / name
    img = Image.open(BytesIO(data))
    img.save(path, format="PNG")
    # Path relative to uploads root → /uploads/<rel>
    rel = path.relative_to(UPLOADS_ROOT)
    return f"/uploads/{rel.as_posix()}"


def _local_path_from_url(url: str) -> Path:
    """Map a ``/uploads/...`` URL back to the on-disk path."""
    if url.startswith("/uploads/"):
        return UPLOADS_ROOT / url[len("/uploads/"):]
    return Path(url)


def _build_slide_asset_html(image_url: str, alt_text: str) -> str:
    """Return a slide-friendly HTML block for inserted assets."""
    safe_alt = (
        alt_text.replace("&", "&amp;")
        .replace('"', "&quot;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    return (
        "\n\n"
        '<div style="text-align:center; margin-top: 16px;">'
        f'<img src="{image_url}" alt="{safe_alt}" '
        'style="display:inline-block; max-width: 100%; max-height: 260px; object-fit: contain;" />'
        "</div>"
    )


# ── tools: chart generation & image generation ────────────────────────


@tool
async def run_python_code(
    python_code: Annotated[str, "Python code using matplotlib, numpy, and optionally pandas. Will auto-save the figure; plt.show() is optional."],
) -> str:
    """Generate a chart image by executing matplotlib Python code.

    Use this when the user asks for a chart, graph or visualisation.
    The code runs in a sandboxed subprocess with a 30s timeout.
    The Agg backend is set automatically and ``plt.show()`` is intercepted
    so any figure you create is persisted.

    Args:
        python_code: Python source code that creates a matplotlib figure.

    Returns:
        A web URL path to the saved PNG (e.g. ``/uploads/charts/chart-...png``).
        Use this path directly in the markdown outline as ``![caption](URL)``.
    """
    try:
        logger.info("[tool run_python_code] received source code:\n{}", python_code.rstrip() or "<empty>")
        url = _run_python_code(python_code)
        return f"Chart saved. Image URL: {url}"
    except Exception as e:
        logger.exception("run_python_code failed")
        return f"Error executing code: {e}"


@tool
async def generate_image(
    prompt: Annotated[str, "Text description of the image to generate"],
    size: Annotated[
        Literal["1024x1024", "1024x1536", "1536x1024"],
        "Image dimensions; 1536x1024 is best for slides",
    ] = "1536x1024",
    quality: Annotated[
        Literal["low", "medium", "high", "auto"],
        "Image quality; prefer 'low' for drafts, 'medium' for final",
    ] = "low",
) -> str:
    """Generate an image from a text prompt via OpenAI's Images API (gpt-image-1).

    Use for illustrations, diagrams, or concept art to embed in a slide.

    Args:
        prompt: What the image should depict.
        size: Output dimensions.
        quality: Generation quality.

    Returns:
        A web URL path like ``/uploads/images/img-...png``.
        Use it in markdown as ``![alt](URL)``.
    """
    settings = get_settings()
    if not settings.openai_api_key:
        return "Error: OPENAI_API_KEY is not configured."
    try:
        client = OpenAI(api_key=settings.openai_api_key)
        resp = client.images.generate(
            model="gpt-image-1",
            prompt=prompt,
            n=1,
            size=size,
            quality=quality,
        )
        b64 = resp.data[0].b64_json
        url = _save_png_bytes(base64.b64decode(b64), IMAGES_DIR, prefix="img")
        logger.info(f"[tool generate_image] saved → {url}")
        return f"Image generated. URL: {url}"
    except Exception as e:
        logger.exception("generate_image failed")
        return f"Error generating image: {e}"


@tool
async def edit_image(
    image_url: Annotated[str, "URL path of an existing image (e.g. /uploads/images/...png)"],
    prompt: Annotated[str, "Description of the desired edit"],
    size: Annotated[
        Literal["1024x1024", "1024x1536", "1536x1024"],
        "Output dimensions",
    ] = "1536x1024",
) -> str:
    """Edit an existing image using OpenAI's Images API.

    The ``image_url`` must be a previously generated/uploaded image
    accessible under ``/uploads/``.

    Args:
        image_url: URL path of the source image.
        prompt: What to change or add.
        size: Output dimensions.

    Returns:
        URL path of the edited image.
    """
    settings = get_settings()
    if not settings.openai_api_key:
        return "Error: OPENAI_API_KEY is not configured."
    src = _local_path_from_url(image_url)
    if not src.exists():
        return f"Error: source image not found at {src}"
    try:
        client = OpenAI(api_key=settings.openai_api_key)
        with src.open("rb") as f:
            resp = client.images.edit(
                model="gpt-image-1",
                image=f,
                prompt=prompt,
                n=1,
                size=size,
            )
        b64 = resp.data[0].b64_json
        url = _save_png_bytes(base64.b64decode(b64), IMAGES_DIR, prefix="img-edit")
        logger.info(f"[tool edit_image] saved → {url}")
        return f"Image edited. URL: {url}"
    except Exception as e:
        logger.exception("edit_image failed")
        return f"Error editing image: {e}"


# ── tools: targeted slide edit & image-in-slide ───────────────────────


_EDIT_SLIDE_SYSTEM_PROMPT = (
    "You are a Marp markdown slide editor. You receive ONE slide's markdown "
    "content plus an edit instruction. Return ONLY the updated markdown for "
    "that slide (no --- separators, no code fences, no preamble). Preserve "
    "existing content unless the instruction says to change it. Keep a single "
    "'# Title' heading. Keep the slide concise (max ~8 lines total)."
)


@tool
async def edit_slide(
    slide_number: Annotated[int, "1-based slide index to edit"],
    instruction: Annotated[str, "What to change on that slide"],
    config: RunnableConfig,
) -> str:
    """Apply a targeted edit to a single slide using an LLM assistant.

    Use this for focused changes to one slide (reword a bullet, tighten
    wording, translate, add a bullet) without rewriting the whole deck.

    Args:
        slide_number: 1-based slide index.
        instruction: Natural-language edit instruction.
    """
    ctx = _get_context(config)
    session_id = ctx.get("session_id", "")
    db = get_db()
    doc = await db.slides.find_one({"_id": ObjectId(session_id)})
    if not doc:
        return "Presentation not found."

    markdown: str = doc.get("markdown", "")
    slides = _split_slides(markdown)
    if slide_number < 1 or slide_number > len(slides):
        return f"Invalid slide_number {slide_number}. Valid range: 1..{len(slides)}."

    settings = get_settings()
    llm = ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        streaming=False,
    )
    messages = [
        {"role": "system", "content": _EDIT_SLIDE_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Current slide markdown:\n```\n{slides[slide_number - 1]}\n```\n\n"
                f"Instruction:\n{instruction}\n\n"
                "Return the updated slide markdown only."
            ),
        },
    ]
    try:
        response = await llm.ainvoke(messages)
        new_slide_md = (response.content or "").strip()
        # Strip any accidental code fence the model added
        if new_slide_md.startswith("```"):
            new_slide_md = new_slide_md.split("\n", 1)[1] if "\n" in new_slide_md else ""
            if new_slide_md.endswith("```"):
                new_slide_md = new_slide_md[:-3].rstrip()
        if not new_slide_md:
            return "Error: LLM returned empty slide content."
        slides[slide_number - 1] = new_slide_md
    except Exception as e:
        logger.exception("edit_slide LLM call failed")
        return f"Error calling LLM: {e}"

    await db.slides.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"markdown": _join_slides(slides), "updated_at": datetime.now(timezone.utc)}},
    )
    ctx["slide_updated"] = True
    return f"Slide {slide_number} updated."


@tool
async def add_image_to_slide(
    slide_number: Annotated[int, "1-based slide index where the image should be inserted"],
    image_url: Annotated[str, "URL path of the image (e.g. /uploads/charts/...png or /uploads/images/...png)"],
    alt_text: Annotated[Optional[str], "Optional alt/caption text"] = None,
    config: RunnableConfig = None,
) -> str:
    """Insert an image reference into a specific slide.

    Appends ``![alt](image_url)`` to the bottom of the slide's markdown.
    Pair this with ``run_python_code``, ``generate_image``, or ``edit_image``
    after they return an image URL.

    Args:
        slide_number: 1-based slide index.
        image_url: URL path returned by the image-producing tools.
        alt_text: Optional alt/caption text.
    """
    ctx = _get_context(config)
    session_id = ctx.get("session_id", "")
    db = get_db()
    doc = await db.slides.find_one({"_id": ObjectId(session_id)})
    if not doc:
        return "Presentation not found."

    markdown: str = doc.get("markdown", "")
    slides = _split_slides(markdown)
    if slide_number < 1 or slide_number > len(slides):
        return f"Invalid slide_number {slide_number}. Valid range: 1..{len(slides)}."

    alt = alt_text or os.path.basename(image_url)
    image_html = _build_slide_asset_html(image_url, alt)
    slides[slide_number - 1] = slides[slide_number - 1].rstrip() + image_html

    await db.slides.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"markdown": _join_slides(slides), "updated_at": datetime.now(timezone.utc)}},
    )
    ctx["slide_updated"] = True
    return f"Image inserted into slide {slide_number}."


AGENT_TOOLS = [
    get_outline,
    update_outline,
    search_documents,
    search_web,
    add_slide,
    delete_slide,
    edit_slide,
    run_python_code,
    generate_image,
    edit_image,
    add_image_to_slide,
]
