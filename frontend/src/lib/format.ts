/** Display formatting. Every number the user reads is rendered through here. */

import type { CurrencyCode, IsoDate, MoneyString } from "@/api/types";

const SYMBOL: Record<CurrencyCode, string> = { EUR: "€", GBP: "£", USD: "$" };

function currencySymbol(currency: string): string {
  return SYMBOL[currency as CurrencyCode] ?? "";
}

/** Money arrives as an exact decimal string; the lossy conversion happens only here. */
export function toNumber(value: MoneyString | number): number {
  return typeof value === "number" ? value : Number(value);
}

/** Compact money for tiles and axes: `€434.8M`. */
export function formatMoneyCompact(value: MoneyString | number, currency?: string): string {
  const n = toNumber(value);
  const symbol = currency ? currencySymbol(currency) : "";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${symbol}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${symbol}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${symbol}${Math.round(abs / 1e3)}K`;
  return `${sign}${symbol}${abs.toFixed(0)}`;
}

/** Full money for tables and tooltips: `€434,786,552`. */
export function formatMoney(value: MoneyString | number, currency?: string, decimals = 0): string {
  const n = toNumber(value);
  const symbol = currency ? currencySymbol(currency) : "";
  const body = Math.abs(n).toLocaleString("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${n < 0 ? "-" : ""}${symbol}${body}`;
}

/** `0.0995` → `9.95%`. */
export function formatPercent(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/** `0.0012` → `+12 bps`, for a difference between two rates. */
export function formatBps(value: number): string {
  const bps = Math.round(value * 10_000);
  return `${bps > 0 ? "+" : ""}${bps.toLocaleString("en-GB")} bps`;
}

// en-GB's "short" month gives "Sept"; a blotter wants three letters.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2025-09-30` → `30 Sep 2025`. */
export function formatDate(iso: IsoDate): string {
  const [year, month, day] = iso.split("-");
  return `${day} ${MONTHS[Number(month) - 1]} ${year}`;
}

/** Axis ticks: `2025-09-30` → `Sep ’25`. */
export function formatAxisDate(iso: IsoDate): string {
  const [year, month] = iso.split("-");
  return `${MONTHS[Number(month) - 1]} ’${year.slice(2)}`;
}

/** Whole years between two ISO days, one decimal: `5.0y`. */
export function formatTenor(from: IsoDate, to: IsoDate): string {
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  return `${(days / 365).toFixed(1)}y`;
}

export function pluralise(count: number, noun: string, plural = `${noun}s`): string {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? noun : plural}`;
}
