from pathlib import Path

import pytest

from src.ai.tools import run_python_code as run_python_code_module


def test_run_python_code_rejects_blank_chart(tmp_path, monkeypatch):
    monkeypatch.setattr(run_python_code_module, "CHARTS_DIR", tmp_path / "charts")

    with pytest.raises(RuntimeError, match="no chart image was produced"):
        run_python_code_module.run_python_code("# no chart here")

    assert list((tmp_path / "charts").glob("*.png")) == []


def test_run_python_code_rejects_explicit_blank_figure(tmp_path, monkeypatch):
    monkeypatch.setattr(run_python_code_module, "CHARTS_DIR", tmp_path / "charts")

    with pytest.raises(RuntimeError, match="blank chart image"):
        run_python_code_module.run_python_code(
            "\n".join(
                [
                    "import matplotlib.pyplot as plt",
                    "plt.figure()",
                ]
            )
        )

    assert list((tmp_path / "charts").glob("*.png")) == []


def test_run_python_code_saves_non_blank_chart(tmp_path, monkeypatch):
    monkeypatch.setattr(run_python_code_module, "CHARTS_DIR", tmp_path / "charts")

    url = run_python_code_module.run_python_code(
        "\n".join(
            [
                "import matplotlib.pyplot as plt",
                "plt.bar(['Q1', 'Q2', 'Q3'], [12, 18, 15], color='#2563eb')",
                "plt.title('Revenue by Quarter')",
                "plt.ylabel('USD (k)')",
            ]
        )
    )

    assert url.startswith("/uploads/charts/chart-")
    saved_files = list((tmp_path / "charts").glob("*.png"))
    assert len(saved_files) == 1
    assert Path(saved_files[0]).stat().st_size > 0


def test_run_python_code_preserves_chart_when_user_calls_show(tmp_path, monkeypatch):
    monkeypatch.setattr(run_python_code_module, "CHARTS_DIR", tmp_path / "charts")

    url = run_python_code_module.run_python_code(
        "\n".join(
            [
                "import matplotlib.pyplot as plt",
                "plt.plot([1, 2, 3], [3, 1, 4], color='#dc2626', linewidth=2)",
                "plt.title('Trend')",
                "plt.show()",
            ]
        )
    )

    assert url.startswith("/uploads/charts/chart-")
    saved_files = list((tmp_path / "charts").glob("*.png"))
    assert len(saved_files) == 1
