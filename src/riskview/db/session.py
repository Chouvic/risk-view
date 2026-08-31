"""Engine and session construction.

Sync SQLAlchemy, deliberately: every route is a sync `def` that FastAPI runs in a
threadpool, and SQLite has no real async I/O, so an async driver would colour the
whole call stack for no throughput.
"""

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from riskview.config import get_settings


def create_db_engine(url: str | None = None, *, enforce_foreign_keys: bool = True) -> Engine:
    """Build an engine with SQLite configured the way a server needs it.

    `enforce_foreign_keys=False` is for the migration engine only: SQLite's
    12-step ALTER — what Alembic's batch mode performs — requires foreign keys off.
    """
    url = url or get_settings().database_url
    connect_args = {}
    if url.startswith("sqlite"):
        # FastAPI runs sync routes across a threadpool, so a connection is used by
        # whichever worker checks it out of the pool.
        connect_args["check_same_thread"] = False

    engine = create_engine(url, connect_args=connect_args, future=True)
    if engine.dialect.name == "sqlite":
        _configure_sqlite(engine, enforce_foreign_keys=enforce_foreign_keys)
    return engine


def _configure_sqlite(engine: Engine, *, enforce_foreign_keys: bool) -> None:
    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_connection, _record):
        # pysqlite emits its own BEGIN before DML and none before SELECT, which
        # breaks SQLAlchemy's transaction bookkeeping. Disabling it here and
        # emitting BEGIN below hands transaction control back to SQLAlchemy.
        dbapi_connection.isolation_level = None

        # PRAGMAs are per connection, so this has to run on every checkout from
        # the pool — setting them once at startup would leave pooled connections
        # with foreign keys silently off.
        cursor = dbapi_connection.cursor()
        cursor.execute(f"PRAGMA foreign_keys={'ON' if enforce_foreign_keys else 'OFF'}")
        cursor.execute("PRAGMA journal_mode=WAL")  # readers don't block the ingest writer
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

    @event.listens_for(engine, "begin")
    def _on_begin(conn):
        conn.exec_driver_sql("BEGIN")


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    # expire_on_commit=False so objects stay readable after the request's commit.
    return sessionmaker(bind=engine, expire_on_commit=False, future=True)


@contextmanager
def session_scope(session_factory: sessionmaker[Session]) -> Iterator[Session]:
    """A unit of work: commit on success, roll back on any exception.

    Used by the CLI and by tests. The API gets the same semantics through the
    get_session dependency.
    """
    session = session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
