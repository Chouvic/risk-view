"""Read-optimised endpoints over precomputed fund analytics.

Nothing here recomputes: analytics were written at ingestion, so every handler is
a query.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from riskview.api.deps import get_fund_analytics, get_repository
from riskview.db.repository import CashflowRepository
from riskview.schemas import (
    FundAnalytics,
    FundIrr,
    FundSummary,
    FxForwardTrade,
    NavBundle,
    NavSchedule,
)

router = APIRouter()


@router.get("/funds")
def funds(repository: Annotated[CashflowRepository, Depends(get_repository)]) -> list[FundSummary]:
    # Two queries whatever the number of funds — see CashflowRepository.fund_summaries.
    return repository.fund_summaries()


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
