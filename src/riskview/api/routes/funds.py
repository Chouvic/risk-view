"""Read-optimised endpoints over precomputed fund analytics.

Nothing here recomputes: analytics were written at ingestion, so every handler is
a query.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from riskview.analytics import diff_versions
from riskview.api.deps import get_fund_analytics, get_repository
from riskview.db.repository import CashflowRepository, UnknownFundError
from riskview.schemas import (
    FundAnalytics,
    FundIrr,
    FundSummary,
    FxForwardTrade,
    NavBundle,
    NavSchedule,
    VersionDiff,
    VersionInfo,
)

router = APIRouter()


@router.get("/funds")
def funds(repository: Annotated[CashflowRepository, Depends(get_repository)]) -> list[FundSummary]:
    # Two queries whatever the number of funds — see CashflowRepository.fund_summaries.
    return repository.fund_summaries()


@router.get("/funds/{fund_id}/versions")
def versions(
    fund_id: int, repository: Annotated[CashflowRepository, Depends(get_repository)]
) -> list[VersionInfo]:
    """A fund's projection history — every version ever published, oldest first."""
    try:
        return repository.versions(fund_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown fund: {fund_id}") from None


@router.get("/funds/{fund_id}/versions/diff")
def version_diff(
    fund_id: int,
    from_version: int,
    repository: Annotated[CashflowRepository, Depends(get_repository)],
    to_version: int | None = None,
) -> VersionDiff:
    """What a revision changed: rows by natural key, and the IRR and hedge
    consequences. to_version defaults to the current version."""
    try:
        resolved_to = to_version if to_version is not None else repository.current_version_no(fund_id)
        return diff_versions(
            repository.cashflows(fund_id, from_version),
            repository.cashflows(fund_id, resolved_to),
            repository.analytics(fund_id, from_version),
            repository.analytics(fund_id, resolved_to),
            from_version,
            resolved_to,
        )
    except UnknownFundError:
        raise HTTPException(status_code=404, detail=f"unknown fund: {fund_id}") from None
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc.args[0])) from None


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
