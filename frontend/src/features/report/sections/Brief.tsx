import { ReportSection } from "../ReportShell";
import { DATA } from "../lib/model";
import { Claim, PairTable, Path } from "../parts/ui";

/** The brief, mapped onto artifacts. */
export function Brief() {
  return (
    <ReportSection id="brief">
      <Claim>
        Three calculations to build and three questions to answer in writing. This is the map
        between the brief and the work, so the rest of this can be read alongside it.
      </Claim>

      <PairTable
        head={["What was asked", "Where it is answered"]}
        rows={[
          [
            "Ingest projected cashflows — type, currency, date",
            <>
              <Path>riskview.ingestion</Path>, validated by the <Path>Cashflow</Path> model.
            </>,
          ],
          [
            "IRR, currency-level and fund-level",
            <>
              <Path>analytics/irr.py</Path> — section 05.
            </>,
          ],
          [
            "NAV schedule per currency, NAV(0) = 0 and NAV(final) = terminal value",
            <>
              <Path>analytics/nav.py</Path> — both checks demonstrated in section 05.
            </>,
          ],
          [
            "FX forwards, 3-month rolling, 100% of NAV, non-base only",
            <>
              <Path>analytics/hedge.py</Path> — section 05. Sized on open exposure rather than NAV;
              that reading is argued there.
            </>,
          ],
          ["Parts 1, 2 and 4 — written", "Sections 03, 04 and 06, and docs/design.md."],
          [
            "Part 3 — implementation with tests",
            <>
              <Path>src/riskview/</Path> and <Path>tests/</Path> — {DATA.tests.tests} tests,{" "}
              {DATA.tests.modules} modules.
            </>,
          ],
          [
            "The intentional errors in the data",
            <>
              {DATA.corrections.length} defects found, all repaired and recorded — section 04 runs
              them.
            </>,
          ],
        ]}
      />
    </ReportSection>
  );
}
