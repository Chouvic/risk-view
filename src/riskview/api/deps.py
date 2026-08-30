"""Shared route dependencies.

Routes take these with `Depends`, so they declare what they need as a
parameter instead of reaching into the request. `get_fund_analytics` resolves
`fund_id` from the path and turns an unknown fund into a 404 once, here,
rather than in each route that looks one up.
"""

from typing import Annotated

from fastapi import Depends, HTTPException, Request

from riskview.schemas import FundAnalytics
from riskview.store import CashflowStore


def get_store(request: Request) -> CashflowStore:
    return request.app.state.store


def get_fund_analytics(
    fund_id: int, store: Annotated[CashflowStore, Depends(get_store)]
) -> FundAnalytics:
    try:
        return store.analytics(fund_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown fund: {fund_id}") from None
