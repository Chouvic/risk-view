import { useState } from "react";
import type { FundAnalytics, NavSchedule } from "@/api/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { InfoLabel } from "@/components/ui/InfoLabel";
import { Segmented } from "@/components/ui/Segmented";
import { Legend } from "@/components/charts/Legend";
import { NavChart } from "@/components/charts/NavChart";
import { ALL_CURRENCIES } from "@/lib/scope";
import { formatDate, formatMoneyCompact, formatPercent } from "@/lib/format";
import { currencyColor } from "@/lib/series";
import { cn } from "@/lib/cn";
import { NavTable } from "./NavTable";

type View = "chart" | "table";

/** What the position is worth at each date, and how much is still outstanding. */
export function NavSection({
  analytics,
  scope,
  onScopeChange,
}: {
  analytics: FundAnalytics;
  scope: string;
  onScopeChange: (scope: string) => void;
}) {
  const [view, setView] = useState<View>("chart");
  const scoped = scope !== ALL_CURRENCIES;
  const schedule = scoped ? analytics.nav.by_currency[scope as keyof object] : analytics.nav.fund;
  const color = currencyColor(schedule.currency);
  const last = schedule.points[schedule.points.length - 1];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={
            <InfoLabel
              metric="nav"
              label={scoped ? `${scope} position NAV` : `Fund NAV (${schedule.currency})`}
            />
          }
          description={`Discounted at ${formatPercent(schedule.irr)}. Terminal value ${formatMoneyCompact(last.nav, schedule.currency)} on ${formatDate(last.date)}.`}
          actions={
            <Segmented
              ariaLabel="NAV view"
              value={view}
              onChange={setView}
              options={[
                { value: "chart", label: "Chart" },
                { value: "table", label: "Table" },
              ]}
            />
          }
        />
        {view === "chart" ? (
          <CardBody className="space-y-3 pt-4">
            <Legend
              items={[
                { label: "NAV", color },
                { label: "Open exposure", color, area: true },
              ]}
            />
            <NavChart points={schedule.points} currency={schedule.currency} height={300} />
          </CardBody>
        ) : (
          <NavTable schedule={schedule} />
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Object.values(analytics.nav.by_currency).map((currencySchedule) => (
          <PositionCard
            key={currencySchedule.currency}
            schedule={currencySchedule}
            selected={scope === currencySchedule.currency}
            onSelect={() =>
              onScopeChange(scope === currencySchedule.currency ? ALL_CURRENCIES : currencySchedule.currency)
            }
          />
        ))}
      </div>
    </div>
  );
}

/** A small multiple: each currency on its own scale, since the units differ. */
function PositionCard({
  schedule,
  selected,
  onSelect,
}: {
  schedule: NavSchedule;
  selected: boolean;
  onSelect: () => void;
}) {
  const color = currencyColor(schedule.currency);
  const inception = schedule.points[0];

  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "rounded-xl border bg-surface p-4 text-left transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        selected ? "border-ink" : "border-hairline hover:border-ink-3",
      )}
    >
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />
          {schedule.currency}
        </span>
        <span className="text-sm font-medium text-ink-2 tabular-nums">
          {formatPercent(schedule.irr)} IRR
        </span>
      </div>
      <div className="-mx-1 mt-3">
        <NavChart points={schedule.points} currency={schedule.currency} compact height={72} />
      </div>
      <p className="mt-2 text-xs text-ink-3">
        {formatMoneyCompact(inception.open_exposure, schedule.currency)} exposure at inception
      </p>
    </button>
  );
}
