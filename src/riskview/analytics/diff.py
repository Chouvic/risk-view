"""What changed between two projection versions of one fund.

Pure, like the rest of the package: two versions' cashflows and analytics in, a
VersionDiff out. Rows are matched on the natural key (currency, date, type) —
the same key the store enforces unique — so a renumbered re-export diffs as
unchanged while a moved date reads as remove-plus-add, which is what actually
happened to the projection. The analytics half answers the question a reviewer
asks next: what did the change do to IRR and the hedge programme?
"""

from riskview.schemas import (
    Cashflow,
    CashflowAmountChange,
    CashflowSnapshot,
    FundAnalytics,
    FxForwardTrade,
    HedgeChange,
    IrrChange,
    VersionDiff,
)

__all__ = ["diff_versions"]

_Key = tuple[str, object, str]


def diff_versions(
    old_cashflows: list[Cashflow],
    new_cashflows: list[Cashflow],
    old_analytics: FundAnalytics,
    new_analytics: FundAnalytics,
    from_version: int,
    to_version: int,
) -> VersionDiff:
    old_rows = _by_natural_key(old_cashflows)
    new_rows = _by_natural_key(new_cashflows)

    added = tuple(_snapshot(new_rows[key]) for key in sorted(new_rows.keys() - old_rows.keys()))
    removed = tuple(_snapshot(old_rows[key]) for key in sorted(old_rows.keys() - new_rows.keys()))
    changed = tuple(
        CashflowAmountChange(
            currency=key[0],
            cashflow_date=old_rows[key].cashflow_date,
            cashflow_type=key[2],
            old_amount_local=old_rows[key].amount_local,
            new_amount_local=new_rows[key].amount_local,
            old_amount_base=old_rows[key].amount_base,
            new_amount_base=new_rows[key].amount_base,
        )
        for key in sorted(old_rows.keys() & new_rows.keys())
        if (old_rows[key].amount_local, old_rows[key].amount_base)
        != (new_rows[key].amount_local, new_rows[key].amount_base)
    )

    currencies = old_analytics.currency_irr.keys() | new_analytics.currency_irr.keys()
    currency_irr = {
        currency: IrrChange(
            old=old_analytics.currency_irr.get(currency), new=new_analytics.currency_irr.get(currency)
        )
        for currency in sorted(currencies)
        if old_analytics.currency_irr.get(currency) != new_analytics.currency_irr.get(currency)
    }

    return VersionDiff(
        fund_id=new_analytics.fund_id,
        fund_name=new_analytics.fund_name,
        from_version=from_version,
        to_version=to_version,
        added=added,
        removed=removed,
        changed=changed,
        fund_irr=IrrChange(old=old_analytics.fund_irr, new=new_analytics.fund_irr),
        currency_irr=currency_irr,
        hedge_changes=_hedge_changes(old_analytics.hedges, new_analytics.hedges),
    )


def _by_natural_key(cashflows: list[Cashflow]) -> dict[_Key, Cashflow]:
    return {(cf.currency.value, cf.cashflow_date, cf.cashflow_type.value): cf for cf in cashflows}


def _snapshot(cf: Cashflow) -> CashflowSnapshot:
    return CashflowSnapshot(
        currency=cf.currency.value,
        cashflow_date=cf.cashflow_date,
        cashflow_type=cf.cashflow_type.value,
        amount_local=cf.amount_local,
        amount_base=cf.amount_base,
    )


def _hedge_changes(
    old_hedges: tuple[FxForwardTrade, ...], new_hedges: tuple[FxForwardTrade, ...]
) -> tuple[HedgeChange, ...]:
    """Rolls whose notional differs, keyed by (sell currency, trade date). The
    value date is derived from the trade date, so whichever side has the trade
    supplies it and both sides agree when both have one."""
    old_rolls = {(t.sell_currency.value, t.trade_date): t for t in old_hedges}
    new_rolls = {(t.sell_currency.value, t.trade_date): t for t in new_hedges}
    changes = []
    for key in sorted(old_rolls.keys() | new_rolls.keys()):
        old, new = old_rolls.get(key), new_rolls.get(key)
        if old is not None and new is not None and old.notional_sell == new.notional_sell:
            continue
        trade = new if new is not None else old
        changes.append(
            HedgeChange(
                sell_currency=key[0],
                trade_date=key[1],
                value_date=trade.value_date,
                old_notional=None if old is None else old.notional_sell,
                new_notional=None if new is None else new.notional_sell,
            )
        )
    return tuple(changes)
