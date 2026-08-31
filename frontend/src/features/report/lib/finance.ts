/**
 * The analytics of `src/riskview/analytics/`, re-implemented for the browser.
 *
 * The report's panels solve and discount live rather than replaying a recording, so
 * a reader can move a rate or a date and watch the number answer. That only earns
 * trust if it agrees with Python, so `selfCheck()` re-derives every IRR and every NAV
 * point from the raw cashflows and compares them against the generated output.
 */

export const DAYS_PER_YEAR = 365;

export interface Flow {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  amount: number;
}

const MS_PER_DAY = 86_400_000;

/** ISO day to a UTC timestamp, so day counts never cross a daylight-saving boundary. */
function toTime(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

export function yearsBetween(from: string, to: string): number {
  return (toTime(to) - toTime(from)) / MS_PER_DAY / DAYS_PER_YEAR;
}

/** NPV of dated flows discounted at `rate`, as of the earliest flow date. */
export function xnpv(rate: number, flows: Flow[]): number {
  if (flows.length === 0) return 0;
  const t0 = flows.reduce((earliest, f) => (f.date < earliest ? f.date : earliest), flows[0].date);
  return flows.reduce((sum, f) => sum + f.amount / (1 + rate) ** yearsBetween(t0, f.date), 0);
}

export interface IrrStep {
  low: number;
  high: number;
  mid: number;
  npv: number;
}

/** Bisection, matching `irr.py`: slow, but it cannot be thrown off by a starting point. */
export function xirr(flows: Flow[], maxIterations = 200): { rate: number; steps: IrrStep[] } {
  const LOW = -0.999;
  const HIGH = 100;
  const TOLERANCE = 1e-12;

  let low = LOW;
  let high = HIGH;
  let npvLow = xnpv(low, flows);
  const steps: IrrStep[] = [];

  for (let i = 0; i < maxIterations; i += 1) {
    const mid = (low + high) / 2;
    const npv = xnpv(mid, flows);
    steps.push({ low, high, mid, npv });
    if (Math.abs(npv) < TOLERANCE || (high - low) / 2 < TOLERANCE) return { rate: mid, steps };
    if (npvLow * npv < 0) {
      high = mid;
    } else {
      low = mid;
      npvLow = npv;
    }
  }
  return { rate: (low + high) / 2, steps };
}

/**
 * PV at `t` of the flows dated on or after it (`includeOnDate`), or strictly after it.
 * The first is NAV; the second is the open exposure a forward has to cover.
 */
export function pvAt(t: string, rate: number, flows: Flow[], includeOnDate: boolean): number {
  return flows.reduce((sum, f) => {
    if (f.date < t || (f.date === t && !includeOnDate)) return sum;
    return sum + f.amount / (1 + rate) ** yearsBetween(t, f.date);
  }, 0);
}

/** Whole-month shift, month-end to month-end: 30 Sep + 3m settles 31 Dec. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const monthIndex = m - 1 + months;
  const year = y + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const wasMonthEnd = d === new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = wasMonthEnd ? lastDay : Math.min(d, lastDay);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Cents, so a live figure and a stored one are comparable. */
export function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}
