from pathlib import Path

from src.app.slide.marp_export import _prepare_markdown_for_browser_export


def test_prepare_markdown_for_browser_export_rewrites_upload_urls(tmp_path):
    uploads_root = Path("/app/uploads")
    uploads_root.mkdir(parents=True, exist_ok=True)

    markdown = "\n".join(
        [
            "# Demo",
            "",
            "![chart](/uploads/charts/chart.png)",
            "backgroundImage: url('/uploads/images/bg.png')",
        ]
    )

    prepared = _prepare_markdown_for_browser_export(markdown, tmp_path)

    assert "![chart](./uploads/charts/chart.png)" in prepared
    assert "url('./uploads/images/bg.png')" in prepared
    assert (tmp_path / "uploads").exists()
