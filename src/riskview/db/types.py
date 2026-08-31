"""Column types that survive SQLite's shortcomings.

SQLite has neither an exact numeric type nor a timezone-aware timestamp, so both
have to be encoded and decoded explicitly. Each type keeps the native PostgreSQL
column when that dialect is in play, so the port is a URL change.
"""

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import DateTime, Numeric, String
from sqlalchemy.types import TypeDecorator


class ExactDecimal(TypeDecorator):
    """A Decimal stored losslessly: TEXT on SQLite, NUMERIC on PostgreSQL.

    SQLAlchemy's own Numeric round-trips through float on SQLite, which turns
    Decimal("2864345.67") into Decimal("2864345.66999999992549419403076171875").
    str(Decimal) -> Decimal(str) is exact *and* preserves scale, so
    Decimal("-100000000") comes back as itself rather than Decimal("-100000000.00")
    — the analytics compare amounts for equality, so scale drift is a real bug.

    The trade-off: TEXT sorts and sums lexicographically, so never ORDER BY or
    SUM an amount in SQL under SQLite. Every arithmetic operation in this project
    already happens in riskview.analytics, and PostgreSQL's NUMERIC lifts the
    restriction entirely.
    """

    impl = String
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(Numeric(28, 6))
        return dialect.type_descriptor(String(40))

    def process_bind_param(self, value: Decimal | None, dialect) -> Decimal | str | None:
        if value is None or dialect.name == "postgresql":
            return value
        return str(value)

    def process_result_value(self, value, dialect) -> Decimal | None:
        if value is None or isinstance(value, Decimal):
            return value
        return Decimal(value)


class UtcDateTime(TypeDecorator):
    """A timezone-aware datetime. SQLite drops the offset, so it is re-attached.

    Naive values are rejected rather than assumed to be UTC: guessing is how
    timestamps end up silently shifted by the writer's local offset.
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetime rejected; pass an aware datetime in UTC")
        return value.astimezone(UTC)

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        if value is None or value.tzinfo is not None:
            return value
        return value.replace(tzinfo=UTC)
