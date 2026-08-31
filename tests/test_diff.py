"""The version diff, driven by the two revision samples.

samples/cashflows_rev_early_repayment.csv and cashflows_rev_fx_update.csv are
full Fund I restatements of samples/cashflows.csv. These tests double as their
validation — each must ingest cleanly — and pin the two stories they tell: an
early return of money shrinks the hedge programme, while an FX restatement of
the base amounts moves the fund-level view and leaves the hedges alone.
"""

from datetime import date
from pathlib import Path

import pytest

from riskview.analytics import compute_fund_analytics, diff_versions
from riskview.ingestion import ingest_file

SAMPLES = Path(__file__).resolve().parents[1] / "samples"


@pytest.fixture(scope="module")
def original():
    result = ingest_file(SAMPLES / "cashflows.csv")
    return [cf for cf in result.cashflows if cf.fund_name == "Fund I"]


def _revision(filename: str) -> list:
    result = ingest_file(SAMPLES / filename)
    assert result.summary()["accepted"] > 0
    return list(result.cashflows)


def _diff(old_cashflows, new_cashflows):
    return diff_versions(
        old_cashflows,
        new_cashflows,
        compute_fund_analytics(1, old_cashflows),
        compute_fund_analytics(1, new_cashflows),
        1,
        2,
    )


def test_early_repayment_shrinks_the_hedge_programme(original):
    diff = _diff(original, _revision("cashflows_rev_early_repayment.csv"))

    # The principal comes back on 30/09/2027 instead of 30/09/2030...
    assert [(row.cashflow_type, row.cashflow_date) for row in diff.added] == [
        ("Principal Repayment", date(2027, 9, 30))
    ]
    # ...so the old repayment and every later interest payment disappear.
    assert len(diff.removed) == 12
    assert {row.currency for row in diff.removed} == {"GBP"}
    assert max(row.cashflow_date for row in diff.removed) == date(2030, 9, 30)
    assert diff.changed == ()

    # Only the GBP position reprices; EUR and USD are untouched.
    assert set(diff.currency_irr) == {"GBP"}
    assert diff.fund_irr.old != diff.fund_irr.new

    # The GBP hedge programme ends three years earlier: rolls after the early
    # repayment vanish (new_notional None), earlier rolls resize.
    assert {change.sell_currency for change in diff.hedge_changes} == {"GBP"}
    vanished = [c for c in diff.hedge_changes if c.new_notional is None]
    assert len(vanished) == 12
    assert min(c.trade_date for c in vanished) == date(2027, 9, 30)
    assert all(c.old_notional is not None for c in diff.hedge_changes)


def test_fx_update_moves_the_base_view_but_not_the_hedges(original):
    diff = _diff(original, _revision("cashflows_rev_fx_update.csv"))

    # Same dates, same local amounts: nothing added or removed, only GBP base
    # amounts restated at the new rate.
    assert diff.added == () and diff.removed == ()
    assert {row.currency for row in diff.changed} == {"GBP"}
    assert len(diff.changed) == 21
    assert all(row.old_amount_local == row.new_amount_local for row in diff.changed)
    assert all(row.old_amount_base != row.new_amount_base for row in diff.changed)

    # Hedges are sized from local-currency open exposure, so an FX restatement
    # changes the fund-level (base) IRR and nothing about the hedge programme.
    assert diff.fund_irr.old != diff.fund_irr.new
    assert diff.currency_irr == {}
    assert diff.hedge_changes == ()


def test_diff_is_served_over_the_api(empty_client):
    for filename in ("cashflows.csv", "cashflows_rev_fx_update.csv"):
        path = SAMPLES / filename
        response = empty_client.post("/ingest", files={"file": (filename, path.read_bytes())})
        assert response.status_code == 200, response.text

    diff = empty_client.get("/funds/1/versions/diff", params={"from_version": 1}).json()

    assert (diff["from_version"], diff["to_version"]) == (1, 2)
    assert diff["added"] == [] and diff["removed"] == []
    assert len(diff["changed"]) == 21
    assert diff["hedge_changes"] == []
    assert diff["fund_irr"]["old"] != diff["fund_irr"]["new"]

    explicit = empty_client.get(
        "/funds/1/versions/diff", params={"from_version": 1, "to_version": 2}
    ).json()
    assert explicit == diff

    missing = empty_client.get("/funds/1/versions/diff", params={"from_version": 99})
    assert missing.status_code == 404
    assert missing.json()["detail"] == "fund 1 has no version 99"
