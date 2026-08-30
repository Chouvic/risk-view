from datetime import date

import pytest

from riskview.analytics import IrrError, xirr, xnpv


def test_xnpv_zero_rate_is_plain_sum():
    flows = [(date(2025, 1, 1), -100.0), (date(2026, 1, 1), 110.0)]
    assert xnpv(0.0, flows) == pytest.approx(10.0)


def test_xnpv_empty_flows():
    assert xnpv(0.1, []) == 0.0


def test_xirr_one_year_double_is_100_percent():
    flows = [(date(2025, 1, 1), -100.0), (date(2026, 1, 1), 200.0)]
    assert xirr(flows) == pytest.approx(1.0, abs=1e-6)


def test_xirr_one_year_10_percent():
    flows = [(date(2025, 1, 1), -100.0), (date(2026, 1, 1), 110.0)]
    assert xirr(flows) == pytest.approx(0.10, abs=1e-6)


def test_xirr_solution_zeroes_npv():
    flows = [
        (date(2025, 9, 30), -100.0),
        (date(2026, 9, 30), 5.0),
        (date(2027, 9, 30), 105.0),
    ]
    rate = xirr(flows)
    assert xnpv(rate, flows) == pytest.approx(0.0, abs=1e-8)


def test_xirr_negative_irr():
    flows = [(date(2025, 1, 1), -100.0), (date(2026, 1, 1), 90.0)]
    assert xirr(flows) == pytest.approx(-0.10, abs=1e-6)


def test_xirr_all_positive_flows_rejected():
    with pytest.raises(IrrError):
        xirr([(date(2025, 1, 1), 100.0), (date(2026, 1, 1), 110.0)])


def test_xirr_all_negative_flows_rejected():
    with pytest.raises(IrrError):
        xirr([(date(2025, 1, 1), -100.0), (date(2026, 1, 1), -110.0)])
