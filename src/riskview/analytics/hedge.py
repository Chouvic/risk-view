"""FX hedge recommendation: 3-month rolling forwards at 100% of NAV.

At each schedule date the fund sells forward its open local-currency exposure
against the base currency, maturing at the next quarterly roll. The base-currency
position needs no hedge, and no trade is generated once the exposure is zero
(i.e. at and after the final cashflow date).
"""

import calendar
from datetime import date
from decimal import Decimal

from riskview.schemas import FxForwardTrade, NavSchedule

ROLL_MONTHS = 3
COVERAGE_RATIO = Decimal("1.0")

_CENT = Decimal("0.01")


def generate_hedges(schedule: NavSchedule, base_currency: str) -> tuple[FxForwardTrade, ...]:
    if schedule.currency == base_currency:
        return ()
    trades = []
    for point in schedule.points:
        notional = (point.open_exposure * COVERAGE_RATIO).quantize(_CENT)
        if notional <= 0:
            continue
        trades.append(
            FxForwardTrade(
                fund_name=schedule.fund_name,
                trade_date=point.date,
                value_date=add_months(point.date, ROLL_MONTHS),
                sell_currency=schedule.currency,
                buy_currency=base_currency,
                notional_sell=notional,
                coverage_ratio=COVERAGE_RATIO,
            )
        )
    return tuple(trades)


def add_months(d: date, months: int) -> date:
    """Shift by whole months, month-end to month-end (30 Sep + 3m = 31 Dec)."""
    month_index = d.month - 1 + months
    year, month = d.year + month_index // 12, month_index % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    was_month_end = d.day == calendar.monthrange(d.year, d.month)[1]
    return date(year, month, last_day if was_month_end else min(d.day, last_day))
