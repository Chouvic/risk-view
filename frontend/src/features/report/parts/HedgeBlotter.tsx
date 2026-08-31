import { useState } from "react";
import { Segmented } from "@/components/ui/Segmented";
import { Card, CardHeader } from "@/components/ui/Card";
import { formatDate, formatMoney, formatMoneyCompact } from "@/lib/format";
import { BASE, CURRENCY_COLOR, HEDGES, NON_BASE, type Currency } from "../lib/model";
import { Figure } from "./ui";
import { cn } from "@/lib/cn";

/** The generated programme for one exposure. A result, not a toy: the only control picks the pair. */
export function HedgeBlotter() {
  const [currency, setCurrency] = useState<Currency>(NON_BASE[0]);
  const rolls = HEDGES.filter((hedge) => hedge.sell === currency);

  return (
    <Card>
      <CardHeader
        title="Generated programme"
        description={`${HEDGES.length} forwards for Fund I — ${NON_BASE.map((code) => `${HEDGES.filter((hedge) => hedge.sell === code).length} ${code}`).join(", ")}. The base currency is not hedged.`}
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
      />

      <div className="grid grid-cols-2 divide-x divide-hairline border-b border-hairline sm:grid-cols-4">
        <Figure label="Forwards" value={String(rolls.length)} detail="one per roll date" />
        <Figure label="Roll" value="3 months" detail="month-end to month-end" />
        <Figure
          label="First notional"
          value={formatMoneyCompact(rolls[0]?.notional ?? 0, currency)}
          detail={formatDate(rolls[0]?.tradeDate ?? "")}
        />
        <Figure
          label="Last"
          value={formatMoneyCompact(rolls[rolls.length - 1]?.notional ?? 0, currency)}
          detail={formatDate(rolls[rolls.length - 1]?.tradeDate ?? "")}
        />
      </div>

      <div className="max-h-56 overflow-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr>
              {["Trade date", "Value date", "Sell", "Buy", "Notional"].map((label, i) => (
                <th
                  key={label}
                  className={cn(
                    "sticky top-0 z-10 border-b border-hairline bg-subtle px-4 py-2 text-sm font-medium text-ink-3",
                    i === 4 ? "text-right" : "text-left",
                  )}
                >
                  {label}
                </th>
              ))}
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
                <td className="border-b border-grid px-4 py-1.5 text-ink-2">{roll.sell}</td>
                <td className="border-b border-grid px-4 py-1.5 text-ink-2">{roll.buy}</td>
                <td className="border-b border-grid px-4 py-1.5 text-right tabular-nums text-ink">
                  {formatMoney(roll.notional, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
