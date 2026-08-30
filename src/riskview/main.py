"""Application entry point — the composition root.

    uv run uvicorn riskview.main:app

Starts with an empty store — nothing is loaded automatically. Post a file to
POST /ingest to populate it. This is the only module that decides what store
backs the running app; tests build the same create_app() around their own.
"""

from riskview.api import create_app
from riskview.store import CashflowStore

app = create_app(CashflowStore())
