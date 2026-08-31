"""Read-optimised endpoints over precomputed fund analytics."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from riskview.api.deps import get_fund_analytics, get_store
from riskview.schemas import (
    FundAnalytics,
    FundIrr,
    FundSummary,
    FxForwardTrade,
    NavBundle,
    NavSchedule,
)
from riskview.store import CashflowStore

router = APIRouter()


@router.get("/funds")
def funds(store: Annotated[CashflowStore, Depends(get_store)]) -> list[FundSummary]:
    summaries = []
    for fund_id in store.fund_ids():
        analytics = store.analytics(fund_id)
        summaries.append(
            FundSummary(
                fund_id=fund_id,
                name=analytics.fund_name,
                base_currency=analytics.base_currency,
                currencies=sorted(analytics.currency_irr),
                cashflow_count=len(store.cashflows(fund_id)),
                source_file=store.source_file(fund_id),
            )
        )
    return summaries


@router.get("/funds/{fund_id}/irr")
def irr(analytics: Annotated[FundAnalytics, Depends(get_fund_analytics)]) -> FundIrr:
    return FundIrr(
        fund_id=analytics.fund_id,
        name=analytics.fund_name,
        base_currency=analytics.base_currency,
        fund_irr=analytics.fund_irr,
        currency_irr=analytics.currency_irr,
    )


@router.get("/funds/{fund_id}/nav")
def nav(
    analytics: Annotated[FundAnalytics, Depends(get_fund_analytics)],
    currency: str | None = None,
) -> NavBundle | NavSchedule:
    if currency is None:
        return NavBundle(fund=analytics.fund_nav_schedule, by_currency=analytics.nav_schedules)
    schedule = analytics.nav_schedules.get(currency.upper())
    if schedule is None:
        raise HTTPException(
            status_code=404, detail=f"fund {analytics.fund_id} has no {currency.upper()} position"
        )
    return schedule


@router.get("/funds/{fund_id}/hedges")
def hedges(
    analytics: Annotated[FundAnalytics, Depends(get_fund_analytics)],
) -> tuple[FxForwardTrade, ...]:
    return analytics.hedges
