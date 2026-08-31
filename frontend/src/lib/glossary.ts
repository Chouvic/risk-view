/**
 * Every analytic the app names. Definitions state the convention actually
 * implemented, which is what an analyst checking a number needs.
 */

export interface GlossaryEntry {
  /** The visible label. */
  term: string;
  /** One sentence. */
  definition: string;
  /** Optional second line: the convention, method or policy behind the number. */
  method?: string;
}

export const GLOSSARY = {
  fundIrr: {
    term: "Fund IRR",
    definition: "Annualised return across the fund's cashflows, in its base currency.",
    method: "XIRR on the supplied base amounts: dated flows, actual/365, solved by bisection.",
  },
  currencyIrr: {
    term: "IRR by currency",
    definition: "Annualised return of one position, from local-currency amounts only.",
    method: "XIRR on that currency's local flows: dated flows, actual/365.",
  },
  nav: {
    term: "NAV",
    definition:
      "Present value at a date of every cashflow dated on or after it, discounted at the position's IRR.",
    method: "Zero at inception by construction.",
  },
  openExposure: {
    term: "Open exposure",
    definition:
      "Present value of the cashflows dated after a date: the amount still to be received, and still at risk to FX.",
    method: "Forwards are sized against this.",
  },
  baseCurrency: {
    term: "Base currency",
    definition: "The fund's reporting currency.",
    method: "Fund-level analytics use the client-supplied base amounts.",
  },
  positionCurrency: {
    term: "Position currency",
    definition: "A currency the fund holds cashflows in.",
    method: "Each carries its own IRR, NAV schedule and hedge programme.",
  },
  terminalValue: {
    term: "Terminal value",
    definition: "NAV on the final cashflow date, equal to that cashflow.",
    method: "One of two checks on the schedule; the other is NAV = 0 at inception.",
  },
  horizon: {
    term: "Horizon",
    definition: "First to last cashflow date across the fund's schedule.",
  },
  tradeDate: {
    term: "Trade date",
    definition: "Date the forward is struck — one per cashflow date while exposure remains.",
  },
  valueDate: {
    term: "Value date",
    definition: "Settlement date: three months after the trade date.",
    method: "Rolled month-end to month-end, so 30 Sep + 3m settles 31 Dec.",
  },
  notional: {
    term: "Notional",
    definition:
      "Exposure currency sold forward: the coverage ratio times the open exposure on the trade date.",
  },
  coverageRatio: {
    term: "Coverage ratio",
    definition: "Share of open exposure hedged. The policy here is 100%.",
  },
  hedgeProgramme: {
    term: "Hedge programme",
    definition:
      "Rolling three-month forwards selling a non-base currency's open exposure against the base currency.",
    method: "The base currency is not hedged, and no trade is struck once exposure reaches zero.",
  },
  acceptedRows: {
    term: "Accepted",
    definition: "Rows that passed validation and were stored, corrected or not.",
  },
  correctedRows: {
    term: "Corrected",
    definition:
      "Accepted rows where an unambiguous defect was repaired — a known currency typo, a stray character, a recognised date format.",
    method: "Anything ambiguous fails validation, and a batch with any failure is refused whole.",
  },
  rejectedRows: {
    term: "Rejected",
    definition:
      "Rows that failed validation. A batch with any rejection is refused whole, so a stored batch shows zero.",
    method: "The supplier receives every failure in one pass.",
  },
  cashflows: {
    term: "Cashflows",
    definition: "Validated projected cashflow rows currently held for this fund.",
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;
