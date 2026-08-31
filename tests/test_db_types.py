"""ExactDecimal and UtcDateTime: what SQLite would otherwise corrupt.

The probe table gets its own Base so it never enters riskview's metadata —
otherwise tests/test_migrations.py would report it as schema drift.
"""

from datetime import UTC, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, ClassVar

import pytest
from sqlalchemy import String, create_engine, text
from sqlalchemy.exc import StatementError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

from riskview.db.types import ExactDecimal, UtcDateTime


class ProbeBase(DeclarativeBase):
    type_annotation_map: ClassVar[dict[Any, Any]] = {Decimal: ExactDecimal, datetime: UtcDateTime}


class Probe(ProbeBase):
    __tablename__ = "probe"

    id: Mapped[int] = mapped_column(primary_key=True)
    amount: Mapped[Decimal | None] = mapped_column(default=None)
    moment: Mapped[datetime | None] = mapped_column(default=None)
    label: Mapped[str] = mapped_column(String(16), default="")


@pytest.fixture()
def probe_session(tmp_path):
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'probe.db'}")
    ProbeBase.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def _round_trip(session: Session, **columns):
    session.add(Probe(**columns))
    session.commit()
    session.expunge_all()
    return session.get(Probe, 1)


@pytest.mark.parametrize(
    "raw",
    ["-100000000", "2864345.67", "0.00", "-0.01", "0", "1E+6", "6000000", "-114573786"],
)
def test_exact_decimal_preserves_value_and_scale(probe_session, raw):
    value = Decimal(raw)
    stored = _round_trip(probe_session, amount=value).amount

    assert stored == value
    # == alone would not catch scale drift: Decimal("1.0") == Decimal("1") is True.
    assert str(stored) == str(value)


def test_numeric_would_have_corrupted_the_sample_amounts():
    """Why ExactDecimal exists at all. This is what SQLAlchemy's Numeric does to
    an amount on SQLite, and 2864345.67 is a real row in samples/cashflows.csv."""
    assert Decimal(float(Decimal("2864345.67"))) != Decimal("2864345.67")


def test_exact_decimal_stores_text_not_a_float(probe_session):
    _round_trip(probe_session, amount=Decimal("2864345.67"))
    stored = probe_session.execute(text("SELECT amount, typeof(amount) FROM probe")).one()
    assert stored == ("2864345.67", "text")


def test_null_decimal_round_trips(probe_session):
    assert _round_trip(probe_session, amount=None).amount is None


def test_utc_datetime_returns_aware(probe_session):
    moment = datetime(2026, 3, 31, 9, 30, tzinfo=UTC)
    assert _round_trip(probe_session, moment=moment).moment == moment


def test_utc_datetime_normalises_other_offsets(probe_session):
    moment = datetime(2026, 3, 31, 11, 30, tzinfo=timezone(timedelta(hours=2)))
    stored = _round_trip(probe_session, moment=moment).moment

    assert stored == moment
    assert stored.tzinfo is UTC


def test_utc_datetime_rejects_naive(probe_session):
    # SQLAlchemy wraps a bind-param failure, so the ValueError arrives as its cause.
    with pytest.raises(StatementError, match="naive datetime") as caught:
        _round_trip(probe_session, moment=datetime(2026, 3, 31, 9, 30))  # noqa: DTZ001

    assert isinstance(caught.value.orig, ValueError)
