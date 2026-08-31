"""Engine configuration: the PRAGMAs and the pysqlite transaction fix.

These are the settings that silently do nothing when they are wrong — foreign
keys that never fire, rollbacks that do not roll back — so each is asserted
against a real connection rather than trusted.
"""

import pytest
from sqlalchemy import text

from riskview.db.session import create_db_engine, create_session_factory, session_scope


@pytest.fixture()
def engine(tmp_path):
    engine = create_db_engine(f"sqlite+pysqlite:///{tmp_path / 'session.db'}")
    yield engine
    engine.dispose()


def _pragma(engine, name):
    with engine.connect() as connection:
        return connection.execute(text(f"PRAGMA {name}")).scalar()


def test_foreign_keys_are_on_for_pooled_connections(engine):
    assert _pragma(engine, "foreign_keys") == 1
    engine.dispose()  # force a fresh connection; the pragma must be reapplied
    assert _pragma(engine, "foreign_keys") == 1


def test_migration_engine_turns_foreign_keys_off(tmp_path):
    """Alembic's batch mode rebuilds the table, which SQLite refuses with FKs on."""
    engine = create_db_engine(f"sqlite+pysqlite:///{tmp_path / 'm.db'}", enforce_foreign_keys=False)
    assert _pragma(engine, "foreign_keys") == 0
    engine.dispose()


def test_wal_and_busy_timeout_are_set(engine):
    assert _pragma(engine, "journal_mode") == "wal"
    assert _pragma(engine, "busy_timeout") == 5000


def test_rollback_actually_rolls_back(engine):
    """Proves the isolation_level=None / explicit-BEGIN pair works. Under
    pysqlite's default handling this write would already be committed."""
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE t (id INTEGER PRIMARY KEY)"))

    with engine.connect() as connection:
        connection.execute(text("INSERT INTO t (id) VALUES (1)"))
        connection.rollback()

    with engine.connect() as connection:
        assert connection.execute(text("SELECT count(*) FROM t")).scalar() == 0


def test_session_scope_rolls_back_on_error(engine):
    session_factory = create_session_factory(engine)
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE t (id INTEGER PRIMARY KEY)"))

    with pytest.raises(RuntimeError), session_scope(session_factory) as session:
        session.execute(text("INSERT INTO t (id) VALUES (1)"))
        raise RuntimeError("boom")

    with session_scope(session_factory) as session:
        assert session.execute(text("SELECT count(*) FROM t")).scalar() == 0
