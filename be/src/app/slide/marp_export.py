"""Marp-based slide export utilities."""
import asyncio
import shutil
import subprocess
import tempfile
from pathlib import Path
from loguru import logger

from src.libs.config import get_settings


async def export_as_html(markdown: str) -> bytes:
    """Render markdown → self-contained HTML via marp-cli."""
    return await _run_marp(markdown, output_format="html")


async def export_as_pdf(markdown: str) -> bytes:
    """Render markdown → PDF via marp-cli (requires Chrome/Chromium)."""
    return await _run_marp(markdown, output_format="pdf")


async def export_as_pptx(markdown: str) -> bytes:
    """Render markdown → PPTX via marp-cli."""
    return await _run_marp(markdown, output_format="pptx")


async def _run_marp(markdown: str, output_format: str) -> bytes:
    settings = get_settings()
    marp = settings.marp_cli_path

    with tempfile.TemporaryDirectory() as tmpdir:
        src = Path(tmpdir) / "slides.md"
        out = Path(tmpdir) / f"slides.{output_format}"
        src.write_text(markdown, encoding="utf-8")

        cmd = [marp, str(src), f"--{output_format}", "--output", str(out), "--allow-local-files"]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            logger.error(f"marp-cli failed: {stderr.decode()}")
            raise RuntimeError(f"marp-cli export failed: {stderr.decode()[:500]}")

        return out.read_bytes()
