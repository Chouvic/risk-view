"""Ingestion orchestration: read -> validate -> store.

Cleaning and validation both live in the Cashflow model, so this module only maps source
headers onto model fields. A batch is all-or-nothing: every rejected row is collected so
the supplier sees the whole list, then the batch is refused.
"""

from pathlib import Path
from typing import TYPE_CHECKING

from pydantic import ValidationError

from riskview.ingestion.readers import read_rows
from riskview.schemas import Cashflow, IngestionResult, RowCorrection, RowReject

if TYPE_CHECKING:
    from riskview.store import CashflowStore

# The file-format contract, and the only thing ingestion knows that the model does not.
_HEADER_MAP = {
    "ID": "id",
    "Fund Name": "fund_name",
    "Date": "cashflow_date",
    "Cashflow Type": "cashflow_type",
    "Local Currency": "currency",
    "Cashflow Amount Local": "amount_local",
    "Cashflow Amount Base": "amount_base",
    "Base Currency": "base_currency",
}


class IngestionRejected(ValueError):
    """Some rows failed validation, so nothing was ingested.

    Analytics are whole-position computations — an IRR or NAV built from a subset of a
    fund's cashflows is silently wrong rather than merely incomplete — so a partial
    batch is never stored.
    """

    def __init__(self, rejects: tuple[RowReject, ...]) -> None:
        self.rejects = rejects
        super().__init__(f"{len(rejects)} row(s) failed validation; nothing was ingested")


def ingest_file(path: str | Path) -> IngestionResult:
    path = Path(path)
    return ingest(path.read_bytes(), path.name)


def ingest_into(store: "CashflowStore", data: bytes, filename: str) -> IngestionResult:
    """Parse, validate, and persist a batch — the single write path to storage."""
    result = ingest(data, filename)
    store.save_batch(result, source_file=filename)
    return result


def ingest(data: bytes, filename: str) -> IngestionResult:
    records = read_rows(data, filename)
    if records:
        # A missing column is a broken file, not N bad rows: fail before validating.
        missing = sorted(set(_HEADER_MAP) - set(records[0]))
        if missing:
            raise ValueError(f"input is missing expected columns: {missing}")

    cashflows: list[Cashflow] = []
    corrections: list[RowCorrection] = []
    rejects: list[RowReject] = []

    for line_no, record in enumerate(records, start=2):
        row = {field: record.get(header, "") for header, field in _HEADER_MAP.items()}
        fixes: list[str] = []  # the model's cleaning validators append to this
        try:
            cashflows.append(Cashflow.model_validate(row, context=fixes))
        except ValidationError as exc:
            rejects.append(RowReject.from_validation_error(line_no, row["id"], exc))
            continue
        if fixes:
            corrections.append(RowCorrection(line=line_no, row_id=row["id"], corrections=tuple(fixes)))

    if rejects:
        raise IngestionRejected(tuple(rejects))
    return IngestionResult(cashflows=tuple(cashflows), corrections=tuple(corrections))
