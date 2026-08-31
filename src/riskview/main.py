"""Application entry point — the composition root.

    uv run alembic upgrade head
    uv run uvicorn riskview.main:app

Starts against the database named by RISKVIEW_DATABASE_URL (a local SQLite file
by default) and refuses to serve if that database is behind the migrations. This
is the only module that decides which database backs the running app; tests build
the same create_app() around their own.
"""

from riskview.api import create_app
from riskview.db.session import create_db_engine

app = create_app(create_db_engine())
