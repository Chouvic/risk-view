"""Change detection: the canonical content hash, and the minting rules built on it.

The byte SHA-256 on a batch answers "have these exact bytes been uploaded
before?"; the canonical content hash answers "did this fund's schedule actually
change?". These tests pin the second one — a re-export with different bytes but
identical content must not mint a version, and a real revision must.
"""

from decimal import Decimal

import pytest

from riskview.db.repository import canonical_content_hash
from riskview.ingestion.service import ingest_into
from riskview.schemas import Cashflow, IngestionResult

# --------------------------------------------------------------------------
# The hash itself — pure, no database
# --------------------------------------------------------------------------


def _cf(**overrides) -> Cashflow:
    row = {
        "id": "1",
        "fund_name": "Fund I",
        "cashflow_date": "2025-09-30",
        "cashflow_type": "Interest",
        "currency": "GBP",
        "amount_local": "100",
        "amount_base": "114",
        "base_currency": "EUR",
    }
    row.update(overrides)
    return Cashflow.model_validate(row)


def test_amount_scale_does_not_change_the_hash():
    # 100, 100.00 and 1E+2 are the same money; only the last needs model_copy
    # because validation never produces exponent notation on its own.
    plain = canonical_content_hash([_cf()])
    scaled = canonical_content_hash([_cf(amount_local="100.00", amount_base="114.00")])
    exponent = canonical_content_hash(
        [_cf().model_copy(update={"amount_local": Decimal("1E+2"), "amount_base": Decimal("1.14E+2")})]
    )
    assert plain == scaled == exponent


def test_row_order_does_not_change_the_hash():
    first, second = _cf(), _cf(id="2", cashflow_date="2025-12-31")
    assert canonical_content_hash([first, second]) == canonical_content_hash([second, first])


def test_client_row_ids_do_not_change_the_hash():
    assert canonical_content_hash([_cf(id="1")]) == canonical_content_hash([_cf(id="99")])


@pytest.mark.parametrize(
    "change",
    [
        {"cashflow_date": "2025-12-31"},
        {"cashflow_type": "Principal Repayment"},
        {"currency": "USD"},
        {"amount_local": "101"},
        {"amount_base": "115"},
    ],
)
def test_every_content_field_changes_the_hash(change):
    assert canonical_content_hash([_cf()]) != canonical_content_hash([_cf(**change)])


def test_base_currency_changes_the_hash():
    # Included so a reporting-currency change can never look like a no-op.
    assert canonical_content_hash([_cf()]) != canonical_content_hash([_cf(base_currency="USD")])


def test_zero_in_any_form_hashes_alike():
    # Validation refuses zero amounts, so these exist only via model_copy — but
    # the serialiser must still collapse 0, 0.00 and -0 rather than trust it.
    forms = [Decimal(0), Decimal("0.00"), Decimal("-0")]
    hashes = {
        canonical_content_hash([_cf().model_copy(update={"amount_local": form})]) for form in forms
    }
    assert len(hashes) == 1


# --------------------------------------------------------------------------
# Minting rules — the hash deciding what an upload does
# --------------------------------------------------------------------------


def _revised(result: IngestionResult, name: str) -> IngestionResult:
    """A genuine revision of one fund: every amount doubled, everything else kept."""
    return IngestionResult(
        cashflows=tuple(
            Cashflow.model_validate(
                {**cf.model_dump(), "amount_local": cf.amount_local * 2, "amount_base": cf.amount_base * 2}
            )
            for cf in result.cashflows
            if cf.fund_name == name
        ),
        corrections=(),
    )


def test_reordered_content_mints_no_version(seeded_repo, session, sample_result, source):
    """Same schedule, rows in reverse order, new byte hash: an audit row lands,
    no version is minted, and analytics are untouched."""
    reordered = IngestionResult(
        cashflows=tuple(reversed(sample_result.cashflows)), corrections=sample_result.corrections
    )
    outcome = seeded_repo.save_batch(reordered, source("reordered re-export"))
    session.commit()

    assert [f.action.value for f in outcome.funds] == ["unchanged", "unchanged"]
    assert [f.version_no for f in outcome.funds] == [1, 1]
    assert seeded_repo.version_count(1) == 1
    assert seeded_repo.version_count(2) == 1


def test_xlsx_reexport_of_the_same_content_mints_no_version(
    seeded_repo, session, sample_xlsx_path
):
    """The CSV re-saved as a workbook: different bytes, identical validated
    content — the whole point of hashing content rather than files."""
    report = ingest_into(seeded_repo, sample_xlsx_path.read_bytes(), sample_xlsx_path.name)
    session.commit()

    assert report.duplicate is False  # new bytes, so it is a new batch...
    assert {f.action.value for f in report.funds} == {"unchanged"}  # ...that changed nothing
    assert seeded_repo.version_count(1) == 1


def test_revision_mints_and_history_stays_readable(seeded_repo, session, sample_result, source):
    original = seeded_repo.analytics(1)
    original_rows = seeded_repo.cashflows(1)

    outcome = seeded_repo.save_batch(_revised(sample_result, "Fund I"), source("revision"))
    session.commit()

    (fund_i,) = outcome.funds
    assert (fund_i.action.value, fund_i.version_no) == ("revised", 2)

    # Default reads follow the pointer to version 2...
    assert seeded_repo.analytics(1).hedges[0].notional_sell == original.hedges[0].notional_sell * 2
    # ...while version 1 stays fully readable: cashflows, analytics, hedges.
    assert seeded_repo.analytics(1, version_no=1) == original
    assert seeded_repo.cashflows(1, version_no=1) == original_rows

    first, second = seeded_repo.versions(1)
    assert (first.version_no, first.is_current) == (1, False)
    assert (second.version_no, second.is_current) == (2, True)
    assert first.content_hash != second.content_hash
    assert first.batch_id != second.batch_id


def test_unknown_version_raises_a_named_key_error(seeded_repo):
    with pytest.raises(KeyError, match="has no version 99"):
        seeded_repo.analytics(1, version_no=99)
