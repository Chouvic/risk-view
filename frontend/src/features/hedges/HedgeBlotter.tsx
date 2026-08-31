import { useState } from "react";
import type { FxForwardTrade } from "@/api/types";
import { Button } from "@/components/ui/Button";
import { SortTh, SpacerTd, SpacerTh, Table, Td } from "@/components/ui/Table";
import { useSort } from "@/hooks/useSort";
import { formatDate, formatMoney, formatPercent, toNumber } from "@/lib/format";
import { sortRows } from "@/lib/sorting";

const PREVIEW_ROWS = 8;

type Column = "trade" | "value" | "sell" | "notional" | "coverage";

/** Every recommended trade, in execution order until the reader sorts it otherwise. */
export function HedgeBlotter({ trades }: { trades: FxForwardTrade[] }) {
  const [expanded, setExpanded] = useState(false);
  const { sort, toggle } = useSort<Column>("trade");

  const ordered = sortRows(trades, sort, (trade, column) => {
    switch (column) {
      case "trade":
        return trade.trade_date;
      case "value":
        return trade.value_date;
      case "sell":
        return trade.sell_currency;
      case "notional":
        return toNumber(trade.notional_sell);
      case "coverage":
        return trade.coverage_ratio;
    }
  });
  const visible = expanded ? ordered : ordered.slice(0, PREVIEW_ROWS);

  return (
    <>
      <Table>
        <thead>
          <tr>
            <SortTh column="trade" sort={sort} onSort={toggle} metric="tradeDate">
              Trade date
            </SortTh>
            <SortTh column="value" sort={sort} onSort={toggle} metric="valueDate">
              Value date
            </SortTh>
            <SortTh column="sell" sort={sort} onSort={toggle}>
              Sell
            </SortTh>
            <SortTh column="notional" sort={sort} onSort={toggle} metric="notional" numeric>
              Notional
            </SortTh>
            <SortTh column="coverage" sort={sort} onSort={toggle} metric="coverageRatio" numeric>
              Coverage
            </SortTh>
            <SpacerTh />
          </tr>
        </thead>
        <tbody>
          {visible.map((trade) => (
            <tr key={`${trade.sell_currency}-${trade.trade_date}`} className="hover:bg-subtle">
              <Td>{formatDate(trade.trade_date)}</Td>
              <Td>{formatDate(trade.value_date)}</Td>
              <Td className="font-medium text-ink">
                {trade.sell_currency} → {trade.buy_currency}
              </Td>
              <Td numeric>{formatMoney(trade.notional_sell, trade.sell_currency)}</Td>
              <Td numeric>{formatPercent(trade.coverage_ratio, 0)}</Td>
              <SpacerTd />
            </tr>
          ))}
        </tbody>
      </Table>
      {ordered.length > PREVIEW_ROWS ? (
        <div className="flex items-center justify-between px-5 py-3">
          <p className="text-sm text-ink-3">
            Showing {visible.length} of {ordered.length}
          </p>
          <Button variant="ghost" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Show fewer" : "Show all"}
          </Button>
        </div>
      ) : null}
    </>
  );
}
