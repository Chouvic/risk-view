"""FastAPI app factory: routes wired around a database engine.

Assembly (building the engine) lives in riskview.main, the composition root —
this factory stays identical for the real app and for tests.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import Engine

from riskview.api.routes import funds, ingestion
from riskview.db.alembic_support import schema_is_current
from riskview.db.session import create_session_factory

__all__ = ["create_app"]


def create_app(engine: Engine) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # Refuse to serve a database that is behind the migrations. Failing here
        # beats failing on the first query with a missing-column error.
        schema_is_current(engine)
        yield
        engine.dispose()

    app = FastAPI(
        title="riskview",
        description="Fund-level FX risk analytics and hedge recommendations",
        lifespan=lifespan,
    )
    app.state.engine = engine
    app.state.session_factory = create_session_factory(engine)
    app.include_router(ingestion.router)
    app.include_router(funds.router)
    return app
