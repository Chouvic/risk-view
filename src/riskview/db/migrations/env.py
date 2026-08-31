"""Alembic environment.

The database URL is never written in alembic.ini — it comes from
riskview.config, the same place the application reads it, so `alembic upgrade
head` and a running server cannot disagree about which database they mean.
`alembic -x db_url=...` overrides it for a one-off (tests use this).

render_as_batch is on because SQLite cannot ALTER a column or a constraint: every
future migration is emitted as the copy-and-rename dance instead, which is also
why db/base.py carries a naming convention.
"""

from logging.config import fileConfig

from alembic import context

from riskview.config import get_settings
from riskview.db.base import Base
from riskview.db.session import create_db_engine

# Imported for the side effect of registering every table on Base.metadata.
from riskview.db import models  # noqa: F401  # isort: skip

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _database_url() -> str:
    """`-x db_url=...` wins, then a URL injected programmatically, then settings."""
    from_cli = context.get_x_argument(as_dictionary=True).get("db_url")
    return from_cli or config.attributes.get("db_url") or get_settings().database_url


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # Foreign keys off: SQLite implements ALTER as a 12-step table rebuild, which
    # it refuses to perform while foreign key enforcement is on.
    engine = create_db_engine(_database_url(), enforce_foreign_keys=False)

    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()

    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
