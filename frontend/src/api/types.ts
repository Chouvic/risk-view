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
  /** File the fund's current projections were ingested from; null if the API was seeded another way. */
  source_file: string | null;
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

export interface IngestionReport {
  summary: { accepted: number; corrected: number };
  corrections: RowCorrection[];
}

/** Everything the dashboard needs for one fund, fetched together. */
export interface FundAnalytics {
  summary: FundSummary;
  irr: FundIrr;
  nav: NavBundle;
  hedges: FxForwardTrade[];
}
