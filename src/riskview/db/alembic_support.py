"""Running and checking migrations from Python.

The application never creates tables — `alembic upgrade head` is the only way
schema comes into existence, so the migrations are exercised by every test run
and cannot drift into being untested.
"""

from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Engine

_PACKAGE_ROOT = Path(__file__).resolve().parents[1]
_REPO_ROOT = _PACKAGE_ROOT.parents[1]
MIGRATIONS_PATH = _PACKAGE_ROOT / "db" / "migrations"


def alembic_config(url: str | None = None) -> Config:
    config = Config(_REPO_ROOT / "alembic.ini") if (_REPO_ROOT / "alembic.ini").exists() else Config()
    config.set_main_option("script_location", str(MIGRATIONS_PATH))
    if url is not None:
        # env.py reads this; alembic.ini deliberately carries no sqlalchemy.url.
        config.attributes["db_url"] = url
    return config


def upgrade_to_head(url: str) -> None:
    command.upgrade(alembic_config(url), "head")


def current_and_head(engine: Engine) -> tuple[set[str], set[str]]:
    script = ScriptDirectory.from_config(alembic_config())
    with engine.connect() as connection:
        current = set(MigrationContext.configure(connection).get_current_heads())
    return current, set(script.get_heads())


def schema_is_current(engine: Engine) -> None:
    """Raise unless the database is at the latest revision.

    Failing at startup beats failing on the first query with a missing-column
    error three endpoints deep.
    """
    current, heads = current_and_head(engine)
    if current != heads:
        raise RuntimeError(
            f"database schema is at {sorted(current) or ['nothing']}, expected {sorted(heads)}; "
            f"run `alembic upgrade head`"
        )
