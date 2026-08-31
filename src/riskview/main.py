"""Composition root: `uv run uvicorn riskview.main:app`. Starts empty; POST /ingest to populate it."""

from riskview.api import create_app
from riskview.store import CashflowStore

app = create_app(CashflowStore())
