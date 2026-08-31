"""NAV schedule tests, including the brief's two sanity checks."""

from decimal import Decimal

import pytest

from riskview.analytics import compute_fund_analytics


@pytest.fixture(scope="module")
def fund_i(sample_result):
    flows = [cf for cf in sample_result.cashflows if cf.fund_name == "Fund I"]
    return compute_fund_analytics(1, flows)


def test_sanity_nav_at_time_zero_is_zero(fund_i):
    """Exact, not approximate: the IRR is by definition the rate that zeroes PV at the first flow date."""
    for schedule in [*fund_i.nav_schedules.values(), fund_i.fund_nav_schedule]:
        assert schedule.points[0].nav == Decimal("0.00")


def test_sanity_nav_at_final_date_equals_terminal_value(fund_i, sample_result):
    """Nothing is left to discount forward at the final date, so NAV there is that date's own cashflow."""
    for currency, schedule in fund_i.nav_schedules.items():
        final = schedule.points[-1]
        terminal = sum(
            cf.amount_local
            for cf in sample_result.cashflows
            if cf.fund_name == "Fund I" and cf.currency == currency and cf.cashflow_date == final.date
        )
        assert final.nav == pytest.approx(terminal)


def test_currency_irrs_are_plausible(fund_i):
    # quarterly coupon / principal: GBP 2.5m/100m, EUR 3m/150m, USD 6m/200m
    assert fund_i.currency_irr["GBP"] == pytest.approx(0.0995, abs=5e-4)
    assert fund_i.currency_irr["EUR"] == pytest.approx(0.0789, abs=5e-4)
    assert fund_i.currency_irr["USD"] == pytest.approx(0.1205, abs=5e-4)


def test_fund_irr_within_currency_range(fund_i):
    rates = fund_i.currency_irr.values()
    assert min(rates) < fund_i.fund_irr < max(rates)


def test_schedule_has_21_quarterly_points_per_currency(fund_i):
    for schedule in fund_i.nav_schedules.values():
        assert len(schedule.points) == 21


def test_open_exposure_at_final_date_is_zero(fund_i):
    for schedule in fund_i.nav_schedules.values():
        assert schedule.points[-1].open_exposure == Decimal("0.00")


def test_open_exposure_at_inception_equals_invested_amount(fund_i):
    # after paying out the investment, the open position is worth what was invested
    assert fund_i.nav_schedules["GBP"].points[0].open_exposure == Decimal("100000000.00")


def test_nav_equals_open_exposure_plus_todays_flow(fund_i, sample_result):
    schedule = fund_i.nav_schedules["USD"]
    flows_by_date = {}
    for cf in sample_result.cashflows:
        if cf.fund_name == "Fund I" and cf.currency == "USD":
            flows_by_date[cf.cashflow_date] = flows_by_date.get(cf.cashflow_date, Decimal(0)) + cf.amount_local
    for point in schedule.points:
        assert point.nav - point.open_exposure == pytest.approx(flows_by_date[point.date])


def test_empty_cashflows_raise():
    with pytest.raises(ValueError, match="no cashflows"):
        compute_fund_analytics(99, [])


def test_mixed_funds_raise(sample_result):
    with pytest.raises(ValueError, match="multiple funds"):
        compute_fund_analytics(1, list(sample_result.cashflows))
