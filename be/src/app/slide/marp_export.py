"""Marp-based slide export utilities."""
import asyncio
import shutil
import tempfile
from pathlib import Path
import re
from loguru import logger

from src.libs.config import get_settings


async def export_as_html(markdown: str) -> bytes:
    """Render markdown → self-contained HTML via marp-cli."""
    return await _run_marp(markdown, output_format="html")


async def export_as_pdf(markdown: str) -> bytes:
    """Render markdown → PDF via marp-cli (requires Chrome/Chromium)."""
    return await _run_marp(markdown, output_format="pdf", browser_export=True)


async def export_as_pptx(markdown: str) -> bytes:
    """Render markdown → PPTX via marp-cli."""
    return await _run_marp(markdown, output_format="pptx", browser_export=True)


async def export_as_editable_pptx(markdown: str) -> bytes:
    """Render markdown → editable PPTX via marp-cli."""
    if shutil.which("libreoffice") is None and shutil.which("soffice") is None:
        raise RuntimeError(
            "Editable PPTX export requires LibreOffice Impress, but it is not "
            "installed in the backend container."
        )
    return await _run_marp(
        markdown,
        output_format="pptx",
        browser_export=True,
        extra_args=["--pptx-editable"],
    )


def _prepare_markdown_for_browser_export(markdown: str, workspace_dir: Path) -> str:
    """Rewrite app asset URLs so browser-based Marp exports can resolve them."""
    uploads_root = Path("/app/uploads")
    export_uploads = workspace_dir / "uploads"

    if uploads_root.exists():
        try:
            export_uploads.symlink_to(uploads_root, target_is_directory=True)
        except FileExistsError:
            pass
        except OSError:
            # Fallback for environments that do not support symlinks.
            shutil.copytree(uploads_root, export_uploads, dirs_exist_ok=True)

    def _replace(match: re.Match[str]) -> str:
        suffix = match.group(1)
        return f"./uploads/{suffix}"

    return re.sub(
        r"(?<![A-Za-z0-9+.-]:)(?<!//)/uploads/([^\s)\"'>]+)",
        _replace,
        markdown,
    )


async def _run_marp(
    markdown: str,
    output_format: str,
    browser_export: bool = False,
    extra_args: list[str] | None = None,
) -> bytes:
    settings = get_settings()
    marp = settings.marp_cli_path

    with tempfile.TemporaryDirectory() as tmpdir:
        workdir = Path(tmpdir)
        src = workdir / "slides.md"
        out = workdir / f"slides.{output_format}"
        prepared_markdown = (
            _prepare_markdown_for_browser_export(markdown, workdir)
            if browser_export
            else markdown
        )
        src.write_text(prepared_markdown, encoding="utf-8")

        cmd = [
            marp,
            str(src),
            f"--{output_format}",
            "--output",
            str(out),
            "--allow-local-files",
            *(extra_args or []),
        ]

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
