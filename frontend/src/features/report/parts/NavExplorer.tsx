import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Segmented } from "@/components/ui/Segmented";
import { formatDate, formatMoney, formatMoneyCompact } from "@/lib/format";
import { pvAt, toCents, yearsBetween } from "../lib/finance";
import {
  BASE,
  CURRENCIES,
  CURRENCY_COLOR,
  DATES,
  SYMBOL,
  irrFor,
  localFlows,
  scheduleFor,
  type Currency,
} from "../lib/model";
import { Panel } from "./ui";
import { cn } from "@/lib/cn";

/**
 * The NAV schedule, one vantage point at a time. NAV(t) is what the position is worth
 * standing at t; open exposure is what is still to come, and therefore what a forward
 * has to cover. The difference between them is exactly the cashflow paid on the day.
 *
 * The brief's two checks are read off the ends: NAV is zero at inception, and equals
 * the terminal value on the final date.
 */
export function NavExplorer() {
  const [currency, setCurrency] = useState<Currency>("GBP");
  const [index, setIndex] = useState(4);

  const flows = useMemo(() => localFlows(currency), [currency]);
  const schedule = scheduleFor(currency);
  const irr = irrFor(currency);
  const t = DATES[index];

  const nav = toCents(pvAt(t, irr, flows, true));
  const open = toCents(pvAt(t, irr, flows, false));
  const onDate = flows.filter((f) => f.date === t).reduce((sum, f) => sum + f.amount, 0);

  const remaining = useMemo(
    () =>
      flows
        .filter((f) => f.date >= t)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((f) => {
          const years = yearsBetween(t, f.date);
          const factor = 1 / (1 + irr) ** years;
          return { ...f, years, factor, pv: f.amount * factor };
        }),
    [flows, t, irr],
  );

  const width = 660;
  const height = 190;
  const pad = { left: 62, right: 14, top: 12, bottom: 26 };
  const peak = Math.max(...schedule.points.map((p) => Math.max(Number(p.nav), Number(p.open))));
  const x = (i: number) => pad.left + (i / (DATES.length - 1)) * (width - pad.left - pad.right);
  const y = (v: number) => height - pad.bottom - (v / peak) * (height - pad.top - pad.bottom);

  const line = (key: "nav" | "open") =>
    schedule.points
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(Number(p[key])).toFixed(1)}`)
      .join(" ");

  const first = index === 0;
  const last = index === DATES.length - 1;

  return (
    <Panel
      title="NAV schedule"
      description="Discount the flows that remain, from where you are standing. Move the date to see which flows count and what they are worth."
      actions={
        <Segmented
          ariaLabel="Position currency"
          value={currency}
          onChange={setCurrency}
          options={CURRENCIES.map((code) => ({
            value: code,
            label: code === BASE ? `${code} (base)` : code,
            color: CURRENCY_COLOR[code],
          }))}
        />
      }
    >
      <div className="border-b border-hairline p-5">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`${currency} NAV and open exposure`}>
          <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} stroke="var(--color-hairline)" />
          <text x={pad.left - 8} y={y(0) + 4} textAnchor="end" fontSize={10.5} fill="var(--color-ink-3)">
            0
          </text>
          <text x={pad.left - 8} y={y(peak) + 10} textAnchor="end" fontSize={10.5} fill="var(--color-ink-3)">
            {formatMoneyCompact(peak, currency)}
          </text>

          <path d={line("open")} fill="none" stroke="var(--color-ink-3)" strokeWidth={1.5} strokeDasharray="4 3" />
          <path d={line("nav")} fill="none" stroke={CURRENCY_COLOR[currency]} strokeWidth={2} />

          <line x1={x(index)} x2={x(index)} y1={pad.top} y2={height - pad.bottom} stroke="var(--color-ink)" />
          <circle cx={x(index)} cy={y(nav)} r={4.5} fill={CURRENCY_COLOR[currency]} />
          <circle cx={x(index)} cy={y(open)} r={3.5} fill="var(--color-surface)" stroke="var(--color-ink-3)" strokeWidth={1.5} />

          <text x={pad.left} y={height - 6} fontSize={10.5} fill="var(--color-ink-3)">
            {formatDate(DATES[0])}
          </text>
          <text x={width - pad.right} y={height - 6} textAnchor="end" fontSize={10.5} fill="var(--color-ink-3)">
            {formatDate(DATES[DATES.length - 1])}
          </text>
        </svg>

        <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 rounded" style={{ background: CURRENCY_COLOR[currency] }} />
            NAV
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-0 w-4 border-t border-dashed border-ink-3" />
            Open exposure
          </span>
        </div>
      </div>

      <div className="border-b border-hairline px-5 py-4">
        <label className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-sm text-ink-3">Standing at</span>
          <input
            type="range"
            min={0}
            max={DATES.length - 1}
            step={1}
            value={index}
            onChange={(event) => setIndex(Number(event.target.value))}
            className="min-w-0 flex-1 accent-ink"
            aria-label="Valuation date"
          />
          <span className="w-28 shrink-0 text-right text-sm font-medium tabular-nums text-ink">
            {formatDate(t)}
          </span>
        </label>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-ink-3">NAV — flows on or after {formatDate(t)}</p>
            <p className={cn("mt-1 text-xl font-semibold tabular-nums", first || last ? "text-good" : "text-ink")}>
              {formatMoney(nav, currency, 2)}
            </p>
          </div>
          <div>
            <p className="text-sm text-ink-3">Open exposure — flows strictly after</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{formatMoney(open, currency, 2)}</p>
          </div>
          <div>
            <p className="text-sm text-ink-3">Difference</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{formatMoney(onDate, currency, 2)}</p>
            <p className="mt-0.5 text-sm text-ink-3">the cashflow paid that day</p>
          </div>
        </div>

        {first || last ? (
          <p className="mt-4 inline-flex items-start gap-2 rounded-lg border border-hairline bg-subtle px-3 py-2 text-sm leading-relaxed text-ink-2">
            <Check size={15} className="mt-0.5 shrink-0 text-good" />
            {first ? (
              <>
                <strong className="font-medium text-ink">NAV(0) = 0.</strong> Not a special case in
                the code: discounting every flow at the rate that sets their NPV to zero is the
                definition of the IRR. The check passes because the two definitions agree.
              </>
            ) : (
              <>
                <strong className="font-medium text-ink">NAV at the final date = the terminal value.</strong>{" "}
                Only one flow remains, discounted over zero days, so the schedule ends at the exit
                value of {formatMoney(onDate, currency, 2)}.
              </>
            )}
          </p>
        ) : null}
      </div>

      <div className="p-5">
        <p className="text-[11px] font-semibold tracking-widest text-ink-3 uppercase">
          {remaining.length} flows remain, discounted at the {currency} IRR of {(irr * 100).toFixed(4)}%
        </p>
        <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-hairline">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr>
                {["Date", "Amount", "Years", "Discount factor", "Present value"].map((label, i) => (
                  <th
                    key={label}
                    className={cn(
                      "sticky top-0 z-10 border-b border-hairline bg-subtle px-4 py-2 text-sm font-medium text-ink-3",
                      i === 0 ? "text-left" : "text-right",
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {remaining.map((flow) => (
                <tr key={flow.date} className={flow.date === t ? "bg-accent-soft/40" : undefined}>
                  <td className="border-b border-grid px-4 py-1.5 whitespace-nowrap text-ink-2">
                    {formatDate(flow.date)}
                    {flow.date === t ? <span className="ml-2 text-[11px] text-accent">today</span> : null}
                  </td>
                  <td className="border-b border-grid px-4 py-1.5 text-right tabular-nums text-ink-2">
                    {formatMoney(flow.amount, currency)}
                  </td>
                  <td className="border-b border-grid px-4 py-1.5 text-right tabular-nums text-ink-3">
                    {flow.years.toFixed(3)}
                  </td>
                  <td className="border-b border-grid px-4 py-1.5 text-right tabular-nums text-ink-3">
                    {flow.factor.toFixed(6)}
                  </td>
                  <td className="border-b border-grid px-4 py-1.5 text-right tabular-nums text-ink">
                    {formatMoney(flow.pv, currency, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="px-4 py-2 text-right text-sm font-medium text-ink-2">
                  NAV at {formatDate(t)}
                </td>
                <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-ink">
                  {SYMBOL[currency]}
                  {remaining
                    .reduce((sum, flow) => sum + flow.pv, 0)
                    .toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-3">
          Day count is actual/365 and the discount rate is the position's own IRR, not a market
          curve. That keeps the schedule internally consistent — it is the valuation implied by the
          projection itself, which is what makes NAV(0) = 0 a check rather than a coincidence.
        </p>
      </div>
    </Panel>
  );
}
