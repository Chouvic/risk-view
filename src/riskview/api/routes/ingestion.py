"""File ingestion endpoint, and the stored report it produces."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import ValidationError

from riskview.api.deps import get_repository
from riskview.db.repository import CashflowRepository
from riskview.ingestion.readers import UnsupportedFormatError
from riskview.ingestion.service import IngestionRejected, ingest_into, report_of
from riskview.schemas import IngestionReport, describe_errors

router = APIRouter()


@router.post("/ingest")
async def ingest_upload(
    file: UploadFile, repository: Annotated[CashflowRepository, Depends(get_repository)]
) -> IngestionReport:
    """Ingest one CSV or Excel file.

    The whole file is one transaction: it lands complete, or not at all. Posting
    the same bytes twice is a no-op that returns the first report.
    """
    try:
        return ingest_into(repository, await file.read(), file.filename or "")
    except IngestionRejected as exc:
        raise HTTPException(
            status_code=422,
            detail={"error": str(exc), "rejects": [r.model_dump(mode="json") for r in exc.rejects]},
        ) from None
    except ValidationError as exc:  # a batch-level invariant, e.g. duplicate row ids
        raise HTTPException(status_code=422, detail="; ".join(describe_errors(exc))) from None
    except (UnsupportedFormatError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None


@router.get("/ingestions/{batch_id}")
def ingestion_report(
    batch_id: int, repository: Annotated[CashflowRepository, Depends(get_repository)]
) -> IngestionReport:
    """Re-serve a stored report, so the supplier's reconciliation artefact
    outlives the upload response."""
    try:
        batch = repository.batch(batch_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown ingestion batch: {batch_id}") from None
    return report_of(batch, duplicate=False, funds=repository.outcomes_of(batch))
