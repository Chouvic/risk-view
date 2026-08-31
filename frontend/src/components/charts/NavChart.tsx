import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NavPoint } from "@/api/types";
import { CHART, currencyColor } from "@/lib/series";
import { formatAxisDate, formatDate, formatMoney, formatMoneyCompact, toNumber } from "@/lib/format";
import { roundDomain, roundTicks } from "@/lib/scale";
import { TooltipCard } from "./ChartTooltip";

/**
 * NAV against open exposure. Same quantity in the same currency, so they share an
 * axis and a hue: NAV is the line, exposure the wash beneath it.
 */
export function NavChart({
  points,
  currency,
  compact = false,
  height = 280,
}: {
  points: NavPoint[];
  currency: string;
  compact?: boolean;
  height?: number;
}) {
  const color = currencyColor(currency);
  const data = points.map((point) => ({
    date: point.date,
    nav: toNumber(point.nav),
    exposure: toNumber(point.open_exposure),
  }));
  const ceiling = Math.max(...data.map((point) => Math.max(point.nav, point.exposure)));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={data}
        margin={
          compact ? { top: 6, right: 4, bottom: 0, left: 4 } : { top: 12, right: 30, bottom: 4, left: 8 }
        }
      >
        <CartesianGrid stroke={CHART.grid} strokeWidth={1} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatAxisDate}
          interval={compact ? "preserveStartEnd" : 3}
          hide={compact}
          tickLine={false}
          axisLine={{ stroke: CHART.axis }}
          tick={{ fill: CHART.tick, fontSize: CHART.tickFontSize }}
          tickMargin={8}
          minTickGap={16}
        />
        <YAxis
          hide={compact}
          width={64}
          domain={roundDomain(ceiling)}
          ticks={roundTicks(ceiling)}
          tickFormatter={(value: number) => formatMoneyCompact(value, currency)}
          tickLine={false}
          axisLine={false}
          tick={{ fill: CHART.tick, fontSize: CHART.tickFontSize }}
        />
        <Tooltip
          cursor={{ stroke: CHART.crosshair, strokeWidth: 1 }}
          isAnimationActive={false}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0].payload as (typeof data)[number];
            return (
              <TooltipCard
                title={formatDate(String(label))}
                rows={[
                  { label: "NAV", value: formatMoney(point.nav, currency), color },
                  {
                    label: "Open exposure",
                    value: formatMoney(point.exposure, currency),
                    color,
                    area: true,
                  },
                ]}
              />
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="exposure"
          stroke={color}
          strokeOpacity={0.4}
          strokeWidth={1}
          fill={color}
          fillOpacity={CHART.areaOpacity}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="nav"
          stroke={color}
          strokeWidth={CHART.lineWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={false}
          activeDot={{ r: 4, fill: color, stroke: CHART.surface, strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
