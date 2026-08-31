import { ShieldCheck } from "lucide-react";
import type { FundAnalytics, FxForwardTrade } from "@/api/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { InfoLabel } from "@/components/ui/InfoLabel";
import { NotionalChart } from "@/components/charts/NotionalChart";
import { ALL_CURRENCIES } from "@/lib/scope";
import { formatDate, formatMoneyCompact, pluralise } from "@/lib/format";
import { currencyColor } from "@/lib/series";
import { HedgeBlotter } from "./HedgeBlotter";

/** Group trades by the currency being sold — one hedge programme per exposure. */
function byCurrency(trades: FxForwardTrade[]): Map<string, FxForwardTrade[]> {
  const groups = new Map<string, FxForwardTrade[]>();
  for (const trade of trades) {
    const group = groups.get(trade.sell_currency) ?? [];
    group.push(trade);
    groups.set(trade.sell_currency, group);
  }
  return groups;
}

export function HedgeSection({ analytics, scope }: { analytics: FundAnalytics; scope: string }) {
  const trades =
    scope === ALL_CURRENCIES
      ? analytics.hedges
      : analytics.hedges.filter((trade) => trade.sell_currency === scope);
  const groups = byCurrency(trades);

  if (trades.length === 0) {
    return (
      <Card>
        <CardBody className="flex items-center gap-3">
          <ShieldCheck size={18} className="text-good" />
          <p className="text-sm text-ink-2">
            {scope === analytics.summary.base_currency
              ? `${scope} is the fund's base currency. No FX risk, so no forward is recommended.`
              : "No open exposure in this scope."}
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {[...groups].map(([currency, currencyTrades]) => {
          const opening = currencyTrades[0];
          const closing = currencyTrades[currencyTrades.length - 1];
          return (
            <Card key={currency}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ background: currencyColor(currency) }}
                    />
                    Sell {currency} · buy {analytics.summary.base_currency}
                  </span>
                }
                description={`${pluralise(currencyTrades.length, "forward")} from ${formatDate(opening.trade_date)}, each settling three months on. Notional ${formatMoneyCompact(opening.notional_sell, currency)} to ${formatMoneyCompact(closing.notional_sell, currency)}.`}
              />
              <CardBody className="pt-2">
                <NotionalChart trades={currencyTrades} currency={currency} />
              </CardBody>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader
          title={<InfoLabel metric="hedgeProgramme" label="Trade blotter" />}
          description="Recommended forwards, in execution order."
        />
        <HedgeBlotter trades={trades} />
      </Card>
    </div>
  );
}
