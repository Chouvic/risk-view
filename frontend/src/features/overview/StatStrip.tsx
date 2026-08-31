import type { FundAnalytics } from "@/api/types";
import { Card } from "@/components/ui/Card";
import { HeroStat, Stat } from "@/components/ui/Stat";
import { ALL_CURRENCIES } from "@/lib/scope";
import { formatBps, formatDate, formatMoneyCompact, formatPercent, pluralise } from "@/lib/format";

/**
 * The headline figures, scoped by the currency filter: the whole fund in base
 * currency, or one position in local terms.
 */
export function StatStrip({ analytics, scope }: { analytics: FundAnalytics; scope: string }) {
  const { irr, nav, hedges, summary } = analytics;
  const scoped = scope !== ALL_CURRENCIES;
  const schedule = scoped ? nav.by_currency[scope as keyof typeof nav.by_currency] : nav.fund;
  const currency = schedule.currency;
  const inception = schedule.points[0];
  const trades = scoped ? hedges.filter((trade) => trade.sell_currency === scope) : hedges;
  const hedgedCurrencies = [...new Set(trades.map((trade) => trade.sell_currency))];
  const exposed = summary.currencies.filter((code) => code !== summary.base_currency);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
      <Card>
        <HeroStat
          metric={scoped ? "currencyIrr" : "fundIrr"}
          label={scoped ? `${currency} IRR` : "Fund IRR"}
          value={formatPercent(schedule.irr)}
          detail={
            scoped
              ? `Local ${currency} flows, actual/365`
              : `${summary.base_currency} base · ${pluralise(summary.cashflow_count, "cashflow")}`
          }
        />
      </Card>

      <Card className="lg:col-span-3">
        <div className="grid grid-cols-1 divide-y divide-hairline sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Stat
            metric="openExposure"
            label="Exposure at inception"
            value={formatMoneyCompact(inception.open_exposure, currency)}
            detail={`Outstanding on ${formatDate(inception.date)}`}
          />
          {scoped ? (
            <Stat
              metric="fundIrr"
              label="Against the fund"
              value={formatBps(schedule.irr - irr.fund_irr)}
              detail={`Fund IRR ${formatPercent(irr.fund_irr)} in ${irr.base_currency}`}
            />
          ) : (
            <Stat
              metric="positionCurrency"
              label="Positions"
              value={pluralise(summary.currencies.length, "currency", "currencies")}
              detail={`${summary.base_currency} base · ${exposed.join(", ")} exposed to FX`}
            />
          )}
          <Stat
            metric="hedgeProgramme"
            label="Hedge programme"
            value={pluralise(trades.length, "forward")}
            detail={
              hedgedCurrencies.length
                ? `${hedgedCurrencies.join(", ")} sold vs ${summary.base_currency}, 3M rolling`
                : `${currency} is the base currency — none required`
            }
          />
        </div>
      </Card>
    </div>
  );
}
