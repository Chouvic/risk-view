"""The constraints that would fail silently if they were wrong.

A foreign key with PRAGMA foreign_keys off, or a unique constraint that never
fires, looks exactly like a working one until bad data is already stored.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from riskview.db.models import SCOPE_FUND, SCOPE_POSITION


def _insert(session, sql: str, **params) -> None:
    session.execute(text(sql), params)
    session.flush()


def _fund_with_version(session) -> int:
    _insert(session, "INSERT INTO funds (id, name, base_currency, created_at) VALUES (1, 'F', 'EUR', '2026-01-01')")
    _insert(
        session,
        "INSERT INTO ingestion_batches (id, source_filename, content_sha256, byte_size, received_at,"
        " status, accepted_count, corrected_count, rejected_count)"
        " VALUES (1, 'f.csv', 'abc', 1, '2026-01-01', 'accepted', 1, 0, 0)",
    )
    _insert(
        session,
        "INSERT INTO projection_versions (id, fund_id, batch_id, version_no, cashflow_count, created_at)"
        " VALUES (1, 1, 1, 1, 0, '2026-01-01')",
    )
    return 1


def test_foreign_keys_are_enforced(session):
    """PRAGMA foreign_keys is off by default in SQLite, which would make every
    foreign key in the schema decorative."""
    with pytest.raises(IntegrityError):
        _insert(
            session,
            "INSERT INTO funds (id, name, base_currency, created_at)"
            " VALUES (1, 'F', 'JPY', '2026-01-01')",
        )


def test_unknown_cashflow_type_is_rejected(session):
    version = _fund_with_version(session)
    with pytest.raises(IntegrityError):
        _insert(
            session,
            "INSERT INTO cashflows (version_id, source_row_id, cashflow_date, cashflow_type, currency,"
            " amount_local, amount_base, base_currency)"
            " VALUES (:v, 1, '2026-01-01', 'Dividend', 'EUR', '1', '1', 'EUR')",
            v=version,
        )


def test_natural_key_is_unique_within_a_version(session):
    version = _fund_with_version(session)
    row = (
        "INSERT INTO cashflows (version_id, source_row_id, cashflow_date, cashflow_type, currency,"
        " amount_local, amount_base, base_currency)"
        " VALUES (:v, :row_id, '2026-01-01', 'Interest', 'GBP', '1', '1', 'EUR')"
    )
    _insert(session, row, v=version, row_id=1)

    # Different source row id, same (currency, date, type): design.md's natural key.
    with pytest.raises(IntegrityError):
        _insert(session, row, v=version, row_id=2)


def test_source_row_id_is_unique_within_a_version(session):
    version = _fund_with_version(session)
    row = (
        "INSERT INTO cashflows (version_id, source_row_id, cashflow_date, cashflow_type, currency,"
        " amount_local, amount_base, base_currency)"
        " VALUES (:v, 1, :date, 'Interest', 'GBP', '1', '1', 'EUR')"
    )
    _insert(session, row, v=version, date="2026-01-01")
    with pytest.raises(IntegrityError):
        _insert(session, row, v=version, date="2026-04-01")


def test_fund_names_are_unique(session):
    _fund_with_version(session)
    with pytest.raises(IntegrityError):
        _insert(
            session,
            "INSERT INTO funds (id, name, base_currency, created_at) VALUES (2, 'F', 'EUR', '2026-01-01')",
        )


def test_a_version_number_is_unique_per_fund(session):
    _fund_with_version(session)
    with pytest.raises(IntegrityError):
        _insert(
            session,
            "INSERT INTO projection_versions (id, fund_id, batch_id, version_no, cashflow_count, created_at)"
            " VALUES (2, 1, 1, 1, 0, '2026-01-01')",
        )


def test_nav_schedule_scope_allows_the_base_currency_twice(session):
    """Fund I reports in EUR and holds an EUR position, so its version carries
    two EUR schedules. Without `scope` in the unique key the sample would not load."""
    version = _fund_with_version(session)
    row = "INSERT INTO nav_schedules (version_id, scope, currency, irr) VALUES (:v, :scope, 'EUR', 0.1)"

    _insert(session, row, v=version, scope=SCOPE_FUND)
    _insert(session, row, v=version, scope=SCOPE_POSITION)

    with pytest.raises(IntegrityError):  # but the same scope twice is still a clash
        _insert(session, row, v=version, scope=SCOPE_POSITION)


def test_nav_schedule_scope_is_a_closed_set(session):
    version = _fund_with_version(session)
    with pytest.raises(IntegrityError):
        _insert(
            session,
            "INSERT INTO nav_schedules (version_id, scope, currency, irr) VALUES (:v, 'deal', 'EUR', 0.1)",
            v=version,
        )


def test_deleting_a_version_clears_everything_derived_from_it(session):
    version = _fund_with_version(session)
    _insert(
        session,
        "INSERT INTO cashflows (version_id, source_row_id, cashflow_date, cashflow_type, currency,"
        " amount_local, amount_base, base_currency)"
        " VALUES (:v, 1, '2026-01-01', 'Interest', 'GBP', '1', '1', 'EUR')",
        v=version,
    )
    _insert(
        session,
        "INSERT INTO nav_schedules (id, version_id, scope, currency, irr) VALUES (1, :v, 'fund', 'EUR', 0.1)",
        v=version,
    )
    _insert(
        session,
        "INSERT INTO nav_points (schedule_id, point_date, nav, open_exposure)"
        " VALUES (1, '2026-01-01', '0.00', '0.00')",
    )

    _insert(session, "DELETE FROM projection_versions WHERE id = :v", v=version)

    for table in ("cashflows", "nav_schedules", "nav_points"):
        assert session.execute(text(f"SELECT count(*) FROM {table}")).scalar() == 0


def test_a_published_version_cannot_be_deleted_out_from_under_the_pointer(session):
    version = _fund_with_version(session)
    _insert(
        session,
        "INSERT INTO fund_current_version (fund_id, version_id, updated_at)"
        " VALUES (1, :v, '2026-01-01')",
        v=version,
    )
    # fund_current_version.version_id has no ON DELETE, so serving cannot be left
    # pointing at nothing.
    with pytest.raises(IntegrityError):
        _insert(session, "DELETE FROM projection_versions WHERE id = :v", v=version)
