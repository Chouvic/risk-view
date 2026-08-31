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
from dataclasses import dataclass

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
    FxForwardTrade,
    IngestionResult,
    NavPoint,
    NavSchedule,
    RowCorrection,
)

__all__ = ["BatchSource", "CashflowRepository", "IngestionBatch", "UnknownFundError"]


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

    def save_batch(self, result: IngestionResult, source: BatchSource) -> IngestionBatch:
        """Persist one uploaded file as a new projection version per fund.

        Does not commit — the caller owns the transaction, so a failure anywhere
        below leaves no batch row, no partial version, and every pointer still on
        the last good version.
        """
        batch = self._record_batch(result, source)

        by_fund: dict[str, list[Cashflow]] = defaultdict(list)
        for cashflow in result.cashflows:
            by_fund[cashflow.fund_name].append(cashflow)

        # Sorted by name, not file order: fund ids are assigned on first sight and
        # must not depend on which row happened to come first in the upload.
        for name in sorted(by_fund):
            cashflows = sorted(by_fund[name], key=lambda cf: cf.id)
            self._publish_version(batch, name, cashflows)

        return batch

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

    def _publish_version(self, batch: IngestionBatch, name: str, cashflows: list[Cashflow]) -> None:
        fund = self._get_or_create_fund(name, cashflows[0].base_currency.value)

        version = ProjectionVersion(
            fund_id=fund.id,
            batch_id=batch.id,
            version_no=self._next_version_no(fund.id),
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

    def version_count(self, fund_id: int) -> int:
        return self._session.scalar(
            select(func.count()).select_from(ProjectionVersion).where(ProjectionVersion.fund_id == fund_id)
        )

    def cashflows(self, fund_id: int) -> list[Cashflow]:
        fund, version_id = self._current(fund_id)
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

    def analytics(self, fund_id: int) -> FundAnalytics:
        """Read the stored analytics. Never recomputes — they were written at ingest."""
        fund, version_id = self._current(fund_id)

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
        """
        rows = self._session.execute(
            select(Fund.id, Fund.name, Fund.base_currency, ProjectionVersion.id, ProjectionVersion.cashflow_count)
            .join(FundCurrentVersion, FundCurrentVersion.fund_id == Fund.id)
            .join(ProjectionVersion, ProjectionVersion.id == FundCurrentVersion.version_id)
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
            )
            for fund_id, name, base_currency, version_id, cashflow_count in rows
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


def _regroup(rows) -> dict[tuple[int, str], tuple[str, ...]]:
    """One row per message at rest, one entry per source line in the report."""
    grouped: dict[tuple[int, str], list[str]] = defaultdict(list)
    for row in sorted(rows, key=lambda r: (r.line, r.seq)):
        grouped[(row.line, row.row_id)].append(row.message)
    return {key: tuple(messages) for key, messages in grouped.items()}
