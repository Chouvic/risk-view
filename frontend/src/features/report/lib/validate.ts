/**
 * The validators of `src/riskview/schemas.py`, mirrored so the report can run them
 * on a row the reader types. Same order, same rules, same messages: scrub, then
 * coerce against a closed set, then check the invariants that span fields.
 *
 * This is a mirror, not the source of truth. It exists so the ingestion policy can be
 * demonstrated rather than described; Python remains the thing that runs in production.
 */

export const CURRENCIES = ["EUR", "GBP", "USD"] as const;
export const CASHFLOW_TYPES = ["Investment", "Interest", "Principal Repayment"] as const;

/** Known source-system typos only. An unmapped bad code is rejected, never guessed. */
export const CURRENCY_ALIASES: Record<string, string> = { GPB: "GBP", EURO: "EUR", UDS: "USD" };

const JUNK = new Set(["`", "'", '"', " "]);

export interface RawRow {
  id: string;
  fund_name: string;
  cashflow_date: string;
  cashflow_type: string;
  currency: string;
  amount_local: string;
  amount_base: string;
  base_currency: string;
}

export interface Verdict {
  cleaned: Partial<Record<keyof RawRow, string>>;
  corrections: string[];
  errors: string[];
  accepted: boolean;
}

function stripJunk(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && JUNK.has(value[start])) start += 1;
  while (end > start && JUNK.has(value[end - 1])) end -= 1;
  return value.slice(start, end);
}

function scrub(field: string, value: string, corrections: string[]): string {
  const cleaned = stripJunk(value.trim()).trim().replace(/\s+/g, " ");
  if (cleaned !== value) corrections.push(`${field}: scrubbed ${quote(value)} -> ${quote(cleaned)}`);
  return cleaned;
}

function quote(value: string): string {
  return `'${value}'`;
}

function cleanCurrency(field: string, value: string, corrections: string[]): string {
  let code = scrub(field, value, corrections);
  if (code !== code.toUpperCase()) {
    corrections.push(`${field}: uppercased ${quote(code)}`);
    code = code.toUpperCase();
  }
  if (code in CURRENCY_ALIASES) {
    corrections.push(`${field}: corrected typo ${quote(code)} -> ${quote(CURRENCY_ALIASES[code])}`);
    code = CURRENCY_ALIASES[code];
  }
  return code;
}

/**
 * A whitelist, because 03/04/2026 is a different day under day-first and month-first
 * conventions. The convention comes from the source contract, never from a guess.
 */
function cleanDate(value: string, corrections: string[], errors: string[]): string | null {
  const text = scrub("cashflow_date", value, corrections);
  const day = text.split(/[ T]/)[0];

  const dayFirst = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(day);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(day);
  const parts = dayFirst
    ? { y: +dayFirst[3], m: +dayFirst[2], d: +dayFirst[1] }
    : iso
      ? { y: +iso[1], m: +iso[2], d: +iso[3] }
      : null;

  if (parts && parts.m >= 1 && parts.m <= 12) {
    const lastDay = new Date(Date.UTC(parts.y, parts.m, 0)).getUTCDate();
    if (parts.d >= 1 && parts.d <= lastDay) {
      return `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`;
    }
  }

  errors.push(
    `cashflow_date: Value error, unrecognised date format, expected day-first DD/MM/YYYY or ISO YYYY-MM-DD (got ${quote(value)})`,
  );
  return null;
}

function cleanAmount(
  field: string,
  value: string,
  corrections: string[],
  errors: string[],
): number | null {
  let text = scrub(field, value, corrections).replace(/ /g, "");
  if (text.startsWith("(") && text.endsWith(")")) {
    corrections.push(`${field}: read parenthesised ${quote(value)} as negative`);
    text = `-${text.slice(1, -1)}`;
  }
  const stripped = text.replace(/[,€£$]/g, "");
  if (stripped !== text) corrections.push(`${field}: normalised ${quote(value)} -> ${quote(stripped)}`);

  if (stripped === "" || !/^-?\d*\.?\d+$/.test(stripped)) {
    errors.push(`${field}: Input should be a valid decimal (got ${quote(value)})`);
    return null;
  }
  return Number(stripped);
}

/** Runs the row through the model exactly as ingestion does. */
export function validateRow(row: RawRow): Verdict {
  const corrections: string[] = [];
  const errors: string[] = [];
  const cleaned: Partial<Record<keyof RawRow, string>> = {};

  cleaned.id = row.id.trim();
  if (!/^-?\d+$/.test(cleaned.id)) errors.push(`id: Input should be a valid integer (got ${quote(row.id)})`);

  cleaned.fund_name = scrub("fund_name", row.fund_name, corrections);
  if (cleaned.fund_name.length === 0) errors.push("fund_name: String should have at least 1 character");

  const type = scrub("cashflow_type", row.cashflow_type, corrections);
  cleaned.cashflow_type = type;
  const typeValid = (CASHFLOW_TYPES as readonly string[]).includes(type);
  if (!typeValid) {
    errors.push(
      `cashflow_type: Input should be ${CASHFLOW_TYPES.map(quote).join(", ")} (got ${quote(row.cashflow_type)})`,
    );
  }

  const currency = cleanCurrency("currency", row.currency, corrections);
  cleaned.currency = currency;
  const currencyValid = (CURRENCIES as readonly string[]).includes(currency);
  if (!currencyValid) {
    errors.push(`currency: Input should be ${CURRENCIES.map(quote).join(", ")} (got ${quote(row.currency)})`);
  }

  const baseCurrency = cleanCurrency("base_currency", row.base_currency, corrections);
  cleaned.base_currency = baseCurrency;
  const baseValid = (CURRENCIES as readonly string[]).includes(baseCurrency);
  if (!baseValid) {
    errors.push(
      `base_currency: Input should be ${CURRENCIES.map(quote).join(", ")} (got ${quote(row.base_currency)})`,
    );
  }

  const date = cleanDate(row.cashflow_date, corrections, errors);
  if (date) cleaned.cashflow_date = date;

  const local = cleanAmount("amount_local", row.amount_local, corrections, errors);
  const base = cleanAmount("amount_base", row.amount_base, corrections, errors);
  if (local !== null) cleaned.amount_local = String(local);
  if (base !== null) cleaned.amount_base = String(base);

  // Field validation must pass before the cross-field invariants can be checked;
  // Pydantic stops at the same point, so the reasons reported here match.
  if (errors.length === 0 && local !== null && base !== null) {
    if (type === "Investment") {
      if (local >= 0) errors.push("Value error, Investment cashflow must be negative (an outflow)");
    } else if (local <= 0) {
      errors.push(`Value error, ${type} cashflow must be positive (an inflow)`);
    }
    if (local < 0 !== base < 0) {
      errors.push("Value error, local and base amounts must have the same sign");
    }
    if (currency === baseCurrency && local !== base) {
      errors.push("Value error, base-currency cashflow must have amount_local == amount_base");
    }
  }

  return { cleaned, corrections, errors, accepted: errors.length === 0 };
}
