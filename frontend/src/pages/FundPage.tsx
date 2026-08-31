import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { FundAnalytics, FundSummary } from "@/api/types";
import { useFundAnalytics } from "@/hooks/useFundAnalytics";
import { useActiveSection } from "@/hooks/useActiveSection";
import { FUND_SECTIONS } from "@/lib/sections";
import { ALL_CURRENCIES } from "@/lib/scope";
import { formatDate, formatTenor } from "@/lib/format";
import { cn } from "@/lib/cn";
import { FundHeader } from "@/features/shell/FundHeader";
import { Section } from "@/features/shell/Section";
import { StatStrip } from "@/features/overview/StatStrip";
import { ReturnsSection } from "@/features/returns/ReturnsSection";
import { NavSection } from "@/features/nav/NavSection";
import { HedgeSection } from "@/features/hedges/HedgeSection";

const SECTION_IDS = FUND_SECTIONS.map((section) => section.id);

/** One fund top to bottom, scoped by the header's currency filter. */
export function FundPage({
  fund,
  onActiveSectionChange,
}: {
  fund: FundSummary;
  /** Reported upward so the sidebar can mark where the reader is. */
  onActiveSectionChange: (id: string) => void;
}) {
  const analytics = useFundAnalytics(fund);
  const [scope, setScope] = useState<string>(ALL_CURRENCIES);
  // A currency the fund does not hold falls back to All.
  const activeScope =
    scope !== ALL_CURRENCIES && !fund.currencies.includes(scope as never) ? ALL_CURRENCIES : scope;

  const data = analytics.data;
  const activeSection = useActiveSection(SECTION_IDS, data !== null);
  useEffect(() => onActiveSectionChange(activeSection), [activeSection, onActiveSectionChange]);

  // Arriving with a hash already set. Waits for the data, since the sections do
  // not exist until the analytics load; sidebar clicks scroll themselves.
  const { hash, key } = useLocation();
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "auto", block: "start" });
  }, [hash, key, data]);

  const points = data?.nav.fund.points ?? [];
  const horizon = points.length
    ? `${formatDate(points[0].date)} → ${formatDate(points[points.length - 1].date)} · ${formatTenor(points[0].date, points[points.length - 1].date)}`
    : "—";

  return (
    <>
      <FundHeader fund={fund} horizon={horizon} scope={activeScope} onScopeChange={setScope} />

      {analytics.error ? (
        <div className="flex items-center gap-2 px-6 py-10 text-[15px] text-critical">
          <AlertTriangle size={16} />
          {analytics.error}
        </div>
      ) : !data ? (
        <div className="flex justify-center py-24">
          <Loader2 className="animate-spin text-ink-3" />
        </div>
      ) : (
        // Reloading dims the page rather than replacing it, so nothing jumps.
        <div className={cn("transition-opacity", analytics.refreshing && "opacity-50")}>
          {FUND_SECTIONS.map(({ id, title, description }) => (
            <Section key={id} id={id} title={title} description={description}>
              <SectionBody id={id} analytics={data} scope={activeScope} onScopeChange={setScope} />
            </Section>
          ))}
        </div>
      )}
    </>
  );
}

function SectionBody({
  id,
  analytics,
  scope,
  onScopeChange,
}: {
  id: string;
  analytics: FundAnalytics;
  scope: string;
  onScopeChange: (scope: string) => void;
}) {
  switch (id) {
    case "overview":
      return <StatStrip analytics={analytics} scope={scope} />;
    case "returns":
      return <ReturnsSection analytics={analytics} scope={scope} />;
    case "nav":
      return <NavSection analytics={analytics} scope={scope} onScopeChange={onScopeChange} />;
    case "hedges":
      return <HedgeSection analytics={analytics} scope={scope} />;
    default:
      return null;
  }
}
