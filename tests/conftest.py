import csv
from datetime import datetime
from pathlib import Path

import pytest
from openpyxl import Workbook

from riskview.ingestion import ingest_file
from riskview.schemas import IngestionResult
from riskview.store import CashflowStore

SAMPLE_CSV = Path(__file__).resolve().parents[1] / "samples" / "cashflows.csv"


@pytest.fixture(scope="session")
def sample_result() -> IngestionResult:
    return ingest_file(SAMPLE_CSV)


@pytest.fixture(scope="session")
def sample_csv_path() -> Path:
    return SAMPLE_CSV


@pytest.fixture(scope="session")
def sample_xlsx_path(tmp_path_factory) -> Path:
    """The sample as a workbook, with native cell types where the source has one, as a real export would."""
    workbook = Workbook()
    sheet = workbook.active
    with SAMPLE_CSV.open(newline="") as handle:
        for row in csv.reader(handle):
            sheet.append([_typed(value) for value in row])
    path = tmp_path_factory.mktemp("samples") / "cashflows.xlsx"
    workbook.save(path)
    return path


def _typed(value: str) -> object:
    try:
        return int(value)
    except ValueError:
        pass
    try:
        return datetime.strptime(value, "%d/%m/%Y %H:%M")  # noqa: DTZ007
    except ValueError:
        return value


@pytest.fixture()
def store() -> CashflowStore:
    return CashflowStore()


@pytest.fixture(scope="module")
def seeded_store(sample_result) -> CashflowStore:
    store = CashflowStore()
    store.save_batch(sample_result)
    return store
