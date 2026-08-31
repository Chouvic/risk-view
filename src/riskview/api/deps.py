"""Shared route dependencies.

Routes take these with `Depends`, so they declare what they need as a parameter
instead of reaching into the request. `get_session` makes the request the unit of
work — one transaction, committed if the handler returns and rolled back if it
raises — and `get_fund_analytics` turns an unknown fund into a 404 once, here,
rather than in each route that looks one up.
"""

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from riskview.db.repository import CashflowRepository, UnknownFundError
from riskview.schemas import FundAnalytics


def get_session(request: Request) -> Iterator[Session]:
    session = request.app.state.session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        # Re-raised, not swallowed: FastAPI needs the exception to build the
        # response, and a swallowed one in a yield dependency is an error.
        session.rollback()
        raise
    finally:
        session.close()


def get_repository(session: Annotated[Session, Depends(get_session)]) -> CashflowRepository:
    return CashflowRepository(session)


def get_fund_analytics(
    fund_id: int,
    repository: Annotated[CashflowRepository, Depends(get_repository)],
    version: int | None = None,
) -> FundAnalytics:
    """Analytics for one fund — the current version by default, any retained
    version via ?version=N. Declared as a dependency parameter, so every fund
    read gets the query parameter without repeating it."""
    try:
        return repository.analytics(fund_id, version)
    except UnknownFundError:
        raise HTTPException(status_code=404, detail=f"unknown fund: {fund_id}") from None
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc.args[0])) from None
