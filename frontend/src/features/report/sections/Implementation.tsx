import { ReportSection } from "../ReportShell";
import { HedgeBuilder } from "../parts/HedgeBuilder";
import { IrrSolver } from "../parts/IrrSolver";
import { NavExplorer } from "../parts/NavExplorer";
import { SelfCheck } from "../parts/SelfCheck";
import { DATA } from "../lib/model";
import { Block, Claim, Code, PairTable, Path, Prose, Takeaway } from "../parts/ui";

const NAV_CODE = `def _pv_at(t, rate, flows, include_on_date):
    pv = sum(
        cf / (1.0 + rate) ** ((d - t).days / DAYS_PER_YEAR)
        for d, cf in flows
        if d > t or (include_on_date and d == t)
    )
    return Decimal(pv).quantize(Decimal("0.01"))`;

/** Part 3 — the code, and the three calculations it exists to perform. */
export function Implementation() {
  return (
    <ReportSection id="implementation">
      <Claim>
        Four small analytics modules, no numerical dependencies, and every number reproducible by
        hand. The three panels below run the real arithmetic in the browser.
      </Claim>

      <Block title="What is where">
        <PairTable
          head={["Module", "What it does"]}
          rows={[
            [
              <Path>schemas.py</Path>,
              "Every Pydantic model: the domain entities, the cleaning and validation rules, the ingestion report and the API responses.",
            ],
            [
              <Path>analytics/irr.py</Path>,
              "Dated NPV and IRR on actual/365, solved by bisection. Generic over any dated amount column — it knows nothing about funds.",
            ],
            [
              <Path>analytics/nav.py</Path>,
              "The NAV schedule: for each cashflow date, the PV of what remains, twice — once including that day's flow and once excluding it.",
            ],
            [
              <Path>analytics/hedge.py</Path>,
              "Rolling three-month forwards against each non-base exposure, with month-end roll arithmetic.",
            ],
            [
              <Path>analytics/service.py</Path>,
              "Composes one fund's analytics from its validated cashflows. A pure function, so recomputation is always safe.",
            ],
          ]}
        />
        <Prose className="mt-3">
          No SciPy, no pandas, no dateutil. The whole numerical surface is one bisection and one
          discounting loop — small enough that a reviewer can check it, and one fewer dependency to
          pin, audit and upgrade for a service whose hot path is a hundred rows.
        </Prose>
      </Block>

      <Block title="IRR — currency level and fund level">
        <IrrSolver />
      </Block>

      <Block title="NAV schedule — the same discounting, from a moving vantage point">
        <NavExplorer />
        <div className="mt-4">
          <Code label="analytics/nav.py — the whole computation">{NAV_CODE}</Code>
        </div>
        <Prose className="mt-3">
          One flag separates the two numbers the brief needs. <Path>include_on_date=True</Path> gives
          NAV — what the position is worth standing at that date. <Path>False</Path> gives the open
          exposure — what is still to come, and therefore what a forward must cover. Computing both
          in one pass is what stops the reporting view and the trading view from drifting apart.
        </Prose>
      </Block>

      <Block title="Hedges — from exposure to a trade ticket">
        <HedgeBuilder />
      </Block>

      <Block title="How I know the numbers are right">
        <Prose className="mb-4">
          Two kinds of test, doing two different jobs. Invariants hold for any input — NAV(0) = 0,
          NAV at the final date equals the terminal value, discounting the whole schedule at its own
          IRR gives zero, a hedge is never struck against the base currency, and no ticket is written
          once exposure reaches zero. Golden numbers pin the specific answers for the sample file, so
          an accidental change to a convention shows up as a failing test rather than a slightly
          different chart.
        </Prose>
        <SelfCheck />
        <Prose className="mt-4">
          The panels above are not a recording. They re-solve the IRR and re-discount every point
          from the raw cashflows, so the figures on this page and the figures the API serves are
          checked against each other every time it loads.
        </Prose>
      </Block>

      <Takeaway>
        {DATA.summary.accepted} rows in, {DATA.summary.corrected} repaired and reported,{" "}
        {DATA.tests.tests} tests across {DATA.tests.modules} modules, and no number on this page
        typed by hand — <Path>scripts/build_report_data.py</Path> generates the dataset by running
        the real pipeline.
      </Takeaway>
    </ReportSection>
  );
}
