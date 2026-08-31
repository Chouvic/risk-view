import { formatMoneyCompact, formatPercent } from "@/lib/format";
import { ReportSection } from "../ReportShell";
import { DATA, FUND, HEADLINE, HEDGES, NON_BASE } from "../lib/model";
import { Claim, Figure, Prose, Takeaway } from "../parts/ui";

/** Why the feature exists, in the terms a client would use. */
export function Problem() {
  return (
    <ReportSection id="problem">
      <Claim>
        A private credit fund is paid for taking credit risk. It is not paid for taking currency
        risk — and it takes a great deal of it.
      </Claim>

      <Prose>
        Fund I lends £100m, €150m and $200m, and reports to its investors in euros.{" "}
        {formatPercent(HEADLINE.nonBaseShare, 1)} of the money it has put out is in a currency it
        does not report in. The loans return about {formatPercent(FUND.fundIrr)}. An ordinary year
        in EUR/GBP moves further than that. Left alone, the number the investor sees is mostly a
        currency bet nobody decided to take.
      </Prose>

      <Prose>
        Hedging adds no return. It removes the part of the return nobody underwrote, so what is
        left is the credit decision. This service is what stands between a client's cashflow
        projection and the trades that do it.
      </Prose>

      <div className="grid gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-3">
        <div className="bg-surface">
          <Figure
            label="1 · Ingest"
            value={`${DATA.summary.accepted} rows`}
            detail={`${DATA.summary.corrected} repaired, 0 rejected. Take the client's schedule, and refuse anything it cannot vouch for.`}
          />
        </div>
        <div className="bg-surface">
          <Figure
            label="2 · Measure"
            value={formatPercent(FUND.fundIrr)}
            detail="Solve each position's IRR, then discount what remains into a NAV schedule — one per currency, one for the fund."
          />
        </div>
        <div className="bg-surface">
          <Figure
            label="3 · Hedge"
            value={`${HEDGES.length} tickets`}
            detail={`Sell each non-base exposure (${NON_BASE.join(", ")}) forward, rolling every three months.`}
          />
        </div>
      </div>

      <Takeaway>
        Everything that follows is a consequence of one fact: the only thing the client supplies is
        a dated schedule of amounts. IRR, NAV and every trade ticket are functions of that schedule.
        So they are computed rather than stored as input, and they can always be rebuilt from it —
        which is what makes versioning, replay and audit tractable instead of heroic.
      </Takeaway>

      <Prose className="text-ink-3">
        Peak fund NAV across the five-year horizon is{" "}
        {formatMoneyCompact(HEADLINE.peakNav, FUND.baseCurrency)}, against{" "}
        {formatMoneyCompact(HEADLINE.invested, FUND.baseCurrency)} invested.
      </Prose>
    </ReportSection>
  );
}
