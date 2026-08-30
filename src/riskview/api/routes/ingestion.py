"""File ingestion endpoint."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile

from riskview.api.deps import get_store
from riskview.ingestion.readers import UnsupportedFormatError
from riskview.ingestion.service import ingest_into
from riskview.schemas import IngestionReport
from riskview.store import CashflowStore

router = APIRouter()


@router.post("/ingest")
async def ingest_upload(
    file: UploadFile, store: Annotated[CashflowStore, Depends(get_store)]
) -> IngestionReport:
    try:
        result = ingest_into(store, await file.read(), file.filename or "")
    except (UnsupportedFormatError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    return IngestionReport(
        summary=result.summary(),
        corrections=result.corrections,
        rejects=result.rejects,
    )
