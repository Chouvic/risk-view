import { formatPercent } from "@/lib/format";
import { ReportSection } from "../ReportShell";
import { DATA, FUND, HEADLINE, HEDGES, NON_BASE } from "../lib/model";
import { Claim, Figure, Prose } from "../parts/ui";

/** Why the feature exists. */
export function Problem() {
  return (
    <ReportSection id="problem">
      <Claim>
        A private credit fund is paid for taking credit risk. It is not paid for taking currency
        risk — and {formatPercent(HEADLINE.nonBaseShare, 1)} of its money sits in currencies it does
        not report in.
      </Claim>

      <Prose>
        Fund I lends £100m, €150m and $200m and reports in euros. It returns{" "}
        {formatPercent(FUND.fundIrr)}. An ordinary year in EUR/GBP moves further than that. Hedging
        adds no return; it removes the part of the return nobody underwrote.
      </Prose>

      <div className="grid gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-3">
        <div className="bg-surface">
          <Figure
            label="1 · Ingest"
            value={`${DATA.summary.accepted} rows`}
            detail={`${DATA.summary.corrected} repaired, 0 rejected.`}
          />
        </div>
        <div className="bg-surface">
          <Figure
            label="2 · Measure"
            value={formatPercent(FUND.fundIrr)}
            detail="IRR per currency and per fund, then a NAV schedule for each."
          />
        </div>
        <div className="bg-surface">
          <Figure
            label="3 · Hedge"
            value={`${HEDGES.length} forwards`}
            detail={`${NON_BASE.join(" and ")} sold forward, rolling every three months.`}
          />
        </div>
      </div>
    </ReportSection>
  );
}
