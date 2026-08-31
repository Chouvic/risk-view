"""Cleaning and validation rules, exercised through Cashflow.model_validate — the call ingestion makes."""

from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from riskview.schemas import Cashflow, CashflowType, CurrencyCode

CLEAN_ROW = {
    "id": "2",
    "fund_name": "Fund I",
    "cashflow_date": "31/12/2025 00:00",
    "cashflow_type": "Interest",
    "currency": "GBP",
    "amount_local": "2500000",
    "amount_base": "2864345",
    "base_currency": "EUR",
}


def validate(**overrides) -> tuple[Cashflow, list[str]]:
    """Validate a source row, returning the record and the fixes that were applied."""
    fixes: list[str] = []
    return Cashflow.model_validate({**CLEAN_ROW, **overrides}, context=fixes), fixes


def reasons(**overrides) -> tuple[str, ...]:
    """The rejection reasons a row produces, formatted as the report shows them."""
    with pytest.raises(ValidationError) as caught:
        validate(**overrides)
    return tuple(f"{e['loc']}: {e['msg']} {e['input']!r}" for e in caught.value.errors())


def test_clean_row_validates_without_corrections():
    cashflow, fixes = validate()
    assert cashflow.cashflow_date == date(2025, 12, 31)
    assert cashflow.currency is CurrencyCode.GBP
    assert cashflow.cashflow_type is CashflowType.INTEREST
    assert cashflow.amount_local == Decimal(2500000)
    assert fixes == []


# --- dates ----------------------------------------------------------------


def test_date_strips_stray_whitespace_and_seconds():
    # ID 21 in the sample data
    cashflow, fixes = validate(cashflow_date=" 30/09/2030  00:00:00")
    assert cashflow.cashflow_date == date(2030, 9, 30)
    assert fixes


def test_date_strips_trailing_backtick():
    # ID 51 in the sample data
    cashflow, fixes = validate(cashflow_date="30/09/2027  00:00:00`")
    assert cashflow.cashflow_date == date(2027, 9, 30)
    assert fixes


def test_date_accepts_iso_format():
    cashflow, _ = validate(cashflow_date="2025-09-30")
    assert cashflow.cashflow_date == date(2025, 9, 30)


def test_date_uses_day_first_convention():
    # 4 March under this source's day-first contract — the ambiguity that rules out fuzzy parsing.
    cashflow, _ = validate(cashflow_date="04/03/2026")
    assert cashflow.cashflow_date == date(2026, 3, 4)


def test_date_rejects_garbage():
    assert "unrecognised date format" in reasons(cashflow_date="not a date")[0]


def test_date_accepts_an_already_typed_value():
    # An Excel export can hand over a real date; cleaning must pass it through.
    cashflow, fixes = validate(cashflow_date=date(2026, 3, 4))
    assert cashflow.cashflow_date == date(2026, 3, 4)
    assert fixes == []


# --- amounts --------------------------------------------------------------


def test_amount_strips_thousands_separators():
    cashflow, fixes = validate(amount_local="2,500,000")
    assert cashflow.amount_local == Decimal(2500000)
    assert fixes


def test_amount_strips_currency_symbol():
    cashflow, _ = validate(amount_local="£2500000")
    assert cashflow.amount_local == Decimal(2500000)


def test_amount_reads_parenthesised_value_as_negative():
    cashflow, fixes = validate(
        cashflow_type="Investment", amount_local="(2500000)", amount_base="(2864345)"
    )
    assert cashflow.amount_local == Decimal(-2500000)
    assert fixes


def test_amount_rejects_garbage():
    assert "'N/A'" in reasons(amount_local="N/A")[0]


# --- currencies -----------------------------------------------------------


def test_currency_corrects_known_typo_with_audit_trail():
    # ID 17 in the sample data
    cashflow, fixes = validate(currency="GPB")
    assert cashflow.currency is CurrencyCode.GBP
    assert any("GPB" in fix for fix in fixes)


def test_currency_normalises_lowercase():
    cashflow, fixes = validate(currency="gbp")
    assert cashflow.currency is CurrencyCode.GBP
    assert fixes


def test_currency_rejects_unknown_code_naming_the_value():
    # cleaning never guesses: "XZY" is left for CurrencyCode to reject
    assert "'XZY'" in reasons(currency="XZY")[0]


# --- cross-field invariants ----------------------------------------------


def test_blank_fund_name_rejected():
    assert reasons(fund_name="  ")


def test_investment_must_be_an_outflow():
    assert "negative" in reasons(cashflow_type="Investment")[0]


def test_interest_must_be_an_inflow():
    assert "positive" in reasons(amount_local="-2500000", amount_base="-2864345")[0]


def test_local_and_base_amounts_must_agree_in_sign():
    assert "same sign" in reasons(amount_base="-2864345")[0]


def test_base_currency_row_must_have_equal_amounts():
    assert "amount_local == amount_base" in reasons(currency="EUR")[0]


def test_unknown_cashflow_type_rejected():
    assert "'Dividend'" in reasons(cashflow_type="Dividend")[0]


def test_every_broken_field_is_reported_at_once():
    # One pass over the row, so a supplier fixing a file sees every problem in it.
    assert len(reasons(cashflow_date="nope", currency="XZY", amount_local="N/A")) == 3
