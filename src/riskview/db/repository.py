"""The one way validated data reaches storage, and the only way it comes back.

Writes are versioned and immutable: a batch mints a projection version per fund
it contains, writes that version's cashflows and everything derived from them,
and moves the fund's pointer last. Reads follow the pointer, so a reader sees
either the previous version or the new one, never a half-written batch.

Rows are mapped to the Pydantic models in riskview.schemas explicitly rather than
via from_attributes. Three reasons: Cashflow.fund_name comes from a join, not the
row; Cashflow.id is the client's row id while CashflowRow.id is the surrogate key,
so the names cannot align; and FundAnalytics is assembled from several result sets
anyway. Validation therefore runs on the read path too, so a corrupted row fails
loudly instead of being trusted.
"""

import hashlib
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from riskview.analytics import compute_fund_analytics
from riskview.db.models import (
    SCOPE_FUND,
    SCOPE_POSITION,
    CashflowRow,
    Fund,
    FundCurrentVersion,
    FxForwardTradeRow,
    IngestionBatch,
    IngestionCorrection,
    NavPointRow,
    NavScheduleRow,
    ProjectionVersion,
)
from riskview.schemas import (
    Cashflow,
    FundAnalytics,
    FundSummary,
    FundVersionOutcome,
    FxForwardTrade,
    IngestionResult,
    NavPoint,
    NavSchedule,
    RowCorrection,
    VersionAction,
    VersionInfo,
)

__all__ = [
    "BatchSaveOutcome",
    "BatchSource",
    "CashflowRepository",
    "IngestionBatch",
    "UnknownFundError",
    "canonical_content_hash",
]


def canonical_content_hash(cashflows: Iterable[Cashflow]) -> str:
    """Hash one fund's schedule by content, so a re-export mints nothing.

    Two hashes with two jobs: the batch's byte SHA answers "have these exact bytes
    been uploaded before?", while this hash answers "is this fund's schedule
    actually different?". Reordered rows, renumbered ids, or a CSV-to-Excel
    round-trip all change the bytes but not the content, and must not mint a
    version — a phantom version re-runs analytics and shows a revision that never
    happened. Neither hash is an identity: versions are named by version_no.

    Client row ids are excluded (renumbering is not a revision) and so is
    fund_name (the hash is computed per fund). Decimals are serialised as
    `format(value.normalize(), "f")`: str() alone is scale-sensitive ("100" vs
    "100.00"), and normalize() alone re-introduces exponent notation
    (Decimal("100.00").normalize() == Decimal("1E+2")). Zero is special-cased
    because normalize() preserves the sign of negative zero.
    """

    def number(value: Decimal) -> str:
        return "0" if value == 0 else format(value.normalize(), "f")

    lines = sorted(
        "|".join(
            (
                cf.currency.value,
                cf.cashflow_date.isoformat(),
                cf.cashflow_type.value,
                number(cf.amount_local),
                number(cf.amount_base),
                cf.base_currency.value,
            )
        )
        for cf in cashflows
    )
    return hashlib.sha256("\n".join(lines).encode()).hexdigest()


class UnknownFundError(KeyError):
    """Raised for a fund with no published projection.

    Subclasses KeyError so the API's `except KeyError -> 404` contract keeps
    working while the message says something useful.
    """


@dataclass(frozen=True)
class BatchSource:
    """Where an uploaded batch came from. The hash is the idempotency key."""

    filename: str
    content_sha256: str
    byte_size: int

    @classmethod
    def of(cls, data: bytes, filename: str) -> "BatchSource":
        return cls(
            filename=filename or "unnamed",
            content_sha256=hashlib.sha256(data).hexdigest(),
            byte_size=len(data),
        )


@dataclass(frozen=True)
class BatchSaveOutcome:
    """One save_batch call's effect: the audit row, and what happened per fund."""

    batch: IngestionBatch
    funds: tuple[FundVersionOutcome, ...]


class CashflowRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    # ------------------------------------------------------------------
    # Write path
    # ------------------------------------------------------------------

    def find_batch(self, content_sha256: str) -> IngestionBatch | None:
        """The dedupe lookup: these exact bytes have been ingested before."""
        return self._session.scalar(
            select(IngestionBatch).where(IngestionBatch.content_sha256 == content_sha256)
        )

    def save_batch(self, result: IngestionResult, source: BatchSource) -> BatchSaveOutcome:
        """Persist one uploaded file as a new projection version per changed fund.

        A fund whose canonical content hash matches its current version is left
        untouched — the batch is still recorded (a submission is an audit fact
        even when it changes nothing), but no version is minted and no analytics
        run. Does not commit — the caller owns the transaction, so a failure
        anywhere below leaves no batch row, no partial version, and every pointer
        still on the last good version.
        """
        batch = self._record_batch(result, source)

        by_fund: dict[str, list[Cashflow]] = defaultdict(list)
        for cashflow in result.cashflows:
            by_fund[cashflow.fund_name].append(cashflow)

        # Sorted by name, not file order: fund ids are assigned on first sight and
        # must not depend on which row happened to come first in the upload.
        outcomes = tuple(
            self._publish_version(batch, name, sorted(by_fund[name], key=lambda cf: cf.id))
            for name in sorted(by_fund)
        )
        return BatchSaveOutcome(batch=batch, funds=outcomes)

    def _record_batch(self, result: IngestionResult, source: BatchSource) -> IngestionBatch:
        summary = result.summary()
        batch = IngestionBatch(
            source_filename=source.filename,
            content_sha256=source.content_sha256,
            byte_size=source.byte_size,
            accepted_count=summary["accepted"],
            corrected_count=summary["corrected"],
        )
        batch.corrections = [
            IngestionCorrection(line=row.line, row_id=row.row_id, seq=seq, message=message)
            for row in result.corrections
            for seq, message in enumerate(row.corrections)
        ]
        self._session.add(batch)
        self._session.flush()
        return batch

    def _publish_version(
        self, batch: IngestionBatch, name: str, cashflows: list[Cashflow]
    ) -> FundVersionOutcome:
        fund = self._get_or_create_fund(name, cashflows[0].base_currency.value)

        # Mint only on real change. The hash is over validated content — reordered
        # rows, renumbered ids, or a CSV-to-Excel re-export land here with a fresh
        # byte SHA but an identical schedule, and must not produce a version.
        content_hash = canonical_content_hash(cashflows)
        current = self._current_version_row(fund.id)
        if current is not None and current.content_hash == content_hash:
            return FundVersionOutcome(
                fund_id=fund.id,
                fund_name=fund.name,
                action=VersionAction.UNCHANGED,
                version_no=current.version_no,
            )

        version = ProjectionVersion(
            fund_id=fund.id,
            batch_id=batch.id,
            version_no=self._next_version_no(fund.id),
            content_hash=content_hash,
            cashflow_count=len(cashflows),
        )
        version.cashflows = [
            CashflowRow(
                source_row_id=cf.id,
                cashflow_date=cf.cashflow_date,
                cashflow_type=cf.cashflow_type.value,
                currency=cf.currency.value,
                amount_local=cf.amount_local,
                amount_base=cf.amount_base,
                base_currency=cf.base_currency.value,
            )
            for cf in cashflows
        ]

        # Compute on write: serving never runs the analytics engine (design.md Part 4).
        analytics = compute_fund_analytics(fund.id, cashflows)
        version.nav_schedules = [
            self._schedule_row(SCOPE_FUND, analytics.fund_nav_schedule),
            *(
                self._schedule_row(SCOPE_POSITION, schedule)
                for _, schedule in sorted(analytics.nav_schedules.items())
            ),
        ]
        version.hedges = [
            FxForwardTradeRow(
                trade_date=trade.trade_date,
                value_date=trade.value_date,
                sell_currency=trade.sell_currency.value,
                buy_currency=trade.buy_currency.value,
                notional_sell=trade.notional_sell,
                coverage_ratio=trade.coverage_ratio,
            )
            for trade in analytics.hedges
        ]

        self._session.add(version)
        self._session.flush()
        self._point_at(fund.id, version.id)
        return FundVersionOutcome(
            fund_id=fund.id,
            fund_name=fund.name,
            action=VersionAction.NEW if version.version_no == 1 else VersionAction.REVISED,
            version_no=version.version_no,
        )

    def _current_version_row(self, fund_id: int) -> ProjectionVersion | None:
        return self._session.scalar(
            select(ProjectionVersion)
            .join(FundCurrentVersion, FundCurrentVersion.version_id == ProjectionVersion.id)
            .where(FundCurrentVersion.fund_id == fund_id)
        )

    @staticmethod
    def _schedule_row(scope: str, schedule: NavSchedule) -> NavScheduleRow:
        return NavScheduleRow(
            scope=scope,
            currency=schedule.currency.value,
            irr=schedule.irr,
            points=[
                NavPointRow(point_date=point.date, nav=point.nav, open_exposure=point.open_exposure)
                for point in schedule.points
            ],
        )

    def _get_or_create_fund(self, name: str, base_currency: str) -> Fund:
        fund = self._session.scalar(select(Fund).where(Fund.name == name))
        if fund is None:
            fund = self._insert_fund(name, base_currency)
        elif fund.base_currency != base_currency:
            # A fund changing its reporting currency is a business event, not
            # something an upload should do silently to every historical figure.
            raise ValueError(
                f"fund {name!r} reports in {fund.base_currency}, but the file says {base_currency}"
            )
        return fund

    def _insert_fund(self, name: str, base_currency: str) -> Fund:
        savepoint = self._session.begin_nested()
        try:
            fund = Fund(name=name, base_currency=base_currency)
            self._session.add(fund)
            savepoint.commit()
        except IntegrityError:
            # Lost a race against a concurrent writer; uq_funds_name caught it.
            savepoint.rollback()
            return self._session.scalars(select(Fund).where(Fund.name == name)).one()
        return fund

    def _next_version_no(self, fund_id: int) -> int:
        highest = self._session.scalar(
            select(func.max(ProjectionVersion.version_no)).where(ProjectionVersion.fund_id == fund_id)
        )
        return (highest or 0) + 1

    def _point_at(self, fund_id: int, version_id: int) -> None:
        """Publish a version. One row, written last, so serving never sees a
        partially built projection."""
        pointer = self._session.get(FundCurrentVersion, fund_id)
        if pointer is None:
            self._session.add(FundCurrentVersion(fund_id=fund_id, version_id=version_id))
        else:
            pointer.version_id = version_id
        self._session.flush()

    # ------------------------------------------------------------------
    # Read path — always through the current-version pointer
    # ------------------------------------------------------------------

    def fund_ids(self) -> list[int]:
        return list(
            self._session.scalars(
                select(FundCurrentVersion.fund_id).order_by(FundCurrentVersion.fund_id)
            )
        )

    def current_version_id(self, fund_id: int) -> int:
        return self._current(fund_id)[1]

    def current_version_no(self, fund_id: int) -> int:
        row = self._current_version_row(fund_id)
        if row is None:
            raise UnknownFundError(fund_id)
        return row.version_no

    def version_count(self, fund_id: int) -> int:
        return self._session.scalar(
            select(func.count()).select_from(ProjectionVersion).where(ProjectionVersion.fund_id == fund_id)
        )

    def versions(self, fund_id: int) -> list[VersionInfo]:
        """A fund's projection history, oldest first. Superseded versions are
        retained, so this is the audit trail of every revision that landed."""
        _, current_id = self._current(fund_id)
        rows = self._session.scalars(
            select(ProjectionVersion)
            .where(ProjectionVersion.fund_id == fund_id)
            .order_by(ProjectionVersion.version_no)
        )
        return [
            VersionInfo(
                version_no=row.version_no,
                batch_id=row.batch_id,
                created_at=row.created_at,
                cashflow_count=row.cashflow_count,
                content_hash=row.content_hash,
                is_current=row.id == current_id,
            )
            for row in rows
        ]

    def outcomes_of(self, batch: IngestionBatch) -> tuple[FundVersionOutcome, ...]:
        """The versions a stored batch minted, for a re-served report. Unchanged
        outcomes are not stored — a batch's persistent effect is exactly its
        minted versions — so they do not reappear on replay."""
        rows = self._session.execute(
            select(Fund, ProjectionVersion.version_no)
            .join(ProjectionVersion, ProjectionVersion.fund_id == Fund.id)
            .where(ProjectionVersion.batch_id == batch.id)
            .order_by(Fund.name)
        ).all()
        return tuple(
            FundVersionOutcome(
                fund_id=fund.id,
                fund_name=fund.name,
                action=VersionAction.NEW if version_no == 1 else VersionAction.REVISED,
                version_no=version_no,
            )
            for fund, version_no in rows
        )

    def cashflows(self, fund_id: int, version_no: int | None = None) -> list[Cashflow]:
        fund, version_id = self._resolve(fund_id, version_no)
        rows = self._session.scalars(
            select(CashflowRow)
            .where(CashflowRow.version_id == version_id)
            .order_by(CashflowRow.source_row_id)
        )
        return [
            Cashflow(
                id=row.source_row_id,
                fund_name=fund.name,
                cashflow_date=row.cashflow_date,
                cashflow_type=row.cashflow_type,
                currency=row.currency,
                amount_local=row.amount_local,
                amount_base=row.amount_base,
                base_currency=row.base_currency,
            )
            for row in rows
        ]

    def analytics(self, fund_id: int, version_no: int | None = None) -> FundAnalytics:
        """Read the stored analytics. Never recomputes — they were written at ingest.

        version_no picks a historical version; None serves the published pointer.
        """
        fund, version_id = self._resolve(fund_id, version_no)

        schedules = self._session.scalars(
            select(NavScheduleRow)
            .where(NavScheduleRow.version_id == version_id)
            .options(selectinload(NavScheduleRow.points))
            .order_by(NavScheduleRow.currency)
        ).all()
        fund_schedules = [row for row in schedules if row.scope == SCOPE_FUND]
        if not fund_schedules:
            raise UnknownFundError(f"projection {version_id} has no fund-level NAV schedule")

        positions = {
            row.currency: self._nav_schedule(fund.name, row)
            for row in schedules
            if row.scope == SCOPE_POSITION
        }

        # Ordered to match compute_fund_analytics, which iterates the currencies
        # in sorted order and each schedule's points in date order.
        trades = self._session.scalars(
            select(FxForwardTradeRow)
            .where(FxForwardTradeRow.version_id == version_id)
            .order_by(FxForwardTradeRow.sell_currency, FxForwardTradeRow.trade_date)
        )

        return FundAnalytics(
            fund_id=fund.id,
            fund_name=fund.name,
            base_currency=fund.base_currency,
            fund_irr=fund_schedules[0].irr,
            currency_irr={currency: schedule.irr for currency, schedule in positions.items()},
            nav_schedules=positions,
            fund_nav_schedule=self._nav_schedule(fund.name, fund_schedules[0]),
            hedges=tuple(
                FxForwardTrade(
                    fund_name=fund.name,
                    trade_date=row.trade_date,
                    value_date=row.value_date,
                    sell_currency=row.sell_currency,
                    buy_currency=row.buy_currency,
                    notional_sell=row.notional_sell,
                    coverage_ratio=row.coverage_ratio,
                )
                for row in trades
            ),
        )

    @staticmethod
    def _nav_schedule(fund_name: str, row: NavScheduleRow) -> NavSchedule:
        return NavSchedule(
            fund_name=fund_name,
            currency=row.currency,
            irr=row.irr,
            points=tuple(
                NavPoint(date=point.point_date, nav=point.nav, open_exposure=point.open_exposure)
                for point in row.points
            ),
        )

    def fund_summaries(self) -> list[FundSummary]:
        """The /funds listing in two queries, whatever the number of funds.

        cashflow_count comes off the projection row and the currency list off the
        position schedules, so no fund's cashflows or analytics are rebuilt here.

        source_file is the batch that minted the current version, not the last
        batch to mention the fund: "which file produced these numbers?" is a
        question about the version being served, and an upload that left the
        fund unchanged produced nothing.
        """
        rows = self._session.execute(
            select(
                Fund.id,
                Fund.name,
                Fund.base_currency,
                ProjectionVersion.id,
                ProjectionVersion.cashflow_count,
                ProjectionVersion.version_no,
                IngestionBatch.source_filename,
            )
            .join(FundCurrentVersion, FundCurrentVersion.fund_id == Fund.id)
            .join(ProjectionVersion, ProjectionVersion.id == FundCurrentVersion.version_id)
            .join(IngestionBatch, IngestionBatch.id == ProjectionVersion.batch_id)
            .order_by(Fund.id)
        ).all()
        if not rows:
            return []

        currencies: dict[int, list[str]] = defaultdict(list)
        for version_id, currency in self._session.execute(
            select(NavScheduleRow.version_id, NavScheduleRow.currency)
            .where(
                NavScheduleRow.scope == SCOPE_POSITION,
                NavScheduleRow.version_id.in_([row[3] for row in rows]),
            )
            .order_by(NavScheduleRow.currency)
        ):
            currencies[version_id].append(currency)

        return [
            FundSummary(
                fund_id=fund_id,
                name=name,
                base_currency=base_currency,
                currencies=currencies[version_id],
                cashflow_count=cashflow_count,
                version_no=version_no,
                source_file=source_filename,
            )
            for (
                fund_id,
                name,
                base_currency,
                version_id,
                cashflow_count,
                version_no,
                source_filename,
            ) in rows
        ]

    # ------------------------------------------------------------------
    # Ingestion reports, kept for supplier reconciliation
    # ------------------------------------------------------------------

    def batch(self, batch_id: int) -> IngestionBatch:
        batch = self._session.get(IngestionBatch, batch_id)
        if batch is None:
            raise KeyError(f"unknown ingestion batch: {batch_id}")
        return batch

    @staticmethod
    def corrections_of(batch: IngestionBatch) -> tuple[RowCorrection, ...]:
        return tuple(
            RowCorrection(line=line, row_id=row_id, corrections=messages)
            for (line, row_id), messages in _regroup(batch.corrections).items()
        )

    # ------------------------------------------------------------------

    def _current(self, fund_id: int) -> tuple[Fund, int]:
        row = self._session.execute(
            select(Fund, FundCurrentVersion.version_id)
            .join(FundCurrentVersion, FundCurrentVersion.fund_id == Fund.id)
            .where(Fund.id == fund_id)
        ).one_or_none()
        if row is None:
            raise UnknownFundError(fund_id)
        return row[0], row[1]

    def _resolve(self, fund_id: int, version_no: int | None) -> tuple[Fund, int]:
        """The fund and the version id a read should serve: the published pointer
        by default, or any retained version by number — history stays queryable."""
        if version_no is None:
            return self._current(fund_id)
        row = self._session.execute(
            select(Fund, ProjectionVersion.id)
            .join(ProjectionVersion, ProjectionVersion.fund_id == Fund.id)
            .where(Fund.id == fund_id, ProjectionVersion.version_no == version_no)
        ).one_or_none()
        if row is None:
            if self._session.get(Fund, fund_id) is None:
                raise UnknownFundError(fund_id)
            raise KeyError(f"fund {fund_id} has no version {version_no}")
        return row[0], row[1]


def _regroup(rows) -> dict[tuple[int, str], tuple[str, ...]]:
    """One row per message at rest, one entry per source line in the report."""
    grouped: dict[tuple[int, str], list[str]] = defaultdict(list)
    for row in sorted(rows, key=lambda r: (r.line, r.seq)):
        grouped[(row.line, row.row_id)].append(row.message)
    return {key: tuple(messages) for key, messages in grouped.items()}
