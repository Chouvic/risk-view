import { ReportSection } from "../ReportShell";
import { DATA } from "../lib/model";
import { Claim, PairTable, Path, Prose, Takeaway } from "../parts/ui";

/** The brief, mapped onto artifacts, so the rest of the report can be read against it. */
export function Brief() {
  return (
    <ReportSection id="brief">
      <Claim>
        The brief asks for three computations, three written parts and one implementation. This is
        where each one lives.
      </Claim>

      <PairTable
        head={["What was asked", "Where it is answered"]}
        rows={[
          [
            "Ingest projected cashflow schedules per deal — type, currency, date",
            <>
              <Path>riskview.ingestion</Path> reads CSV and Excel; every row is validated by the{" "}
              <Path>Cashflow</Path> model in <Path>schemas.py</Path>.
            </>,
          ],
          [
            "IRR, currency-level and fund-level",
            <>
              <Path>analytics/irr.py</Path> — dated NPV on actual/365, solved by bisection. Section
              05 solves it live.
            </>,
          ],
          [
            "NAV schedule per currency, with NAV(0) = 0 and NAV(final) = terminal value",
            <>
              <Path>analytics/nav.py</Path>. Both checks are asserted in <Path>tests/test_nav.py</Path>{" "}
              and demonstrated in section 05.
            </>,
          ],
          [
            "FX forwards on a 3-month rolling basis at 100% of NAV, per non-base exposure",
            <>
              <Path>analytics/hedge.py</Path>. The one interpretation call in this build is noted
              below.
            </>,
          ],
          [
            "Part 1 — schema design",
            <>
              Section 03, and <Path>docs/design.md</Path>.
            </>,
          ],
          [
            "Part 2 — pipeline design, with pseudocode",
            <>
              Section 04, and <Path>docs/design.md</Path>.
            </>,
          ],
          [
            "Part 3 — implementation with tests",
            <>
              <Path>src/riskview/</Path> and <Path>tests/</Path> — {DATA.tests.tests} tests across{" "}
              {DATA.tests.modules} modules.
            </>,
          ],
          [
            "Part 4 — trade-offs",
            <>
              Section 06, and <Path>docs/design.md</Path>.
            </>,
          ],
          [
            "Handle the intentional errors in the data",
            <>
              Validators in <Path>schemas.py</Path>. The sample file carries{" "}
              {DATA.corrections.length} defects; all {DATA.corrections.length} are repaired and
              recorded, and section 04 runs them.
            </>,
          ],
        ]}
      />

      <Takeaway>
        One interpretation call, made deliberately. The brief says hedge “100% of NAV”. On the final
        cashflow date NAV equals the terminal value, but nothing is outstanding any more — selling
        that forward would be selling currency already received. So each NAV point carries two
        numbers: <strong className="font-medium">nav</strong> for reporting, and{" "}
        <strong className="font-medium">open_exposure</strong> — the value of flows still to come —
        for sizing trades. One schedule serves both readers, and neither is subtly wrong.
      </Takeaway>

      <Prose className="text-ink-3">
        The sample file holds two funds with proportional schedules, so Fund I and Fund II share
        identical currency IRRs. That is a property of the data, not a bug; Fund I is the one the
        brief names and the one every panel here works on.
      </Prose>
    </ReportSection>
  );
}
