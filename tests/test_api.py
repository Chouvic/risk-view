import pytest
from fastapi.testclient import TestClient

from riskview.api import create_app


@pytest.fixture(scope="module")
def client(seeded_store):
    return TestClient(create_app(seeded_store))


@pytest.fixture()
def empty_client(store):
    return TestClient(create_app(store))


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
    assert response.json()["summary"] == {"accepted": 126, "corrected": 3, "rejected": 0}
    assert len(empty_client.get("/funds").json()) == 2


def test_ingest_bad_csv_422(empty_client):
    response = empty_client.post("/ingest", files={"file": ("bad.csv", b"ID,Fund Name\n1,x")})
    assert response.status_code == 422


def test_ingest_unsupported_format_422(empty_client):
    response = empty_client.post("/ingest", files={"file": ("cashflows.pdf", b"junk")})
    assert response.status_code == 422
