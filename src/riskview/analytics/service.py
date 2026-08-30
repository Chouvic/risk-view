"""Composes the analytics for one fund from its validated cashflows.

Pure function of the cashflow set — no I/O, no state — so results are
deterministic and recomputation is always safe.
"""

from collections import defaultdict

from riskview.analytics.hedge import generate_hedges
from riskview.analytics.irr import CashflowPoint, xirr
from riskview.analytics.nav import build_nav_schedule
from riskview.schemas import Cashflow, FundAnalytics


def compute_fund_analytics(fund_id: int, cashflows: list[Cashflow]) -> FundAnalytics:
    if not cashflows:
        raise ValueError(f"no cashflows for fund {fund_id}")
    fund_names = {cf.fund_name for cf in cashflows}
    if len(fund_names) != 1:
        raise ValueError(f"cashflows span multiple funds: {sorted(fund_names)}")
    fund_name = fund_names.pop()
    base_currencies = {cf.base_currency for cf in cashflows}
    if len(base_currencies) != 1:
        raise ValueError(f"fund {fund_name!r} has inconsistent base currencies: {sorted(base_currencies)}")
    base_currency = base_currencies.pop()

    by_currency: dict[str, list[CashflowPoint]] = defaultdict(list)
    for cf in cashflows:
        by_currency[cf.currency].append(CashflowPoint(cf.cashflow_date, float(cf.amount_local)))

    currency_irr = {ccy: xirr(ccy_flows) for ccy, ccy_flows in by_currency.items()}
    nav_schedules = {
        ccy: build_nav_schedule(fund_name, ccy, currency_irr[ccy], ccy_flows)
        for ccy, ccy_flows in by_currency.items()
    }

    base_flows = [CashflowPoint(cf.cashflow_date, float(cf.amount_base)) for cf in cashflows]
    fund_irr = xirr(base_flows)
    fund_nav_schedule = build_nav_schedule(fund_name, base_currency, fund_irr, base_flows)

    hedges = tuple(
        trade
        for ccy in sorted(nav_schedules)
        for trade in generate_hedges(nav_schedules[ccy], base_currency)
    )

    return FundAnalytics(
        fund_id=fund_id,
        fund_name=fund_name,
        base_currency=base_currency,
        fund_irr=fund_irr,
        currency_irr=currency_irr,
        nav_schedules=nav_schedules,
        fund_nav_schedule=fund_nav_schedule,
        hedges=hedges,
    )
