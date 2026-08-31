"""NAV schedule construction.

NAV(t) = PV at t of cashflows dated >= t, discounted at the position's IRR.
open_exposure(t) = PV of cashflows dated strictly > t, the value a hedge must cover.
"""

from datetime import date
from decimal import Decimal

from riskview.analytics.irr import DAYS_PER_YEAR, CashflowPoint
from riskview.schemas import NavPoint, NavSchedule

_CENT = Decimal("0.01")


def build_nav_schedule(
    fund_name: str,
    currency: str,
    irr: float,
    flows: list[CashflowPoint],
) -> NavSchedule:
    dates = sorted({d for d, _ in flows})
    points = tuple(
        NavPoint(
            date=t,
            nav=_pv_at(t, irr, flows, include_on_date=True),
            open_exposure=_pv_at(t, irr, flows, include_on_date=False),
        )
        for t in dates
    )
    return NavSchedule(fund_name=fund_name, currency=currency, irr=irr, points=points)


def _pv_at(t: date, rate: float, flows: list[CashflowPoint], include_on_date: bool) -> Decimal:
    pv = sum(
        cf / (1.0 + rate) ** ((d - t).days / DAYS_PER_YEAR)
        for d, cf in flows
        if d > t or (include_on_date and d == t)
    )
    quantized = Decimal(pv).quantize(_CENT)
    return quantized if quantized != 0 else Decimal("0.00")  # avoid -0.00
