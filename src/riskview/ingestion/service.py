"""Ingestion orchestration: read -> clean -> validate -> store.

Each row is scrubbed field-by-field (preprocessing.py), then validated as a domain
Cashflow. Rows that clean up unambiguously are accepted and reported as corrections;
rows that still fail validation are rejected with reasons. Parsing (ingest) is a
pure function of the file bytes — same input, same result — and ingest_into is the
one place a parsed batch reaches storage, so every entry point (the API's
POST /ingest, the CLI, a future queue worker) persists data the same way.

Re-uploading a file is safe twice over: the SHA-256 of the bytes is the batch's
idempotency key, so identical bytes are a no-op that returns the original report,
and a file that does land is written as a new immutable version rather than over
the top of the last one.
"""

from collections import Counter
from collections.abc import Iterable
from pathlib import Path

from pydantic import ValidationError

from riskview.db.repository import BatchSource, CashflowRepository, IngestionBatch
from riskview.ingestion.preprocessing import CleaningError, clean_amount, clean_currency, clean_date
from riskview.ingestion.readers import read_rows
from riskview.schemas import (
    Cashflow,
    IngestionReport,
    IngestionResult,
    RawCashflowRow,
    RowCorrection,
    RowReject,
)

# Source header -> RawCashflowRow field
_HEADER_MAP = {
    "ID": "id",
    "Fund Name": "fund_name",
    "Date": "date",
    "Cashflow Type": "cashflow_type",
    "Local Currency": "local_currency",
    "Cashflow Amount Local": "amount_local",
    "Cashflow Amount Base": "amount_base",
    "Base Currency": "base_currency",
}


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
            "rejected": batch.rejected_count,
        },
        corrections=CashflowRepository.corrections_of(batch),
        rejects=CashflowRepository.rejects_of(batch),
    )


def ingest(data: bytes, filename: str) -> IngestionResult:
    records = read_rows(data, filename)
    if records:
        missing = set(_HEADER_MAP) - set(records[0])
        if missing:
            raise ValueError(f"input is missing expected columns: {sorted(missing)}")

    cashflows: list[Cashflow] = []
    corrections: list[RowCorrection] = []
    rejects: list[RowReject] = []

    for line_no, record in enumerate(records, start=2):
        raw = RawCashflowRow(**{field: record.get(header, "") for header, field in _HEADER_MAP.items()})
        try:
            cashflow, fixes = _parse_row(raw)
        except _RowError as exc:
            rejects.append(RowReject(line=line_no, row_id=raw.id, errors=tuple(exc.errors)))
            continue
        cashflows.append(cashflow)
        if fixes:
            corrections.append(RowCorrection(line=line_no, row_id=raw.id, corrections=tuple(fixes)))

    _check_duplicate_ids(cashflows)
    _check_duplicate_natural_keys(cashflows)
    return IngestionResult(cashflows=tuple(cashflows), corrections=tuple(corrections), rejects=tuple(rejects))


class _RowError(Exception):
    def __init__(self, errors: Iterable[str]):
        self.errors = list(errors)


def _parse_row(raw: RawCashflowRow) -> tuple[Cashflow, list[str]]:
    fixes: list[str] = []
    errors: list[str] = []
    fields: dict[str, object] = {"fund_name": raw.fund_name.strip(), "cashflow_type": raw.cashflow_type.strip()}

    for name, cleaner, value in (
        ("cashflow_date", clean_date, raw.date),
        ("currency", clean_currency, raw.local_currency),
        ("base_currency", clean_currency, raw.base_currency),
        ("amount_local", clean_amount, raw.amount_local),
        ("amount_base", clean_amount, raw.amount_base),
    ):
        try:
            fields[name], field_fixes = cleaner(value)
            fixes.extend(field_fixes)
        except CleaningError as exc:
            errors.append(str(exc))
    try:
        fields["id"] = int(raw.id.strip())
    except ValueError:
        errors.append(f"unparseable id: {raw.id!r}")
    if errors:
        raise _RowError(errors)

    try:
        return Cashflow(**fields), fixes
    except ValidationError as exc:
        raise _RowError(_describe(e) for e in exc.errors()) from None


def _describe(error: dict) -> str:
    """Format a Pydantic error for the rejects report, e.g. 'currency: Input
    should be ... (got 'XZY')' — Enum errors list the allowed values but not
    what was actually received, so the bad value is appended explicitly."""
    location = ".".join(str(part) for part in error["loc"]) or "row"
    if error["type"] == "enum":
        return f"{location}: {error['msg']} (got {error['input']!r})"
    return f"{location}: {error['msg']}"


def _check_duplicate_ids(cashflows: list[Cashflow]) -> None:
    counts = Counter(cf.id for cf in cashflows)
    duplicates = sorted(cf_id for cf_id, n in counts.items() if n > 1)
    if duplicates:
        raise ValueError(f"duplicate cashflow ids in input: {duplicates}")


def _check_duplicate_natural_keys(cashflows: list[Cashflow]) -> None:
    """(fund, currency, date, type) identifies a cashflow, and is a unique
    constraint at rest. Two rows sharing one is a broken file, not a row to drop:
    nothing in the data says which of the pair is the real projection. Rejecting
    the batch here gives the supplier a legible message instead of a database
    IntegrityError surfacing as a 500."""
    counts = Counter(
        (cf.fund_name, cf.currency.value, cf.cashflow_date, cf.cashflow_type.value) for cf in cashflows
    )
    duplicates = sorted(str(key) for key, n in counts.items() if n > 1)
    if duplicates:
        raise ValueError(f"duplicate (fund, currency, date, type) in input: {duplicates}")
