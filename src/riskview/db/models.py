"""ORM tables.

Two ledgers, as docs/design.md describes. The *audit* ledger (ingestion_batches
and its correction rows) is immutable: one row per uploaded file, keyed by the
SHA-256 of its bytes. Only accepted batches exist here — ingestion is
all-or-nothing, so a file with any bad row is refused before storage is reached.
The *projection* ledger is versioned: each batch mints a new projection_versions
row per fund it contains, writes that version's cashflows and everything derived
from them, and only then moves the fund's pointer in fund_current_version.
Nothing is ever updated in place, so a revision is version N+1 and a rollback is
a pointer move.

Versions are per fund rather than per batch (design.md:123-127 shows one global
version) because a file containing one client's fund must not disturb another's.

Enum-valued columns are String + a foreign key to a reference table rather than
sqlalchemy.Enum: Enum on SQLite becomes VARCHAR + CHECK and needs a table rebuild
to extend, and it persists the member *name*, so CashflowType.PRINCIPAL_REPAYMENT
would be stored as "PRINCIPAL_REPAYMENT" instead of "Principal Repayment".
"""

from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from riskview.db.base import Base

# scope values for nav_schedules
SCOPE_FUND = "fund"
SCOPE_POSITION = "position"


def _now() -> datetime:
    return datetime.now(UTC)


# --------------------------------------------------------------------------
# Reference data — seeded by a migration, not by the application
# --------------------------------------------------------------------------


class Currency(Base):
    """ISO 4217 codes the platform trades. The closed set that turns a typo like
    'GPB' into a foreign-key violation as well as a validation error."""

    __tablename__ = "currencies"

    code: Mapped[str] = mapped_column(String(3), primary_key=True)
    name: Mapped[str] = mapped_column(String(64))


class CashflowTypeRef(Base):
    __tablename__ = "cashflow_types"

    code: Mapped[str] = mapped_column(String(32), primary_key=True)


# --------------------------------------------------------------------------
# Audit ledger — one immutable row per uploaded file
# --------------------------------------------------------------------------


class IngestionBatch(Base):
    __tablename__ = "ingestion_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_filename: Mapped[str] = mapped_column(String(255))
    content_sha256: Mapped[str] = mapped_column(String(64), unique=True)
    byte_size: Mapped[int]
    received_at: Mapped[datetime] = mapped_column(default=_now)
    accepted_count: Mapped[int]
    corrected_count: Mapped[int]

    corrections: Mapped[list["IngestionCorrection"]] = relationship(
        back_populates="batch",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="IngestionCorrection.line, IngestionCorrection.seq",
    )


class IngestionCorrection(Base):
    """One automatic fix applied to one source row. `seq` preserves the order the
    fixes were reported in, so RowCorrection.corrections round-trips as a tuple."""

    __tablename__ = "ingestion_corrections"

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int] = mapped_column(
        ForeignKey("ingestion_batches.id", ondelete="CASCADE"), index=True
    )
    line: Mapped[int]
    row_id: Mapped[str] = mapped_column(String(64))
    seq: Mapped[int]
    message: Mapped[str] = mapped_column(Text)

    batch: Mapped[IngestionBatch] = relationship(back_populates="corrections")


# --------------------------------------------------------------------------
# Projection ledger — versioned, immutable, pointed at by fund_current_version
# --------------------------------------------------------------------------


class Fund(Base):
    """The reporting unit. Surrogate id because names change while references
    shouldn't (design.md:65)."""

    __tablename__ = "funds"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    base_currency: Mapped[str] = mapped_column(String(3), ForeignKey("currencies.code"))
    created_at: Mapped[datetime] = mapped_column(default=_now)


class ProjectionVersion(Base):
    """One fund's cashflows as of one upload, plus everything derived from them."""

    __tablename__ = "projection_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    fund_id: Mapped[int] = mapped_column(ForeignKey("funds.id", ondelete="CASCADE"), index=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("ingestion_batches.id"), index=True)
    version_no: Mapped[int]
    # Denormalised: the only thing GET /funds needs, and it saves fetching every
    # cashflow row per fund just to call len() on them.
    cashflow_count: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(default=_now)

    cashflows: Mapped[list["CashflowRow"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, order_by="CashflowRow.source_row_id"
    )
    nav_schedules: Mapped[list["NavScheduleRow"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True
    )
    hedges: Mapped[list["FxForwardTradeRow"]] = relationship(
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="FxForwardTradeRow.sell_currency, FxForwardTradeRow.trade_date",
    )

    __table_args__ = (UniqueConstraint("fund_id", "version_no", name="uq_projection_versions_fund_version"),)


class FundCurrentVersion(Base):
    """The pointer serving reads from — its own table so funds and
    projection_versions are not mutually referential, which SQLite cannot express
    (no ALTER TABLE ADD CONSTRAINT). Publishing a version is one row upsert."""

    __tablename__ = "fund_current_version"

    fund_id: Mapped[int] = mapped_column(ForeignKey("funds.id", ondelete="CASCADE"), primary_key=True)
    version_id: Mapped[int] = mapped_column(ForeignKey("projection_versions.id"), unique=True)
    updated_at: Mapped[datetime] = mapped_column(default=_now)


class CashflowRow(Base):
    """A validated cashflow at rest.

    `source_row_id` is the client's row id, kept for reconciliation; it is not the
    primary key, because two funds or two versions can both carry row 17.
    """

    __tablename__ = "cashflows"

    id: Mapped[int] = mapped_column(primary_key=True)
    version_id: Mapped[int] = mapped_column(
        ForeignKey("projection_versions.id", ondelete="CASCADE"), index=True
    )
    source_row_id: Mapped[int]
    cashflow_date: Mapped[date]
    cashflow_type: Mapped[str] = mapped_column(String(32), ForeignKey("cashflow_types.code"))
    currency: Mapped[str] = mapped_column(String(3), ForeignKey("currencies.code"))
    amount_local: Mapped[Decimal]
    amount_base: Mapped[Decimal]
    base_currency: Mapped[str] = mapped_column(String(3), ForeignKey("currencies.code"))

    __table_args__ = (
        UniqueConstraint("version_id", "source_row_id", name="uq_cashflows_source_row"),
        # design.md:24's natural key, enforced. Named explicitly: the convention
        # would generate a 63-character name that PostgreSQL truncates.
        UniqueConstraint(
            "version_id", "currency", "cashflow_date", "cashflow_type", name="uq_cashflows_natural_key"
        ),
    )


# --------------------------------------------------------------------------
# Derived analytics — computed on write, served without recomputation
# --------------------------------------------------------------------------


class NavScheduleRow(Base):
    """A NAV schedule and its IRR.

    `scope` is load-bearing: a fund reporting in EUR that also holds an EUR
    position has two EUR schedules per version — one in local terms, one
    fund-level in base terms. Fund I in the sample is exactly that case, so
    UNIQUE(version_id, currency) would reject the sample on its first insert.

    FundAnalytics.fund_irr is the scope='fund' row's irr and currency_irr is the
    map over scope='position' rows, so no separate IRR table is needed.
    """

    __tablename__ = "nav_schedules"

    id: Mapped[int] = mapped_column(primary_key=True)
    version_id: Mapped[int] = mapped_column(
        ForeignKey("projection_versions.id", ondelete="CASCADE"), index=True
    )
    scope: Mapped[str] = mapped_column(String(8))
    currency: Mapped[str] = mapped_column(String(3), ForeignKey("currencies.code"))
    irr: Mapped[float]

    points: Mapped[list["NavPointRow"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, order_by="NavPointRow.point_date"
    )

    __table_args__ = (
        UniqueConstraint("version_id", "scope", "currency", name="uq_nav_schedules_version_scope_ccy"),
        CheckConstraint(f"scope IN ('{SCOPE_FUND}', '{SCOPE_POSITION}')", name="scope"),
    )


class NavPointRow(Base):
    __tablename__ = "nav_points"

    id: Mapped[int] = mapped_column(primary_key=True)
    schedule_id: Mapped[int] = mapped_column(
        ForeignKey("nav_schedules.id", ondelete="CASCADE"), index=True
    )
    point_date: Mapped[date]
    nav: Mapped[Decimal]
    open_exposure: Mapped[Decimal]

    __table_args__ = (UniqueConstraint("schedule_id", "point_date", name="uq_nav_points_schedule_date"),)


class FxForwardTradeRow(Base):
    """A recommended FX forward. Ordering by (sell_currency, trade_date)
    reproduces the tuple compute_fund_analytics builds, which iterates
    sorted(nav_schedules) and then each schedule's points in date order."""

    __tablename__ = "fx_forward_trades"

    id: Mapped[int] = mapped_column(primary_key=True)
    version_id: Mapped[int] = mapped_column(ForeignKey("projection_versions.id", ondelete="CASCADE"))
    trade_date: Mapped[date]
    value_date: Mapped[date]
    sell_currency: Mapped[str] = mapped_column(String(3), ForeignKey("currencies.code"))
    buy_currency: Mapped[str] = mapped_column(String(3), ForeignKey("currencies.code"))
    notional_sell: Mapped[Decimal]
    coverage_ratio: Mapped[float]

    __table_args__ = (
        Index("ix_fx_forward_trades_version_ccy_date", "version_id", "sell_currency", "trade_date"),
    )
