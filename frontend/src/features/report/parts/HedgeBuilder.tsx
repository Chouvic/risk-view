import { useMemo, useState } from "react";
import { Segmented } from "@/components/ui/Segmented";
import { formatDate, formatMoney, formatMoneyCompact } from "@/lib/format";
import { addMonths } from "../lib/finance";
import { BASE, CURRENCY_COLOR, NON_BASE, scheduleFor, type Currency } from "../lib/model";
import { Panel } from "./ui";
import { cn } from "@/lib/cn";

/**
 * From exposure to a trade ticket. The programme is mechanical once the schedule exists:
 * at every roll date, sell the open exposure forward against the base currency.
 *
 * The coverage slider exists because 100% is a policy, not a law — the panel shows what
 * moving off it leaves unhedged.
 */
export function HedgeBuilder() {
  const [currency, setCurrency] = useState<Currency>(NON_BASE[0]);
  const [coverage, setCoverage] = useState(1);

  const schedule = scheduleFor(currency);

  const rolls = useMemo(
    () =>
      schedule.points
        .map((point) => {
          const open = Number(point.open);
          return {
            tradeDate: point.date,
            valueDate: addMonths(point.date, 3),
            open,
            notional: Math.round(open * coverage * 100) / 100,
            residual: Math.round(open * (1 - coverage) * 100) / 100,
          };
        })
        .filter((roll) => roll.open > 0),
    [schedule, coverage],
  );

  const tickets = rolls.filter((roll) => roll.notional > 0);
  const peak = Math.max(...rolls.map((roll) => roll.open), 1);
  const firstOpen = rolls[0]?.open ?? 0;

  return (
    <Panel
      title="Hedge programme"
      description="Rolling three-month forwards: sell the exposure currency, buy the base currency, sized on the open exposure at each roll date."
      actions={
        <Segmented
          ariaLabel="Exposure currency"
          value={currency}
          onChange={setCurrency}
          options={NON_BASE.map((code) => ({
            value: code,
            label: `${code}/${BASE}`,
            color: CURRENCY_COLOR[code],
          }))}
        />
      }
    >
      <div className="border-b border-hairline px-5 py-4">
        <label className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-sm text-ink-3">Coverage</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={coverage}
            onChange={(event) => setCoverage(Number(event.target.value))}
            className="min-w-0 flex-1 accent-ink"
            aria-label="Coverage ratio"
          />
          <span className="w-16 shrink-0 text-right text-sm font-medium tabular-nums text-ink">
            {(coverage * 100).toFixed(0)}%
          </span>
        </label>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Figure label="Tickets" value={String(tickets.length)} />
          <Figure
            label="Largest notional"
            value={formatMoneyCompact(Math.max(...rolls.map((r) => r.notional), 0), currency)}
          />
          <Figure
            label="Unhedged at inception"
            value={formatMoneyCompact(firstOpen * (1 - coverage), currency)}
            tone={coverage < 1 ? "warning" : undefined}
          />
          <Figure label="Roll" value="3 months" detail="month-end to month-end" />
        </div>
      </div>

      <div className="border-b border-hairline p-5">
        <svg viewBox="0 0 660 150" className="h-auto w-full" role="img" aria-label={`${currency} notional by roll date`}>
          {rolls.map((roll, i) => {
            const w = (660 - 20) / rolls.length;
            const x = 10 + i * w;
            const hOpen = (roll.open / peak) * 120;
            const hHedged = (roll.notional / peak) * 120;
            return (
              <g key={roll.tradeDate}>
                <rect x={x + 1} y={130 - hOpen} width={w - 3} height={hOpen} rx={2} fill="var(--color-hairline)" />
                <rect
                  x={x + 1}
                  y={130 - hHedged}
                  width={w - 3}
                  height={hHedged}
                  rx={2}
                  fill={CURRENCY_COLOR[currency]}
                />
              </g>
            );
          })}
          <line x1={10} x2={650} y1={130} y2={130} stroke="var(--color-hairline)" />
          <text x={10} y={146} fontSize={10.5} fill="var(--color-ink-3)">
            {formatDate(rolls[0]?.tradeDate ?? "")}
          </text>
          <text x={650} y={146} textAnchor="end" fontSize={10.5} fill="var(--color-ink-3)">
            {formatDate(rolls[rolls.length - 1]?.tradeDate ?? "")}
          </text>
        </svg>
        <p className="mt-1 text-sm text-ink-3">
          Solid is sold forward; grey above it is exposure left open. The profile is almost flat
          because this is a bullet loan — the principal is the exposure and it stays outstanding
          until the final date, so the programme is twenty near-identical rolls that stop the moment
          the principal comes back. An amortising loan would step down here instead.
        </p>
      </div>

      <div className="p-5">
        <div className="max-h-64 overflow-auto rounded-lg border border-hairline">
          <table className="w-full min-w-[600px] border-collapse text-sm">
            <thead>
              <tr>
                {["Trade date", "Value date", "Sell", "Buy", "Open exposure", "Notional sold"].map(
                  (label, i) => (
                    <th
                      key={label}
                      className={cn(
                        "sticky top-0 z-10 border-b border-hairline bg-subtle px-4 py-2 text-sm font-medium text-ink-3",
                        i >= 4 ? "text-right" : "text-left",
                      )}
                    >
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rolls.map((roll) => (
                <tr key={roll.tradeDate}>
                  <td className="border-b border-grid px-4 py-1.5 whitespace-nowrap text-ink-2">
                    {formatDate(roll.tradeDate)}
                  </td>
                  <td className="border-b border-grid px-4 py-1.5 whitespace-nowrap text-ink-2">
                    {formatDate(roll.valueDate)}
                  </td>
                  <td className="border-b border-grid px-4 py-1.5 text-ink-2">{currency}</td>
                  <td className="border-b border-grid px-4 py-1.5 text-ink-2">{BASE}</td>
                  <td className="border-b border-grid px-4 py-1.5 text-right tabular-nums text-ink-3">
                    {formatMoney(roll.open, currency)}
                  </td>
                  <td
                    className={cn(
                      "border-b border-grid px-4 py-1.5 text-right tabular-nums",
                      roll.notional > 0 ? "text-ink" : "text-ink-3",
                    )}
                  >
                    {formatMoney(roll.notional, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink-2">
          <strong className="font-medium text-ink">Sized on open exposure, not NAV.</strong> The
          brief says 100% of NAV, and on the final date NAV is the terminal value while open
          exposure is zero. Selling the terminal value forward would be selling currency already
          received — an outright short position nobody asked for. One schedule carries both numbers,
          so the reporting view and the trading view stay consistent without either being subtly
          wrong.
        </p>
      </div>
    </Panel>
  );
}

function Figure({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "warning";
}) {
  return (
    <div>
      <p className="text-sm text-ink-3">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          tone === "warning" ? "text-warning" : "text-ink",
        )}
      >
        {value}
      </p>
      {detail ? <p className="mt-0.5 text-sm text-ink-3">{detail}</p> : null}
    </div>
  );
}
