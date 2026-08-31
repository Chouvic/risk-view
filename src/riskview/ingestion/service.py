"""Ingestion orchestration: read -> validate -> store.

Cleaning and validation both live in the Cashflow model, so this module only maps source
headers onto model fields. A batch is all-or-nothing: every rejected row is collected so
the supplier sees the whole list, then the batch is refused and nothing is stored.

ingest_into is the one place a parsed batch reaches storage, so every entry point
(the API's POST /ingest, the CLI, a future queue worker) persists data the same
way. Re-uploading a file is safe: the SHA-256 of the bytes is the batch's
idempotency key, so identical bytes are a no-op that returns the original report,
and a file that does land is written as a new immutable version rather than over
the top of the last one.
"""

from pathlib import Path

from pydantic import ValidationError

from riskview.db.repository import BatchSource, CashflowRepository, IngestionBatch
from riskview.ingestion.readers import read_rows
from riskview.schemas import Cashflow, IngestionReport, IngestionResult, RowCorrection, RowReject

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


def ingest_into(repository: CashflowRepository, data: bytes, filename: str) -> IngestionReport:
    """Parse, validate, and persist a batch — the single write path to storage.

    Does not commit: the caller owns the transaction, so either the whole file
    lands — batch row, projections, analytics and the published pointer — or none
    of it does.
    """
    source = BatchSource.of(data, filename)

    existing = repository.find_batch(source.content_sha256)
    if existing is not None:
        # These exact bytes have been ingested before. Replaying them would mint a
        # version identical to one already published, so return the original report.
        return report_of(existing, duplicate=True)

    result = ingest(data, filename)
    batch = repository.save_batch(result, source)
    return report_of(batch, duplicate=False)


def report_of(batch: IngestionBatch, *, duplicate: bool) -> IngestionReport:
    """Rebuild a batch's report from what was stored — the same shape whether it
    is being returned from an upload or re-served months later."""
    return IngestionReport(
        batch_id=batch.id,
        duplicate=duplicate,
        summary={
            "accepted": batch.accepted_count,
            "corrected": batch.corrected_count,
        },
        corrections=CashflowRepository.corrections_of(batch),
    )


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
