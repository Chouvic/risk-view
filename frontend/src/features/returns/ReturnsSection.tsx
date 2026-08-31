import type { FundAnalytics } from "@/api/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { InfoDot, InfoLabel } from "@/components/ui/InfoLabel";
import { SortTh, Table, Td, Th } from "@/components/ui/Table";
import { useSort } from "@/hooks/useSort";
import { sortRows } from "@/lib/sorting";
import { toNumber } from "@/lib/format";
import { IrrChart } from "@/components/charts/IrrChart";
import { ALL_CURRENCIES } from "@/lib/scope";
import { formatBps, formatMoney, formatPercent, pluralise } from "@/lib/format";
import { currencyColor } from "@/lib/series";
import { cn } from "@/lib/cn";

type Column = "currency" | "irr" | "vsFund" | "exposure" | "terminal";

/** IRR per position currency against the fund's own IRR, then the numbers behind it. */
export function ReturnsSection({ analytics, scope }: { analytics: FundAnalytics; scope: string }) {
  const { irr, nav, hedges, summary } = analytics;
  const data = Object.entries(irr.currency_irr).map(([currency, value]) => ({ currency, irr: value }));
  const rates = data.map((datum) => datum.irr);
  const spread = Math.max(...rates) - Math.min(...rates);
  const best = data.reduce((a, b) => (a.irr >= b.irr ? a : b));
  const worst = data.reduce((a, b) => (a.irr <= b.irr ? a : b));
  const highlight = scope === ALL_CURRENCIES ? undefined : scope;

  const { sort, toggle } = useSort<Column>("irr", "desc");
  const detail = sortRows(data, sort, ({ currency, irr: rate }, column) => {
    const schedule = nav.by_currency[currency as keyof typeof nav.by_currency];
    switch (column) {
      case "currency":
        return currency;
      case "irr":
        return rate;
      case "vsFund":
        return rate - irr.fund_irr;
      case "exposure":
        return toNumber(schedule.points[0].open_exposure);
      case "terminal":
        return toNumber(schedule.points[schedule.points.length - 1].nav);
    }
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={<InfoLabel metric="currencyIrr" label="IRR by position currency" />}
          description={`Local-flow IRR by currency, ranked against the fund's ${formatPercent(irr.fund_irr)} in ${irr.base_currency}.`}
        />
        <CardBody className="pt-2">
          <IrrChart
            data={data}
            fundIrr={irr.fund_irr}
            baseCurrency={irr.base_currency}
            highlight={highlight}
          />
        </CardBody>
        <div className="border-t border-hairline px-5 py-3 text-sm text-ink-2">
          <span className="font-medium text-ink">{formatBps(spread)}</span> between the highest and
          lowest position IRR — {best.currency} {formatPercent(best.irr)}, {worst.currency}{" "}
          {formatPercent(worst.irr)}. FX hedging does not address this dispersion.
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Position detail"
          description="Local-currency figures; no FX conversion applied."
        />
        <Table>
          <thead>
            <tr>
              <SortTh column="currency" sort={sort} onSort={toggle} metric="positionCurrency">
                Position
              </SortTh>
              <SortTh column="irr" sort={sort} onSort={toggle} metric="currencyIrr" numeric>
                IRR
              </SortTh>
              <SortTh column="vsFund" sort={sort} onSort={toggle} metric="fundIrr" numeric>
                vs fund
              </SortTh>
              <SortTh column="exposure" sort={sort} onSort={toggle} metric="openExposure" numeric>
                Exposure at inception
              </SortTh>
              <SortTh column="terminal" sort={sort} onSort={toggle} metric="terminalValue" numeric>
                Terminal value
              </SortTh>
              <Th className="w-full">
                <span className="inline-flex items-center gap-1.5">
                  Hedge
                  <InfoDot metric="hedgeProgramme" />
                </span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {detail.map(({ currency, irr: rate }) => {
              const schedule = nav.by_currency[currency as keyof typeof nav.by_currency];
              const trades = hedges.filter((trade) => trade.sell_currency === currency);
              const isBase = currency === summary.base_currency;
              return (
                <tr
                  key={currency}
                  className={cn("hover:bg-subtle", highlight === currency && "bg-accent-soft/60")}
                >
                  <Td>
                    <span className="inline-flex items-center gap-2 font-medium text-ink">
                      <span
                        aria-hidden
                        className="size-2 rounded-full"
                        style={{ background: currencyColor(currency) }}
                      />
                      {currency}
                      {isBase ? <span className="text-xs text-ink-3">base</span> : null}
                    </span>
                  </Td>
                  <Td numeric>{formatPercent(rate)}</Td>
                  <Td numeric>{formatBps(rate - irr.fund_irr)}</Td>
                  <Td numeric>{formatMoney(schedule.points[0].open_exposure, currency)}</Td>
                  <Td numeric>
                    {formatMoney(schedule.points[schedule.points.length - 1].nav, currency)}
                  </Td>
                  <Td>
                    {isBase ? "Not required" : pluralise(trades.length, "forward")}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
