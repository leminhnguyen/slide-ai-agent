"""RAG file processing — parse uploaded files into text chunks."""
import io
from pathlib import Path
from typing import List

import fitz  # PyMuPDF
from docx import Document
from loguru import logger


def parse_file(filename: str, content: bytes) -> List[str]:
    """Parse raw file bytes into a list of text chunks (one per page/paragraph)."""
    ext = Path(filename).suffix.lower()

    if ext == ".pdf":
        return _parse_pdf(content)
    elif ext in (".docx", ".doc"):
        return _parse_docx(content)
    elif ext in (".txt", ".md"):
        return _parse_text(content)
    else:
        raise ValueError(f"Unsupported file type: {ext}")


def _parse_pdf(content: bytes) -> List[str]:
    chunks: List[str] = []
    try:
        with fitz.open(stream=content, filetype="pdf") as doc:
            for page in doc:
                text = page.get_text().strip()
                if text:
                    chunks.append(text)
    except Exception as e:
        logger.warning(f"PDF parse failed: {e}")
        raise ValueError(
            "Failed to read PDF. The file may be corrupted, password-protected, or image-only."
        ) from e
    logger.info(f"PDF parsed: {len(chunks)} pages with text")
    return chunks


def _parse_docx(content: bytes) -> List[str]:
    doc = Document(io.BytesIO(content))
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    # Group into ~500-char chunks to keep embedding cost reasonable
    chunks: List[str] = []
    current = ""
    for para in paragraphs:
        if len(current) + len(para) > 500:
            if current:
                chunks.append(current)
            current = para
        else:
            current = f"{current}\n{para}" if current else para
    if current:
        chunks.append(current)
    logger.info(f"DOCX parsed: {len(chunks)} chunks")
    return chunks


def _parse_text(content: bytes) -> List[str]:
    text = content.decode("utf-8", errors="replace")
    # Split on double newlines (paragraphs), then chunk
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: List[str] = []
    current = ""
    for para in paragraphs:
        if len(current) + len(para) > 600:
            if current:
                chunks.append(current)
            current = para
        else:
            current = f"{current}\n\n{para}" if current else para
    if current:
        chunks.append(current)
    logger.info(f"Text parsed: {len(chunks)} chunks")
    return chunks
