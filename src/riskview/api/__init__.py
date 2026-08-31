"""FastAPI app factory: routes wired around whatever store is supplied, so tests and main share it."""

from fastapi import FastAPI

from riskview.api.routes import funds, ingestion
from riskview.store import CashflowStore

__all__ = ["create_app"]


def create_app(store: CashflowStore) -> FastAPI:
    app = FastAPI(title="riskview", description="Fund-level FX risk analytics and hedge recommendations")
    app.state.store = store
    app.include_router(ingestion.router)
    app.include_router(funds.router)
    return app
