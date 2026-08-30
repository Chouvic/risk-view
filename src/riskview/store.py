"""In-memory store of validated cashflows and their derived analytics.

The problem here is ingestion, validation, and computation — not persistence —
so batches live in memory. Saving a batch replaces the projections of each fund
in that batch and leaves other funds untouched; fund ids are assigned on first
sight and stay stable. Analytics are deterministic functions of the stored
cashflows, computed on demand and cached per batch. The production step —
PostgreSQL behind this same interface, with Alembic migrations — is described
in docs/design.md.
"""

from riskview.analytics import compute_fund_analytics
from riskview.schemas import Cashflow, FundAnalytics, IngestionResult


class CashflowStore:
    def __init__(self) -> None:
        self._fund_ids: dict[str, int] = {}
        self._cashflows: dict[int, list[Cashflow]] = {}
        self._analytics_cache: dict[int, FundAnalytics] = {}

    def save_batch(self, result: IngestionResult) -> None:
        """Replace each included fund's projection set; funds not in the batch are untouched."""
        by_fund: dict[str, list[Cashflow]] = {}
        for cf in result.cashflows:
            by_fund.setdefault(cf.fund_name, []).append(cf)
        for name in sorted(by_fund):
            fund_id = self._fund_ids.setdefault(name, len(self._fund_ids) + 1)
            self._cashflows[fund_id] = sorted(by_fund[name], key=lambda cf: cf.id)
            self._analytics_cache.pop(fund_id, None)

    def fund_ids(self) -> list[int]:
        return sorted(self._cashflows)

    def cashflows(self, fund_id: int) -> list[Cashflow]:
        self._require(fund_id)
        return list(self._cashflows[fund_id])

    def analytics(self, fund_id: int) -> FundAnalytics:
        cached = self._analytics_cache.get(fund_id)
        if cached is None:
            cached = compute_fund_analytics(fund_id, self.cashflows(fund_id))
            self._analytics_cache[fund_id] = cached
        return cached

    def _require(self, fund_id: int) -> None:
        if fund_id not in self._cashflows:
            raise KeyError(fund_id)
