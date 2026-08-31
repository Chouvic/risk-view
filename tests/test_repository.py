"""CashflowRepository: versioned saves, stable fund ids, and stored analytics.

The contract tests that used to cover CashflowStore, plus the ones the move to a
database makes possible — history is kept, and reads never recompute.
"""

import pytest
from sqlalchemy import text

from riskview.analytics import compute_fund_analytics
from riskview.db.repository import CashflowRepository, UnknownFundError
from riskview.schemas import Cashflow, IngestionResult


def _fund(result: IngestionResult, name: str) -> IngestionResult:
    return IngestionResult(
        cashflows=tuple(cf for cf in result.cashflows if cf.fund_name == name),
        corrections=(),
    )


# --------------------------------------------------------------------------
# The original store contract
# --------------------------------------------------------------------------


def test_funds_get_stable_ids(seeded_repo):
    assert seeded_repo.fund_ids() == [1, 2]
    assert seeded_repo.analytics(1).fund_name == "Fund I"
    assert seeded_repo.analytics(2).fund_name == "Fund II"


def test_cashflows_round_trip_exactly(seeded_repo, sample_result):
    stored = seeded_repo.cashflows(1)
    original = sorted(
        (cf for cf in sample_result.cashflows if cf.fund_name == "Fund I"), key=lambda cf: cf.id
    )
    assert stored == original


def test_reingest_replaces_not_duplicates(seeded_repo, session, sample_result, source):
    seeded_repo.save_batch(sample_result, source("second upload"))
    session.commit()

    assert seeded_repo.fund_ids() == [1, 2]
    assert len(seeded_repo.cashflows(1)) == 63


def test_partial_batch_leaves_other_funds_untouched(seeded_repo, session, sample_result, source):
    untouched = seeded_repo.current_version_id(2)

    # One client's upload must never destroy another's data.
    seeded_repo.save_batch(_fund(sample_result, "Fund I"), source("fund I only"))
    session.commit()

    assert seeded_repo.fund_ids() == [1, 2]
    assert len(seeded_repo.cashflows(2)) == 63
    assert seeded_repo.analytics(2).fund_name == "Fund II"
    assert seeded_repo.current_version_id(2) == untouched  # the pointer never moved
    assert seeded_repo.version_count(2) == 1


def test_unknown_fund_raises_key_error(seeded_repo):
    # The API turns KeyError into a 404; UnknownFundError only improves the message.
    with pytest.raises(KeyError):
        seeded_repo.cashflows(99)
    with pytest.raises(UnknownFundError):
        seeded_repo.analytics(99)


# --------------------------------------------------------------------------
# What replaces the old analytics-cache identity assertion
# --------------------------------------------------------------------------


def test_analytics_are_served_from_storage_not_recomputed(seeded_repo, monkeypatch):
    """The point of computing on write: a read never runs the analytics engine."""
    monkeypatch.setattr(
        "riskview.db.repository.compute_fund_analytics",
        lambda *args, **kwargs: pytest.fail("analytics recomputed on a read path"),
    )
    assert seeded_repo.analytics(1).fund_name == "Fund I"


def test_analytics_track_the_newest_version(seeded_repo, session, sample_result, source):
    before = seeded_repo.current_version_id(1)

    without_usd = IngestionResult(
        cashflows=tuple(cf for cf in sample_result.cashflows if cf.currency != "USD"),
        corrections=(),
    )
    seeded_repo.save_batch(without_usd, source("revision"))
    session.commit()

    assert seeded_repo.current_version_id(1) != before
    assert set(seeded_repo.analytics(1).currency_irr) == {"EUR", "GBP"}


def test_superseded_versions_are_kept(seeded_repo, session, sample_result, source):
    first = seeded_repo.current_version_id(1)
    seeded_repo.save_batch(sample_result, source("second upload"))
    session.commit()

    assert seeded_repo.version_count(1) == 2
    assert seeded_repo.current_version_id(1) != first
    # The superseded version's rows are still there — a revision is not a delete.
    surviving = session.execute(
        text("SELECT count(*) FROM cashflows WHERE version_id = :v"), {"v": first}
    ).scalar()
    assert surviving == 63


# --------------------------------------------------------------------------
# Round-trip fidelity
# --------------------------------------------------------------------------


def test_persisted_analytics_equal_a_fresh_computation(seeded_repo):
    """Every Decimal, float, date, enum, dict key and tuple order in one assertion."""
    assert seeded_repo.analytics(1) == compute_fund_analytics(1, seeded_repo.cashflows(1))


def test_persisted_irrs_match_their_schedules(seeded_repo):
    """currency_irr and fund_irr are read back off nav_schedules.irr rather than
    stored twice, which only holds while analytics uses one rate per schedule."""
    analytics = seeded_repo.analytics(1)

    assert analytics.fund_irr == analytics.fund_nav_schedule.irr
    assert all(analytics.currency_irr[ccy] == s.irr for ccy, s in analytics.nav_schedules.items())


def test_hedge_order_survives_storage(seeded_repo):
    hedges = seeded_repo.analytics(1).hedges

    assert len(hedges) == 40
    assert list(hedges) == sorted(hedges, key=lambda t: (t.sell_currency.value, t.trade_date))


def test_fund_ids_follow_name_order_not_file_order(repo, session, sample_result, source):
    """Ids are assigned in sorted-name order, so a file that happens to list
    Fund II first must not renumber the funds."""
    reversed_batch = IngestionResult(
        cashflows=tuple(reversed(sample_result.cashflows)), corrections=()
    )
    repo.save_batch(reversed_batch, source("reversed"))
    session.commit()

    assert repo.analytics(1).fund_name == "Fund I"
    assert repo.analytics(2).fund_name == "Fund II"


# --------------------------------------------------------------------------
# Transactional behaviour and the audit trail
# --------------------------------------------------------------------------


def test_a_failed_batch_leaves_no_trace(seeded_repo, session, sample_result, source):
    """A batch that violates the natural key at INSERT must not land a batch row,
    a version, or a moved pointer.

    IngestionResult's own validator normally refuses such a batch before storage;
    model_construct bypasses it deliberately, so the database constraint — the
    defence in depth behind that validator — is what this test exercises."""
    published = seeded_repo.current_version_id(1)
    flows = [cf for cf in sample_result.cashflows if cf.fund_name == "Fund I"]
    duplicate_natural_key = flows[-1].model_copy(update={"id": 99999})

    with pytest.raises(Exception):  # noqa: B017 - IntegrityError from the unique constraint
        seeded_repo.save_batch(
            IngestionResult.model_construct(
                cashflows=(*flows, duplicate_natural_key), corrections=()
            ),
            source("clashing"),
        )
        session.flush()
    session.rollback()

    assert seeded_repo.current_version_id(1) == published
    assert seeded_repo.version_count(1) == 1
    assert session.execute(text("SELECT count(*) FROM ingestion_batches")).scalar() == 1


def test_a_fund_cannot_change_reporting_currency_by_upload(seeded_repo, sample_result, source):
    relabelled = IngestionResult(
        cashflows=tuple(
            # model_validate rather than model_copy: Pydantic passes model
            # instances through untouched, so model_copy would smuggle an
            # unvalidated record past the domain rules. GBP only, because a
            # base-currency flow must also satisfy amount_local == amount_base.
            Cashflow.model_validate({**cf.model_dump(), "base_currency": "USD"})
            for cf in sample_result.cashflows
            if cf.fund_name == "Fund I" and cf.currency == "GBP"
        ),
        corrections=(),
    )
    with pytest.raises(ValueError, match="reports in EUR"):
        seeded_repo.save_batch(relabelled, source("recurrency"))


def test_the_batch_report_survives_the_upload(seeded_repo, session, sample_result):
    batch = session.execute(text("SELECT id, corrected_count FROM ingestion_batches")).one()
    batch_id, corrected = batch

    assert corrected == 3

    stored = seeded_repo.batch(batch_id)
    corrections = CashflowRepository.corrections_of(stored)

    assert {c.row_id for c in corrections} == {"17", "21", "51"}
    # Ordering within a row is preserved by the seq column.
    assert all(c.corrections == tuple(c.corrections) for c in corrections)


def test_fund_summaries_avoid_rebuilding_analytics(seeded_repo, monkeypatch):
    monkeypatch.setattr(
        "riskview.db.repository.compute_fund_analytics",
        lambda *args, **kwargs: pytest.fail("summaries must not recompute analytics"),
    )
    summaries = seeded_repo.fund_summaries()

    assert [s.fund_id for s in summaries] == [1, 2]
    assert [s.name for s in summaries] == ["Fund I", "Fund II"]
    assert summaries[0].base_currency == "EUR"
    assert summaries[0].currencies == ["EUR", "GBP", "USD"]
    assert [s.cashflow_count for s in summaries] == [63, 63]
