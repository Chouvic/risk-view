from datetime import date
from itertools import pairwise

import pytest

from riskview.analytics import compute_fund_analytics
from riskview.analytics.hedge import add_months, generate_hedges


@pytest.fixture(scope="module")
def fund_i(sample_result):
    flows = [cf for cf in sample_result.cashflows if cf.fund_name == "Fund I"]
    return compute_fund_analytics(1, flows)


def test_month_end_stays_month_end():
    assert add_months(date(2025, 9, 30), 3) == date(2025, 12, 31)
    assert add_months(date(2025, 12, 31), 3) == date(2026, 3, 31)
    assert add_months(date(2026, 3, 31), 3) == date(2026, 6, 30)
    assert add_months(date(2026, 6, 30), 3) == date(2026, 9, 30)


def test_mid_month_unchanged_day():
    assert add_months(date(2025, 1, 15), 3) == date(2025, 4, 15)


def test_year_rollover():
    assert add_months(date(2025, 11, 30), 3) == date(2026, 2, 28)


def test_no_hedges_for_base_currency(fund_i):
    assert generate_hedges(fund_i.nav_schedules["EUR"], "EUR") == ()
    assert not any(t.sell_currency == "EUR" for t in fund_i.hedges)


def test_hedges_cover_gbp_and_usd_only(fund_i):
    assert {t.sell_currency for t in fund_i.hedges} == {"GBP", "USD"}
    assert all(t.buy_currency == "EUR" for t in fund_i.hedges)


def test_one_trade_per_quarter_until_exit(fund_i):
    # 21 schedule dates; the final date has zero open exposure, so 20 rolls
    gbp = [t for t in fund_i.hedges if t.sell_currency == "GBP"]
    assert len(gbp) == 20


def test_rolls_are_3_months_and_contiguous(fund_i):
    gbp = sorted((t for t in fund_i.hedges if t.sell_currency == "GBP"), key=lambda t: t.trade_date)
    for trade in gbp:
        assert trade.value_date == add_months(trade.trade_date, 3)
    for previous, current in pairwise(gbp):
        assert current.trade_date == previous.value_date


def test_notional_is_100_percent_of_open_exposure(fund_i):
    schedule = fund_i.nav_schedules["GBP"]
    exposure_by_date = {p.date: p.open_exposure for p in schedule.points}
    for trade in fund_i.hedges:
        if trade.sell_currency == "GBP":
            assert trade.notional_sell == exposure_by_date[trade.trade_date]
            assert trade.coverage_ratio == 1.0


def test_first_trade_hedges_full_investment(fund_i):
    first = min((t for t in fund_i.hedges if t.sell_currency == "GBP"), key=lambda t: t.trade_date)
    assert first.trade_date == date(2025, 9, 30)
    assert first.notional_sell == 100_000_000
