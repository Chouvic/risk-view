import pytest
from pydantic import ValidationError

from riskview.ingestion import IngestionRejected, ingest, ingest_file
from riskview.ingestion.readers import UnsupportedFormatError
from riskview.ingestion.service import ingest_into

HEADER = "ID,Fund Name,Date,Cashflow Type,Local Currency,Cashflow Amount Local,Cashflow Amount Base,Base Currency"

GOOD_ROW = "1,Fund I,30/09/2025 00:00,Investment,GBP,-100,-114,EUR"


def _load(*rows: str):
    return ingest("\n".join([HEADER, *rows]).encode(), "test.csv")


def _rejects(*rows: str):
    """The rejects a batch produces; ingesting it raises rather than returning a partial result."""
    with pytest.raises(IngestionRejected) as caught:
        _load(*rows)
    return caught.value.rejects


def test_all_rows_accepted_with_three_corrections(sample_result):
    assert sample_result.summary() == {"accepted": 126, "corrected": 3}
    assert {c.row_id for c in sample_result.corrections} == {"17", "21", "51"}


def test_corrected_typo_row_is_gbp(sample_result):
    row_17 = next(cf for cf in sample_result.cashflows if cf.id == 17)
    assert row_17.currency == "GBP"


def test_funds_and_currencies(sample_result):
    assert {cf.fund_name for cf in sample_result.cashflows} == {"Fund I", "Fund II"}
    assert {cf.currency for cf in sample_result.cashflows} == {"GBP", "EUR", "USD"}
    assert all(cf.base_currency == "EUR" for cf in sample_result.cashflows)


def test_validated_cashflows_are_immutable(sample_result):
    # Assignment does not re-validate in pydantic v2, so mutation could break the sign invariants.
    investment = next(cf for cf in sample_result.cashflows if cf.amount_local < 0)
    with pytest.raises(ValidationError):
        investment.amount_local = -investment.amount_local


def test_xlsx_and_csv_produce_identical_cashflows(sample_result, sample_xlsx_path):
    xlsx_result = ingest_file(sample_xlsx_path)
    assert xlsx_result.summary() == sample_result.summary()
    assert xlsx_result.cashflows == sample_result.cashflows


def test_unsupported_format_rejected():
    with pytest.raises(UnsupportedFormatError):
        ingest(b"whatever", "cashflows.pdf")


def test_idempotent_same_input_same_output(sample_result, sample_csv_path):
    assert ingest_file(sample_csv_path) == sample_result


def test_unknown_currency_rejected():
    assert "XZY" in _rejects("1,Fund I,30/09/2025 00:00,Investment,XZY,-100,-100,EUR")[0].errors[0]


def test_positive_investment_rejected():
    assert "negative" in _rejects("1,Fund I,30/09/2025 00:00,Investment,GBP,100,114,EUR")[0].errors[0]


def test_negative_interest_rejected():
    assert _rejects("1,Fund I,31/12/2025 00:00,Interest,GBP,-100,-114,EUR")


def test_unknown_cashflow_type_rejected():
    assert _rejects("1,Fund I,30/09/2025 00:00,Dividend,GBP,-100,-114,EUR")


def test_base_currency_row_with_mismatched_amounts_rejected():
    assert _rejects("1,Fund I,31/12/2025 00:00,Interest,EUR,100,110,EUR")


def test_one_bad_row_refuses_the_whole_batch():
    # A fund's IRR and NAV are computed from all of its flows, so a partial batch is
    # silently wrong rather than incomplete.
    rejects = _rejects(GOOD_ROW, "2,Fund I,bad-date,Interest,GBP,10,11,EUR")
    assert [r.line for r in rejects] == [3]


def test_every_bad_row_is_reported_before_the_batch_is_refused():
    # One pass, so a supplier fixing a file sees every problem in it.
    rejects = _rejects(
        "1,Fund I,bad-date,Investment,GBP,-100,-114,EUR",
        GOOD_ROW.replace("1,Fund", "2,Fund"),
        "3,Fund I,31/12/2025 00:00,Interest,XZY,10,11,EUR",
    )
    assert [r.line for r in rejects] == [2, 4]


def test_refused_batch_reaches_no_store(store):
    with pytest.raises(IngestionRejected):
        ingest_into(store, f"{HEADER}\n1,Fund I,bad-date,Interest,GBP,10,11,EUR".encode(), "test.csv")
    assert store.fund_ids() == []


def test_duplicate_ids_fail_the_batch():
    with pytest.raises(ValueError, match="duplicate"):
        _load(GOOD_ROW, "1,Fund I,31/12/2025 00:00,Interest,GBP,10,11,EUR")


def test_missing_column_fails_fast():
    with pytest.raises(ValueError, match="missing expected columns"):
        ingest(b"ID,Fund Name\n1,Fund I", "test.csv")
