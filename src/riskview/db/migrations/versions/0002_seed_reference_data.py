"""seed reference data

Currencies and cashflow types are part of the schema contract, not business data:
every currency and type column is a foreign key into these tables, so the schema
is not usable until they exist. That makes them the one legitimate case for data
in a migration. Client cashflow files are business data and are never seeded this
way — they go through the ordinary ingestion pipeline.

Supporting a new currency is an insert here plus a member on
riskview.schemas.CurrencyCode; the two must stay in step, which
tests/test_migrations.py asserts.

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-30

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CURRENCIES = [
    {"code": "EUR", "name": "Euro"},
    {"code": "GBP", "name": "Pound Sterling"},
    {"code": "USD", "name": "US Dollar"},
]

CASHFLOW_TYPES = [
    {"code": "Investment"},
    {"code": "Interest"},
    {"code": "Principal Repayment"},
]

# Minimal table definitions: a migration must not import the ORM models, which
# describe the schema as it is *today* rather than as it was at this revision.
currencies = sa.table("currencies", sa.column("code", sa.String), sa.column("name", sa.String))
cashflow_types = sa.table("cashflow_types", sa.column("code", sa.String))


def upgrade() -> None:
    op.bulk_insert(currencies, CURRENCIES)
    op.bulk_insert(cashflow_types, CASHFLOW_TYPES)


def downgrade() -> None:
    codes = [row["code"] for row in CURRENCIES]
    op.execute(currencies.delete().where(currencies.c.code.in_(codes)))
    codes = [row["code"] for row in CASHFLOW_TYPES]
    op.execute(cashflow_types.delete().where(cashflow_types.c.code.in_(codes)))
