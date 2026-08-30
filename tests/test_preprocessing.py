from datetime import date
from decimal import Decimal

import pytest

from riskview.ingestion.preprocessing import CleaningError, clean_amount, clean_currency, clean_date


def test_clean_date_parses_without_corrections():
    value, corrections = clean_date("30/09/2025 00:00")
    assert value == date(2025, 9, 30)
    assert corrections == []


def test_clean_date_strips_stray_whitespace_and_seconds():
    # ID 21 in the sample data
    value, corrections = clean_date(" 30/09/2030  00:00:00")
    assert value == date(2030, 9, 30)
    assert corrections


def test_clean_date_strips_trailing_backtick():
    # ID 51 in the sample data
    value, corrections = clean_date("30/09/2027  00:00:00`")
    assert value == date(2027, 9, 30)
    assert corrections


def test_clean_date_accepts_iso_format():
    value, _ = clean_date("2025-09-30")
    assert value == date(2025, 9, 30)


def test_clean_date_rejects_garbage():
    with pytest.raises(CleaningError):
        clean_date("not a date")


def test_clean_date_uses_day_first_convention():
    # "04/03/2026" is 4 March under this source's day-first contract —
    # exactly the ambiguity that rules out fuzzy parsing.
    parsed, _ = clean_date("04/03/2026")
    assert parsed == date(2026, 3, 4)


def test_clean_amount_parses_plain_number():
    value, corrections = clean_amount("-100000000")
    assert value == Decimal(-100000000)
    assert corrections == []


def test_clean_amount_strips_thousands_separators():
    value, corrections = clean_amount("2,500,000")
    assert value == Decimal(2500000)
    assert corrections


def test_clean_amount_strips_currency_symbol():
    value, _ = clean_amount("€2500000")
    assert value == Decimal(2500000)


def test_clean_amount_parses_parenthesised_negative():
    value, corrections = clean_amount("(2500000)")
    assert value == Decimal(-2500000)
    assert corrections


def test_clean_amount_rejects_garbage():
    with pytest.raises(CleaningError):
        clean_amount("N/A")


def test_clean_currency_leaves_valid_code_untouched():
    value, corrections = clean_currency("GBP")
    assert value == "GBP"
    assert corrections == []


def test_clean_currency_corrects_known_typo_with_audit_trail():
    # ID 17 in the sample data
    value, corrections = clean_currency("GPB")
    assert value == "GBP"
    assert any("GPB" in c for c in corrections)


def test_clean_currency_normalises_lowercase():
    value, corrections = clean_currency("eur")
    assert value == "EUR"
    assert corrections


def test_clean_currency_passes_unknown_code_through_for_model_rejection():
    # cleaning does not guess: "XZY" is left for Cashflow validation to reject
    value, _ = clean_currency("XZY")
    assert value == "XZY"
