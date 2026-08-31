import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FxForwardTrade } from "@/api/types";
import { CHART, currencyColor } from "@/lib/series";
import { formatAxisDate, formatDate, formatMoney, formatMoneyCompact, toNumber } from "@/lib/format";
import { roundDomain, roundTicks } from "@/lib/scale";
import { TooltipCard } from "./ChartTooltip";

interface Column {
  tradeDate: string;
  valueDate: string;
  notional: number;
}

/** Labels only the first and last column — the programme's opening and closing size. */
function EndLabels({ currency, count }: { currency: string; count: number }) {
  return function render(props: unknown) {
    const { x, y, width, value, index } = props as {
      x: number;
      y: number;
      width: number;
      value: number;
      index: number;
    };
    if (index !== 0 && index !== count - 1) return null;
    return (
      <text
        x={x + width / 2}
        y={y - 8}
        textAnchor="middle"
        fill="#0b0b0b"
        fontSize={12}
        fontWeight={600}
      >
        {formatMoneyCompact(value, currency)}
      </text>
    );
  };
}

/** The recommended forward notional struck on each trade date, for one currency. */
export function NotionalChart({
  trades,
  currency,
  height = 200,
}: {
  trades: FxForwardTrade[];
  currency: string;
  height?: number;
}) {
  const color = currencyColor(currency);
  const data: Column[] = trades.map((trade) => ({
    tradeDate: trade.trade_date,
    valueDate: trade.value_date,
    notional: toNumber(trade.notional_sell),
  }));

  const ceiling = Math.max(...data.map((column) => column.notional));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 24, right: 12, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={CHART.grid} strokeWidth={1} vertical={false} />
        <XAxis
          dataKey="tradeDate"
          tickFormatter={formatAxisDate}
          interval={3}
          tickLine={false}
          axisLine={{ stroke: CHART.axis }}
          tick={{ fill: CHART.tick, fontSize: CHART.tickFontSize }}
          tickMargin={8}
        />
        <YAxis
          width={64}
          domain={roundDomain(ceiling)}
          ticks={roundTicks(ceiling)}
          tickFormatter={(value: number) => formatMoneyCompact(value, currency)}
          tickLine={false}
          axisLine={false}
          tick={{ fill: CHART.tick, fontSize: CHART.tickFontSize }}
        />
        <Tooltip
          cursor={{ fill: "rgba(11,11,11,0.03)" }}
          isAnimationActive={false}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const column = payload[0].payload as Column;
            return (
              <TooltipCard
                title={`Trade ${formatDate(column.tradeDate)}`}
                rows={[
                  { label: `Sell ${currency}`, value: formatMoney(column.notional, currency), color },
                  {
                    label: "Settles",
                    value: formatDate(column.valueDate),
                    color: "#52514e",
                    area: true,
                  },
                ]}
              />
            );
          }}
        />
        <Bar
          dataKey="notional"
          fill={color}
          barSize={12}
          radius={[CHART.barRadius, CHART.barRadius, 0, 0]}
          isAnimationActive={false}
        >
          <LabelList dataKey="notional" content={EndLabels({ currency, count: data.length })} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
