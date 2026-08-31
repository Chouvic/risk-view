/**
 * TypeScript mirrors of `src/riskview/schemas.py`. Money is `Decimal` server-side
 * so it arrives as a string; dates arrive as ISO `YYYY-MM-DD`.
 */

export type CurrencyCode = "EUR" | "GBP" | "USD";

/** ISO `YYYY-MM-DD`. */
export type IsoDate = string;

/** A `Decimal` serialised by the API, e.g. `"434786552.00"`. */
export type MoneyString = string;

export interface FundSummary {
  fund_id: number;
  name: string;
  base_currency: CurrencyCode;
  currencies: CurrencyCode[];
  cashflow_count: number;
  /** The projection version reads serve by default. */
  version_no: number;
  /** File the version above was ingested from; null if the API was seeded another way. */
  source_file: string | null;
}

/** One entry of a fund's projection history, newest last. */
export interface VersionInfo {
  version_no: number;
  /** The upload that minted this version. */
  batch_id: number;
  /** ISO timestamp. */
  created_at: string;
  cashflow_count: number;
  /** Canonical hash of the version's cashflows — why it was, or wasn't, minted. */
  content_hash: string;
  is_current: boolean;
}

/** A cashflow on one side of a diff, named by its natural key — row ids play no part. */
export interface CashflowSnapshot {
  currency: CurrencyCode;
  cashflow_date: IsoDate;
  cashflow_type: string;
  amount_local: MoneyString;
  amount_base: MoneyString;
}

/** A cashflow in both versions whose amounts moved. */
export interface CashflowAmountChange {
  currency: CurrencyCode;
  cashflow_date: IsoDate;
  cashflow_type: string;
  old_amount_local: MoneyString;
  new_amount_local: MoneyString;
  old_amount_base: MoneyString;
  new_amount_base: MoneyString;
}

/** `null` on a side means the position did not exist in that version. */
export interface IrrChange {
  old: number | null;
  new: number | null;
}

/** A hedge roll whose recommended notional differs between two versions. */
export interface HedgeChange {
  sell_currency: CurrencyCode;
  trade_date: IsoDate;
  value_date: IsoDate;
  old_notional: MoneyString | null;
  new_notional: MoneyString | null;
}

/** What a revision changed: the rows, and what they did to IRR and the hedges. */
export interface VersionDiff {
  fund_id: number;
  fund_name: string;
  from_version: number;
  to_version: number;
  added: CashflowSnapshot[];
  removed: CashflowSnapshot[];
  changed: CashflowAmountChange[];
  fund_irr: IrrChange;
  /** Only currencies whose IRR moved. */
  currency_irr: Partial<Record<CurrencyCode, IrrChange>>;
  /** Only rolls whose notional differs; empty when the programme is untouched. */
  hedge_changes: HedgeChange[];
}

export interface FundIrr {
  fund_id: number;
  name: string;
  base_currency: CurrencyCode;
  fund_irr: number;
  currency_irr: Record<CurrencyCode, number>;
}

export interface NavPoint {
  date: IsoDate;
  nav: MoneyString;
  open_exposure: MoneyString;
}

export interface NavSchedule {
  fund_name: string;
  currency: CurrencyCode;
  irr: number;
  points: NavPoint[];
}

export interface NavBundle {
  fund: NavSchedule;
  by_currency: Record<CurrencyCode, NavSchedule>;
}

export interface FxForwardTrade {
  fund_name: string;
  trade_date: IsoDate;
  value_date: IsoDate;
  sell_currency: CurrencyCode;
  buy_currency: CurrencyCode;
  notional_sell: MoneyString;
  coverage_ratio: number;
}

export interface RowCorrection {
  line: number;
  row_id: string;
  corrections: string[];
}

export interface RowReject {
  line: number;
  row_id: string;
  errors: string[];
}

/** What one upload did to one fund's projection ledger. */
export type VersionAction = "new" | "revised" | "unchanged";

export interface FundVersionOutcome {
  fund_id: number;
  fund_name: string;
  action: VersionAction;
  /** The version now current for the fund: freshly minted, or pre-existing if unchanged. */
  version_no: number;
}

export interface IngestionReport {
  batch_id: number;
  /** True when these exact bytes had already been ingested: the upload was a no-op. */
  duplicate: boolean;
  summary: { accepted: number; corrected: number };
  corrections: RowCorrection[];
  /**
   * What the upload did per fund. A re-served report lists only the versions the
   * batch minted, so unchanged funds are absent rather than reported.
   */
  funds: FundVersionOutcome[];
}

/** Everything the dashboard needs for one fund at one version, fetched together. */
export interface FundAnalytics {
  summary: FundSummary;
  /** The version these figures were read at — the fund's current one unless pinned. */
  version_no: number;
  irr: FundIrr;
  nav: NavBundle;
  hedges: FxForwardTrade[];
}
