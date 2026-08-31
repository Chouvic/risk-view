"""File ingestion endpoint."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import ValidationError

from riskview.api.deps import get_store
from riskview.ingestion.readers import UnsupportedFormatError
from riskview.ingestion.service import IngestionRejected, ingest_into
from riskview.schemas import IngestionReport, describe_errors
from riskview.store import CashflowStore

router = APIRouter()


@router.post("/ingest")
async def ingest_upload(
    file: UploadFile, store: Annotated[CashflowStore, Depends(get_store)]
) -> IngestionReport:
    try:
        result = ingest_into(store, await file.read(), file.filename or "")
    except IngestionRejected as exc:
        raise HTTPException(
            status_code=422,
            detail={"error": str(exc), "rejects": [r.model_dump(mode="json") for r in exc.rejects]},
        ) from None
    except ValidationError as exc:  # a batch-level invariant, e.g. duplicate row ids
        raise HTTPException(status_code=422, detail="; ".join(describe_errors(exc))) from None
    except (UnsupportedFormatError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    return IngestionReport(summary=result.summary(), corrections=result.corrections)
