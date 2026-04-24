"""Sandboxed Python code execution for chart generation.

Runs user-supplied matplotlib code in a subprocess with a timeout and
writes the produced figure to ``uploads/charts/<timestamp>.png``.
Returns the web-servable path (``/uploads/charts/...``).
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from textwrap import dedent

from loguru import logger

# Default chart dimensions — tuned for Marp 16:9 slide
CHART_WIDTH_IN = 7
CHART_HEIGHT_IN = 5
CHART_DPI = 120
EXEC_TIMEOUT_SECONDS = 30

UPLOADS_ROOT = Path("uploads")
CHARTS_DIR = UPLOADS_ROOT / "charts"


def run_python_code(python_code: str) -> str:
    """Execute ``python_code`` (expected to produce a matplotlib chart) and
    save the figure to disk.

    The caller's code is wrapped so it:
      * uses the non-interactive ``Agg`` backend
      * gets a default figure size/dpi
      * redirects ``plt.show()`` to ``plt.savefig(<out_path>)``

    Returns
    -------
    str
        The web-accessible URL path for the saved chart, e.g.
        ``/uploads/charts/chart-20250101_120000-abcd1234.png``.

    Raises
    ------
    RuntimeError
        If the subprocess exits with a non-zero code, times out, or no
        image file is produced.
    """
    CHARTS_DIR.mkdir(parents=True, exist_ok=True)

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    short = uuid.uuid4().hex[:8]
    out_name = f"chart-{ts}-{short}.png"
    out_path = (CHARTS_DIR / out_name).resolve()

    wrapper = dedent(f"""
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        plt.rcParams["figure.figsize"] = ({CHART_WIDTH_IN}, {CHART_HEIGHT_IN})
        plt.rcParams["figure.dpi"] = {CHART_DPI}
        plt.rcParams["savefig.bbox"] = "tight"

        _OUT_PATH = r"{out_path}"

        def _save_and_close(*_a, **_kw):
            plt.savefig(_OUT_PATH, dpi={CHART_DPI})
            plt.close("all")

        # Intercept plt.show so user code that ends with plt.show() still saves.
        plt.show = _save_and_close

        # ---- user code start ----
    """).lstrip("\n")

    script = wrapper + python_code + "\n\n# ---- user code end ----\n_save_and_close()\n"

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".py", delete=False, encoding="utf-8"
    ) as f:
        f.write(script)
        script_path = f.name

    try:
        logger.info(f"[run_python_code] executing script -> {out_path}")
        proc = subprocess.run(
            [sys.executable, script_path],
            capture_output=True,
            text=True,
            timeout=EXEC_TIMEOUT_SECONDS,
        )
        if proc.returncode != 0:
            raise RuntimeError(
                f"Python code failed (exit {proc.returncode}):\n"
                f"STDERR:\n{proc.stderr.strip()}"
            )
        if not out_path.exists():
            raise RuntimeError(
                "Python code completed but no chart image was produced. "
                "Ensure your code creates a matplotlib figure."
            )
    except subprocess.TimeoutExpired as e:
        raise RuntimeError(
            f"Python code timed out after {EXEC_TIMEOUT_SECONDS}s."
        ) from e
    finally:
        try:
            Path(script_path).unlink(missing_ok=True)
        except Exception:
            pass

    # Return web URL (served by FastAPI /uploads mount)
    return f"/uploads/charts/{out_name}"
