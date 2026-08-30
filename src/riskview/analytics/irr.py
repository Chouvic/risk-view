"""Dated (XIRR-style) NPV and IRR on an actual/365 day count.

Solved by bisection: slower than Newton but immune to bad starting points and
derivative blow-ups, which matters more than speed at this scale.
"""

from datetime import date
from typing import NamedTuple

DAYS_PER_YEAR = 365.0

_LOW, _HIGH = -0.999, 100.0
_TOLERANCE = 1e-12
_MAX_ITERATIONS = 200


class CashflowPoint(NamedTuple):
    """A (date, amount) pair — the minimal input a discounting problem needs.

    Not a domain model: xnpv/xirr are generic financial math, independent of
    what produced the numbers (a Cashflow's local or base amount, either
    works). A NamedTuple rather than a Pydantic model because this is an
    internal computation shape that never crosses a boundary — nothing here
    needs validating, only naming.
    """

    date: date
    amount: float


class IrrError(ValueError):
    """No IRR exists for the given cashflows (no sign change on the search interval)."""


def xnpv(rate: float, flows: list[CashflowPoint]) -> float:
    """NPV of dated flows discounted at `rate`, as of the earliest flow date."""
    if not flows:
        return 0.0
    t0 = min(d for d, _ in flows)
    return sum(cf / (1.0 + rate) ** ((d - t0).days / DAYS_PER_YEAR) for d, cf in flows)


def xirr(flows: list[CashflowPoint]) -> float:
    """The rate at which xnpv(rate, flows) == 0."""
    if not any(cf < 0 for _, cf in flows) or not any(cf > 0 for _, cf in flows):
        raise IrrError("IRR requires at least one negative and one positive cashflow")

    low, high = _LOW, _HIGH
    npv_low = xnpv(low, flows)
    if npv_low * xnpv(high, flows) > 0:
        raise IrrError(f"no IRR in rate interval [{_LOW}, {_HIGH}]")

    for _ in range(_MAX_ITERATIONS):
        mid = (low + high) / 2.0
        npv_mid = xnpv(mid, flows)
        if abs(npv_mid) < _TOLERANCE or (high - low) / 2.0 < _TOLERANCE:
            return mid
        if npv_low * npv_mid < 0:
            high = mid
        else:
            low, npv_low = mid, npv_mid
    return (low + high) / 2.0
