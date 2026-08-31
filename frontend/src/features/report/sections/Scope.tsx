import { ReportSection } from "../ReportShell";
import { Block, Claim, PairTable, Path, Points, Prose } from "../parts/ui";

/** Assumptions and omissions, with their reasons. */
export function Scope() {
  return (
    <ReportSection id="scope">
      <Claim>Every omission is a decision. Naming them is what makes “kept it simple” mean something.</Claim>

      <Points
        items={[
          {
            point: "Each position is discounted at its own IRR",
            reason:
              "As the brief specifies. It is the valuation implied by the projection itself, and internally consistent — not a market mark.",
          },
          {
            point: "Client base amounts are taken as supplied",
            reason:
              "There is no FX rate source in this build. A rate service would replace them without touching anything above ingestion.",
          },
          {
            point: "100% coverage is a policy, not a law",
            reason:
              "It is a field on the trade. A full hedge still settles in cash while the loan does not, which is why real programmes run under it.",
          },
        ]}
      />

      <Block title="Deliberately not built">
        <PairTable
          head={["Not built", "Reason, and the seam already cut"]}
          rows={[
            [
              "Persistence",
              <>
                The store is in memory, so a restart loses the data. <Path>riskview.store</Path> is
                the only module that knows about storage, so a database goes behind it untouched.
              </>,
            ],
            [
              "Concurrency control",
              "Two simultaneous uploads for one fund are last-write-wins. Correct behaviour needs a version and a compare-and-swap — cheap once there is a database, meaningless before it.",
            ],
            [
              "Projection versioning",
              "Designed in section 06, simulated there in the browser. The natural next increment.",
            ],
            [
              "The executed-hedge ledger",
              "Needs a trade capture feed — an integration question, not a modelling one.",
            ],
            [
              "Business-day calendars, market data, auth",
              "Value dates roll month-end to month-end, so 31 Dec settles as-is. Hedge P&L needs a forward curve. Tenancy belongs at the gateway, not in pure analytics.",
            ],
          ]}
        />
      </Block>

      <Prose>
        Next, in order: persistence behind the existing store interface, then projection versioning,
        then the executed-hedge ledger. None of them requires the analytics to change — which is the
        strongest evidence the boundaries are in the right places.
      </Prose>
    </ReportSection>
  );
}
