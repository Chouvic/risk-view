"""The report script, run exactly as documented in the README."""

import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "fund_report.py"


def _run(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, check=check)


def test_single_fund_report_covers_the_part3_requirements(sample_csv_path):
    out = _run("--data", str(sample_csv_path), "--fund", "Fund I").stdout

    assert "Ingestion: 126 accepted, 3 corrected, 0 rejected" in out
    assert "Fund I — base currency EUR" in out
    assert "Fund II" not in out
    assert "Fund-level IRR" in out
    for currency in ("EUR", "GBP", "USD"):
        assert f"{currency} IRR" in out
        assert f"NAV schedule — Fund I, {currency}" in out
    assert "100,000,000.00" in out  # GBP open exposure at inception


def test_default_reports_every_fund():
    out = _run().stdout
    assert "Fund I — base currency EUR" in out
    assert "Fund II — base currency EUR" in out


def test_currency_filter_limits_nav_schedules():
    out = _run("--fund", "Fund I", "--currency", "gbp").stdout
    assert out.count("NAV schedule") == 1
    assert "NAV schedule — Fund I, GBP" in out


def test_unknown_fund_fails_with_available_names():
    run = _run("--fund", "Nope", check=False)
    assert run.returncode != 0
    assert "Fund I, Fund II" in run.stderr
