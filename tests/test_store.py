"""CashflowStore: batch saves, stable fund ids, and derived analytics."""

import pytest

from riskview.schemas import IngestionResult


def test_funds_get_stable_ids(store, sample_result):
    store.save_batch(sample_result)
    assert store.fund_ids() == [1, 2]
    assert store.analytics(1).fund_name == "Fund I"
    assert store.analytics(2).fund_name == "Fund II"


def test_source_file_is_recorded_per_fund(store, sample_result):
    store.save_batch(sample_result, source_file="cashflows.csv")
    assert store.source_file(1) == "cashflows.csv"
    assert store.source_file(2) == "cashflows.csv"


def test_source_file_is_none_when_not_supplied(store, sample_result):
    store.save_batch(sample_result)
    assert store.source_file(1) is None


def test_source_file_follows_the_latest_batch(store, sample_result):
    store.save_batch(sample_result, source_file="first.csv")
    fund_i_only = IngestionResult(
        cashflows=tuple(cf for cf in sample_result.cashflows if cf.fund_name == "Fund I"),
        corrections=(),
        rejects=(),
    )
    store.save_batch(fund_i_only, source_file="revised.csv")
    assert store.source_file(1) == "revised.csv"
    assert store.source_file(2) == "first.csv"  # untouched by the second batch


def test_cashflows_round_trip_exactly(store, sample_result):
    store.save_batch(sample_result)
    stored = store.cashflows(1)
    original = sorted(
        (cf for cf in sample_result.cashflows if cf.fund_name == "Fund I"), key=lambda cf: cf.id
    )
    assert stored == original


def test_reingest_replaces_not_duplicates(store, sample_result):
    store.save_batch(sample_result)
    store.save_batch(sample_result)
    assert store.fund_ids() == [1, 2]
    assert len(store.cashflows(1)) == 63


def test_partial_batch_leaves_other_funds_untouched(store, sample_result):
    store.save_batch(sample_result)
    fund_i_only = IngestionResult(
        cashflows=tuple(cf for cf in sample_result.cashflows if cf.fund_name == "Fund I"),
        corrections=(),
        rejects=(),
    )
    store.save_batch(fund_i_only)  # one client's upload must never destroy another's data
    assert store.fund_ids() == [1, 2]
    assert len(store.cashflows(2)) == 63
    assert store.analytics(2).fund_name == "Fund II"


def test_unknown_fund_raises_key_error(store, sample_result):
    store.save_batch(sample_result)
    with pytest.raises(KeyError):
        store.cashflows(99)


def test_analytics_cache_invalidated_on_new_batch(store, sample_result):
    store.save_batch(sample_result)
    first = store.analytics(1)
    assert store.analytics(1) is first  # cached
    store.save_batch(sample_result)
    assert store.analytics(1) is not first  # recomputed for the new batch
