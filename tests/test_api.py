import pytest
from fastapi.testclient import TestClient

from riskview.api import create_app
from riskview.db.session import create_db_engine


def test_funds_are_listed_with_database_ids(client):
    body = client.get("/funds").json()
    assert [f["fund_id"] for f in body] == [1, 2]
    assert [f["name"] for f in body] == ["Fund I", "Fund II"]
    assert body[0]["base_currency"] == "EUR"
    assert body[0]["currencies"] == ["EUR", "GBP", "USD"]


def test_irr(client):
    body = client.get("/funds/1/irr").json()
    assert body["name"] == "Fund I"
    assert set(body["currency_irr"]) == {"EUR", "GBP", "USD"}
    assert 0.05 < body["fund_irr"] < 0.15


def test_nav_single_currency(client):
    body = client.get("/funds/1/nav", params={"currency": "gbp"}).json()
    assert body["currency"] == "GBP"
    assert len(body["points"]) == 21
    assert float(body["points"][0]["nav"]) == 0.0


def test_nav_all(client):
    body = client.get("/funds/1/nav").json()
    assert set(body["by_currency"]) == {"EUR", "GBP", "USD"}
    assert body["fund"]["currency"] == "EUR"


def test_hedges(client):
    body = client.get("/funds/1/hedges").json()
    assert len(body) == 40
    assert {t["sell_currency"] for t in body} == {"GBP", "USD"}


def test_unknown_fund_404(client):
    assert client.get("/funds/999/irr").status_code == 404


def test_non_integer_fund_id_422(client):
    assert client.get("/funds/fund-i/irr").status_code == 422


def test_unknown_currency_404(client):
    assert client.get("/funds/1/nav", params={"currency": "JPY"}).status_code == 404


@pytest.mark.parametrize("fixture_name", ["sample_csv_path", "sample_xlsx_path"])
def test_ingest_reports_and_serves(fixture_name, empty_client, request):
    assert empty_client.get("/funds").json() == []

    path = request.getfixturevalue(fixture_name)
    with open(path, "rb") as f:
        response = empty_client.post("/ingest", files={"file": (path.name, f)})
    assert response.status_code == 200
    assert response.json()["summary"] == {"accepted": 126, "corrected": 3}
    assert len(empty_client.get("/funds").json()) == 2


def test_ingest_bad_csv_422(empty_client):
    response = empty_client.post("/ingest", files={"file": ("bad.csv", b"ID,Fund Name\n1,x")})
    assert response.status_code == 422


def test_ingest_duplicate_ids_422_with_readable_detail(empty_client):
    # The response carries the reason, not Pydantic's raw error dump.
    rows = (
        "ID,Fund Name,Date,Cashflow Type,Local Currency,"
        "Cashflow Amount Local,Cashflow Amount Base,Base Currency\n"
        "1,Fund I,30/09/2025 00:00,Investment,GBP,-100,-114,EUR\n"
        "1,Fund I,31/12/2025 00:00,Interest,GBP,10,11,EUR\n"
    )
    response = empty_client.post("/ingest", files={"file": ("dupes.csv", rows.encode())})
    assert response.status_code == 422
    assert "duplicate cashflow ids in input: [1]" in response.json()["detail"]


def test_ingest_rejected_rows_422_lists_every_reject(empty_client):
    header = (
        "ID,Fund Name,Date,Cashflow Type,Local Currency,"
        "Cashflow Amount Local,Cashflow Amount Base,Base Currency"
    )
    rows = f"{header}\n1,Fund I,bad-date,Interest,GBP,10,11,EUR\n2,Fund I,30/09/2025 00:00,Investment,XZY,-1,-1,EUR\n"
    response = empty_client.post("/ingest", files={"file": ("bad-rows.csv", rows.encode())})
    assert response.status_code == 422

    detail = response.json()["detail"]
    assert "nothing was ingested" in detail["error"]
    assert [r["line"] for r in detail["rejects"]] == [2, 3]
    assert empty_client.get("/funds").json() == []


def test_ingest_unsupported_format_422(empty_client):
    response = empty_client.post("/ingest", files={"file": ("cashflows.pdf", b"junk")})
    assert response.status_code == 422


def test_reposting_the_same_bytes_is_a_no_op(empty_client, sample_csv_path):
    with open(sample_csv_path, "rb") as handle:
        first = empty_client.post("/ingest", files={"file": (sample_csv_path.name, handle)}).json()
    with open(sample_csv_path, "rb") as handle:
        second = empty_client.post("/ingest", files={"file": (sample_csv_path.name, handle)}).json()

    assert first["duplicate"] is False
    assert second["duplicate"] is True
    assert second["batch_id"] == first["batch_id"]
    assert second["summary"] == first["summary"]


def test_stored_report_outlives_the_upload(empty_client, sample_csv_path):
    with open(sample_csv_path, "rb") as handle:
        posted = empty_client.post("/ingest", files={"file": (sample_csv_path.name, handle)}).json()

    stored = empty_client.get(f"/ingestions/{posted['batch_id']}").json()

    assert stored["summary"] == {"accepted": 126, "corrected": 3}
    assert {row["row_id"] for row in stored["corrections"]} == {"17", "21", "51"}


def test_unknown_ingestion_batch_404(empty_client):
    assert empty_client.get("/ingestions/999").status_code == 404


def test_duplicate_natural_key_is_a_422_not_a_500(empty_client):
    """Two rows for the same (fund, currency, date, type) violate the unique
    constraint at rest, so ingestion has to reject the file with a reason."""
    rows = [
        "ID,Fund Name,Date,Cashflow Type,Local Currency,Cashflow Amount Local,Cashflow Amount Base,Base Currency",
        "1,Fund X,30/09/2025,Investment,GBP,-100,-110,EUR",
        "2,Fund X,30/09/2025,Investment,GBP,-100,-110,EUR",
    ]
    response = empty_client.post("/ingest", files={"file": ("dupes.csv", "\n".join(rows).encode())})

    assert response.status_code == 422
    assert "duplicate (fund, currency, date, type)" in response.json()["detail"]


def test_data_survives_a_restart(db_url, sample_csv_path):
    """The point of the exercise: a second process, with its own engine over the
    same file, serves the batch the first one ingested."""
    with (
        TestClient(create_app(create_db_engine(db_url))) as client,
        open(sample_csv_path, "rb") as handle,
    ):
        client.post("/ingest", files={"file": (sample_csv_path.name, handle)})

    with TestClient(create_app(create_db_engine(db_url))) as restarted:
        assert [f["fund_id"] for f in restarted.get("/funds").json()] == [1, 2]
        assert len(restarted.get("/funds/1/hedges").json()) == 40


def test_the_app_refuses_an_unmigrated_database(tmp_path):
    """No create_all anywhere: an empty file is not a usable database."""
    engine = create_db_engine(f"sqlite+pysqlite:///{tmp_path / 'empty.db'}")
    with pytest.raises(RuntimeError, match="alembic upgrade head"), TestClient(create_app(engine)):
        pass
    engine.dispose()


# --------------------------------------------------------------------------
# Versioned reads — revisions mint, no-ops don't, history stays served
# --------------------------------------------------------------------------

REVISED_ROW = (
    "2,Fund I,31/12/2025 00:00,Interest,GBP,2500000,2864345,EUR",
    "2,Fund I,31/12/2025 00:00,Interest,GBP,3000000,3437214,EUR",
)


def _post(client, name: str, data: bytes) -> dict:
    response = client.post("/ingest", files={"file": (name, data)})
    assert response.status_code == 200, response.text
    return response.json()


def test_upload_reports_what_it_did_per_fund(empty_client, sample_csv_path):
    report = _post(empty_client, "cashflows.csv", sample_csv_path.read_bytes())

    assert [(f["fund_name"], f["action"], f["version_no"]) for f in report["funds"]] == [
        ("Fund I", "new", 1),
        ("Fund II", "new", 1),
    ]


def test_revision_mints_only_for_the_changed_fund(empty_client, sample_csv_path):
    text = sample_csv_path.read_text()
    first = _post(empty_client, "cashflows.csv", text.encode())
    original_irr = empty_client.get("/funds/1/irr").json()["fund_irr"]

    report = _post(empty_client, "revised.csv", text.replace(*REVISED_ROW).encode())

    assert [(f["fund_name"], f["action"], f["version_no"]) for f in report["funds"]] == [
        ("Fund I", "revised", 2),
        ("Fund II", "unchanged", 1),
    ]
    assert report["batch_id"] != first["batch_id"]

    # History: version 1 still serves the pre-revision numbers.
    assert empty_client.get("/funds/1/irr", params={"version": 1}).json()["fund_irr"] == original_irr
    assert empty_client.get("/funds/1/irr").json()["fund_irr"] != original_irr

    versions = empty_client.get("/funds/1/versions").json()
    assert [(v["version_no"], v["is_current"]) for v in versions] == [(1, False), (2, True)]
    assert [f["version_no"] for f in empty_client.get("/funds").json()] == [2, 1]


def test_reordered_upload_mints_nothing(empty_client, sample_csv_path):
    lines = sample_csv_path.read_text().splitlines()
    _post(empty_client, "cashflows.csv", sample_csv_path.read_bytes())

    reordered = "\n".join([lines[0], *reversed(lines[1:])])
    report = _post(empty_client, "reexport.csv", reordered.encode())

    assert report["duplicate"] is False  # different bytes, so a new audit row...
    assert {f["action"] for f in report["funds"]} == {"unchanged"}  # ...that changed nothing
    assert [f["version_no"] for f in empty_client.get("/funds").json()] == [1, 1]


def test_unknown_version_404_with_a_named_detail(client):
    response = client.get("/funds/1/nav", params={"version": 99})
    assert response.status_code == 404
    assert response.json()["detail"] == "fund 1 has no version 99"
