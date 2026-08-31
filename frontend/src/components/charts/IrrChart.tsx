import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART, currencyColor } from "@/lib/series";
import { formatBps, formatPercent } from "@/lib/format";
import { TooltipCard } from "./ChartTooltip";

interface IrrDatum {
  currency: string;
  irr: number;
}

/** IRR per position currency, ranked, with the fund IRR as a reference line. */
export function IrrChart({
  data,
  fundIrr,
  baseCurrency,
  highlight,
}: {
  data: IrrDatum[];
  fundIrr: number;
  baseCurrency: string;
  /** When the page is filtered to one currency, the others recede rather than disappear. */
  highlight?: string;
}) {
  const ranked = [...data].sort((a, b) => b.irr - a.irr);
  const ceiling = Math.max(fundIrr, ...ranked.map((d) => d.irr)) * 1.25;

  return (
    <ResponsiveContainer width="100%" height={ranked.length * 46 + 44}>
      <BarChart
        data={ranked}
        layout="vertical"
        margin={{ top: 20, right: 56, bottom: 4, left: 4 }}
        barCategoryGap="28%"
      >
        <CartesianGrid stroke={CHART.grid} strokeWidth={1} horizontal={false} />
        <XAxis
          type="number"
          domain={[0, ceiling]}
          tickFormatter={(value: number) => formatPercent(value, 0)}
          tickLine={false}
          axisLine={{ stroke: CHART.axis }}
          tick={{ fill: CHART.tick, fontSize: CHART.tickFontSize }}
          tickMargin={8}
        />
        <YAxis
          type="category"
          dataKey="currency"
          width={48}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#52514e", fontSize: 13, fontWeight: 500 }}
        />
        <ReferenceLine
          x={fundIrr}
          stroke="#52514e"
          strokeWidth={1.5}
          label={{
            value: `Fund ${formatPercent(fundIrr)}`,
            position: "top",
            fill: "#52514e",
            fontSize: 12,
            fontWeight: 500,
          }}
        />
        <Tooltip
          cursor={{ fill: "rgba(11,11,11,0.03)" }}
          isAnimationActive={false}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0].payload as IrrDatum;
            return (
              <TooltipCard
                title={`${point.currency} position`}
                rows={[
                  { label: "IRR", value: formatPercent(point.irr), color: currencyColor(point.currency) },
                  {
                    label: `vs fund (${baseCurrency})`,
                    value: formatBps(point.irr - fundIrr),
                    color: "#52514e",
                    area: true,
                  },
                ]}
              />
            );
          }}
        />
        <Bar
          dataKey="irr"
          barSize={CHART.barSize}
          radius={[0, CHART.barRadius, CHART.barRadius, 0]}
          isAnimationActive={false}
        >
          {ranked.map((datum) => (
            <Cell
              key={datum.currency}
              fill={currencyColor(datum.currency)}
              fillOpacity={!highlight || highlight === datum.currency ? 1 : 0.25}
            />
          ))}
          <LabelList
            dataKey="irr"
            position="right"
            offset={10}
            formatter={(value: number) => formatPercent(value)}
            style={{ fill: "#0b0b0b", fontSize: 13, fontWeight: 600 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
