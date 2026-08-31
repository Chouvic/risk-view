import csv
import shutil
from datetime import datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

from riskview.api import create_app
from riskview.db.alembic_support import upgrade_to_head
from riskview.db.repository import BatchSource, CashflowRepository
from riskview.db.session import create_db_engine, create_session_factory
from riskview.ingestion import ingest_file
from riskview.schemas import IngestionResult

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


# --------------------------------------------------------------------------
# Database fixtures
#
# The schema is built once per session by running the real migrations, then each
# test gets a copy of that file. Migrations are therefore exercised on every run
# and cannot rot, while per-test setup costs a file copy and isolation is total.
# --------------------------------------------------------------------------


@pytest.fixture(scope="session")
def migrated_template(tmp_path_factory) -> Path:
    path = tmp_path_factory.mktemp("schema") / "template.db"
    upgrade_to_head(f"sqlite+pysqlite:///{path}")
    # upgrade_to_head disposes its engine, which checkpoints and removes the WAL
    # sidecars. Copying before that would risk losing the migration's own writes.
    assert not path.with_name(path.name + "-wal").exists()
    return path


@pytest.fixture()
def db_url(migrated_template, tmp_path) -> str:
    path = tmp_path / "riskview.db"
    shutil.copy(migrated_template, path)
    return f"sqlite+pysqlite:///{path}"


@pytest.fixture()
def engine(db_url):
    engine = create_db_engine(db_url)
    yield engine
    engine.dispose()


@pytest.fixture()
def session_factory(engine):
    return create_session_factory(engine)


@pytest.fixture()
def session(session_factory):
    with session_factory() as session:
        yield session


@pytest.fixture()
def repo(session) -> CashflowRepository:
    return CashflowRepository(session)


@pytest.fixture()
def seeded_repo(repo, session, sample_result) -> CashflowRepository:
    repo.save_batch(sample_result, _source("seed"))
    session.commit()
    return repo


@pytest.fixture()
def client(engine, seeded_repo, session):
    # seeded_repo committed through `session`, which shares this engine, so the
    # app's own sessions see the data.
    session.close()
    with TestClient(create_app(engine)) as client:
        yield client


@pytest.fixture()
def empty_client(engine):
    with TestClient(create_app(engine)) as client:
        yield client


def _source(marker: object, filename: str = "cashflows.csv") -> BatchSource:
    """A distinct BatchSource per upload.

    content_sha256 is unique at rest, so two saves in one test have to look like
    two different files — which is what they represent.
    """
    return BatchSource.of(repr(marker).encode(), filename)


@pytest.fixture()
def source():
    """Factory for a BatchSource standing in for one uploaded file."""
    return _source
