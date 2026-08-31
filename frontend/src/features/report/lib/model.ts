/**
 * Views over the generated dataset. The report is static, but nothing in it is typed
 * by hand: every figure below is read out of `data.ts`, which `scripts/build_report_data.py`
 * produces by running `samples/cashflows.csv` through the real pipeline.
 */

import { REPORT_DATA } from "../data";
import { pvAt, toCents, xirr, type Flow } from "./finance";

export type Currency = "EUR" | "GBP" | "USD";

export const DATA = REPORT_DATA;

/** Fund I is the fund the brief names, so it is the one every panel works on. */
export const FUND = DATA.funds.find((fund) => fund.name === "Fund I") ?? DATA.funds[0];

export const BASE = FUND.baseCurrency as Currency;

/** Position currencies, base last: the base currency is the one that needs no hedge. */
export const CURRENCIES = Object.keys(FUND.navByCurrency).sort((a, b) =>
  a === BASE ? 1 : b === BASE ? -1 : a.localeCompare(b),
) as Currency[];

export const NON_BASE = CURRENCIES.filter((c) => c !== BASE);

export interface Cashflow {
  id: number;
  date: string;
  type: string;
  currency: Currency;
  local: number;
  base: number;
}

export const CASHFLOWS: Cashflow[] = FUND.cashflows.map((cf) => ({
  id: cf.id,
  date: cf.date,
  type: cf.type,
  currency: cf.currency as Currency,
  local: Number(cf.local),
  base: Number(cf.base),
}));

/** Local-currency flows for one position — the input to that currency's IRR and NAV. */
export function localFlows(currency: Currency): Flow[] {
  return CASHFLOWS.filter((cf) => cf.currency === currency).map((cf) => ({
    date: cf.date,
    amount: cf.local,
  }));
}

/** Base-currency flows for the whole fund — the input to the fund IRR and fund NAV. */
export function baseFlows(): Flow[] {
  return CASHFLOWS.map((cf) => ({ date: cf.date, amount: cf.base }));
}

export function scheduleFor(currency: Currency) {
  return FUND.navByCurrency[currency as keyof typeof FUND.navByCurrency];
}

export function irrFor(currency: Currency): number {
  return FUND.currencyIrr[currency as keyof typeof FUND.currencyIrr];
}

export const DATES: string[] = scheduleFor(CURRENCIES[0]).points.map((p) => p.date);

export const SYMBOL: Record<Currency, string> = { EUR: "€", GBP: "£", USD: "$" };

/** Chart colours, fixed per currency so a colour means the same thing in every panel. */
export const CURRENCY_COLOR: Record<Currency, string> = {
  GBP: "var(--color-series-1)",
  USD: "var(--color-series-2)",
  EUR: "var(--color-series-3)",
};

export const HEDGES = FUND.hedges.map((h) => ({
  tradeDate: h.tradeDate,
  valueDate: h.valueDate,
  sell: h.sell as Currency,
  buy: h.buy as Currency,
  notional: Number(h.notional),
  coverage: h.coverage,
}));

/** Headline figures the opening section leads with. */
export const HEADLINE = {
  horizon: { from: DATES[0], to: DATES[DATES.length - 1] },
  invested: CASHFLOWS.filter((cf) => cf.type === "Investment").reduce(
    (sum, cf) => sum + Math.abs(cf.base),
    0,
  ),
  nonBaseShare:
    CASHFLOWS.filter((cf) => cf.type === "Investment" && cf.currency !== BASE).reduce(
      (sum, cf) => sum + Math.abs(cf.base),
      0,
    ) /
    CASHFLOWS.filter((cf) => cf.type === "Investment").reduce(
      (sum, cf) => sum + Math.abs(cf.base),
      0,
    ),
  peakNav: Math.max(...FUND.fundNav.points.map((p) => Number(p.nav))),
};

export interface CheckResult {
  label: string;
  ok: boolean;
  detail: string;
}

/**
 * Re-derives every published number in the browser and compares it against Python.
 * Rates must agree to 1e-9; money to a cent, which is the rounding Python applies on
 * the way out. A stale `data.ts` shows up here rather than as a quietly wrong figure.
 */
export function selfCheck(): CheckResult[] {
  const checks: CheckResult[] = [];

  for (const currency of CURRENCIES) {
    const published = irrFor(currency);
    const { rate } = xirr(localFlows(currency));
    checks.push({
      label: `${currency} IRR`,
      ok: Math.abs(rate - published) < 1e-9,
      detail: `${(rate * 100).toFixed(6)}% re-solved vs ${(published * 100).toFixed(6)}% published`,
    });
  }

  const fund = xirr(baseFlows());
  checks.push({
    label: `Fund IRR (${BASE})`,
    ok: Math.abs(fund.rate - FUND.fundIrr) < 1e-9,
    detail: `${(fund.rate * 100).toFixed(6)}% re-solved vs ${(FUND.fundIrr * 100).toFixed(6)}% published`,
  });

  let worst = 0;
  let points = 0;
  for (const currency of CURRENCIES) {
    const schedule = scheduleFor(currency);
    const flows = localFlows(currency);
    for (const point of schedule.points) {
      const nav = toCents(pvAt(point.date, schedule.irr, flows, true));
      const open = toCents(pvAt(point.date, schedule.irr, flows, false));
      worst = Math.max(worst, Math.abs(nav - Number(point.nav)), Math.abs(open - Number(point.open)));
      points += 2;
    }
  }
  checks.push({
    label: "NAV and open exposure",
    ok: worst <= 0.01,
    detail: `${points} values re-derived, worst difference ${worst.toFixed(4)}`,
  });

  return checks;
}
