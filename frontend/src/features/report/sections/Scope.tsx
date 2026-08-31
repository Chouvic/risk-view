import { ReportSection } from "../ReportShell";
import { Block, Claim, Code, PairTable, Path, Prose, Takeaway } from "../parts/ui";

const RUN = `uv sync                             # install
uv run pytest                       # the test suite
uv run python scripts/fund_report.py    # IRRs + NAV schedules for the sample file
uv run uvicorn riskview.main:app    # the analytics API on :8000

cd frontend && npm install && npm run dev   # this UI on :5173`;

/** Assumptions, omissions and their reasons. */
export function Scope() {
  return (
    <ReportSection id="scope">
      <Claim>
        Every omission here is a decision with a reason. Naming them is what makes “I kept it
        simple” mean something.
      </Claim>

      <Block title="Assumptions">
        <PairTable
          head={["Assumption", "Why, and what it costs"]}
          rows={[
            [
              "The client's base amounts are taken as given",
              "There is no FX rate source in this build, so the fund-level IRR is solved on the base amounts as supplied. A rate service would replace them and change nothing above the ingestion layer.",
            ],
            [
              "Each position is discounted at its own IRR",
              "As the brief specifies. This makes the schedule internally consistent — it is the valuation implied by the projection itself, which is exactly why NAV(0) = 0 is a check rather than a coincidence. It is not a market mark.",
            ],
            [
              "A position is a (fund, currency) pair",
              "The sample feed carries no deal identifier. The migration to real deals is designed in section 03 rather than pre-built against a schema nobody has sent yet.",
            ],
            [
              "actual/365, calendar month-end rolls",
              "30 Sep + 3m settles 31 Dec. A real desk would roll that to the next business day against a holiday calendar; that is a calendar dependency, not a change to the model.",
            ],
            [
              "Coverage is 100%",
              "The brief's policy. It is a field on the trade rather than a constant, so moving to 80% is a data change.",
            ],
          ]}
        />
      </Block>

      <Block title="What a treasurer would say about 100%">
        <Prose>
          A correctly working 100% hedge programme still has a cash problem. Forwards settle in cash
          on their value date; the loan behind them does not. If the currency moves against the
          hedge, the fund pays out on a contract while the asset it protects is illiquid and years
          from repayment. That is why real programmes run under full coverage and hold credit lines
          against the difference. The engine here is right to produce 100% because that is the
          policy it was given — the point is that the policy belongs in data, and someone has to
          fund the margin.
        </Prose>
      </Block>

      <Block title="Deliberately not built">
        <PairTable
          head={["Not built", "Reason, and the seam that is already cut"]}
          rows={[
            [
              "Persistence",
              <>
                The store is in memory, so a restart loses the data. This is the first thing I would
                finish: <Path>riskview.store</Path> is already the only module that knows about
                storage, so a database goes behind it without touching the analytics.
              </>,
            ],
            [
              "Concurrency control",
              "Single process, and two simultaneous uploads for one fund are last-write-wins. Correct behaviour needs a version and a compare-and-swap on the pointer — cheap once there is a database, meaningless before it.",
            ],
            [
              "Projection versioning and diff",
              "Designed in section 06 and not implemented on this branch. It is the natural next increment, and it is what makes the revision workflow real rather than illustrative.",
            ],
            [
              "The executed-hedge ledger",
              "Section 06 simulates it in the browser. Building it needs a trade capture feed, which is an integration question rather than a modelling one.",
            ],
            [
              "Market data and mark-to-market",
              "No forward curve, so hedge P&L is out of scope. The trades produced are recommendations, sized from exposure.",
            ],
            [
              "Auth, tenancy and rate limits",
              "Gateway concerns. Putting them in the analytics would make the analytics impure for no benefit.",
            ],
          ]}
        />
      </Block>

      <Block title="Running it">
        <Code label="from the repository root">{RUN}</Code>
        <Prose className="mt-3">
          The API starts empty, so post a file first:{" "}
          <Path>curl -F file=@samples/cashflows.csv localhost:8000/ingest</Path>. The design document
          for Parts 1, 2 and 4 is <Path>docs/design.md</Path>; this page is the walkthrough of it.
        </Prose>
      </Block>

      <Takeaway>
        What I would build next, in order: persistence behind the existing store interface, then
        projection versioning with the content hash, then the executed-hedge ledger and adjustment
        trades. Each one is a self-contained increment, and none of them requires the analytics to
        change — which is the strongest evidence that the boundaries are in the right places.
      </Takeaway>
    </ReportSection>
  );
}
