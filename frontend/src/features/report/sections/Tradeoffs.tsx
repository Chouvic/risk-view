import { ReportSection } from "../ReportShell";
import { RevisionLab } from "../parts/RevisionLab";
import { Claim, Points } from "../parts/ui";

/** Part 4 — serving a client-facing app, and revisions against live hedges. */
export function Tradeoffs() {
  return (
    <ReportSection id="tradeoffs">
      <Claim>Compute on write, serve reads. Projections are replaceable; executed trades are not.</Claim>

      <Points
        items={[
          {
            point: "The API is a lookup, never a solve",
            reason:
              "Projections change a few times a quarter; clients read daily. Results are immutable per version, so ETag = version gives cache invalidation for free.",
          },
          {
            point: "One deployable, boundaries inside it",
            reason:
              "Every step reads and writes stored artifacts, so moving ingestion and analytics behind a queue later is a deployment change, not a rewrite.",
          },
          {
            point: "Two ledgers, not one",
            reason:
              "A revision restates the projection. The hedges already in the market are executed contracts, so it produces adjustment trades rather than a cancel-and-replace.",
          },
        ]}
      />

      <RevisionLab />
    </ReportSection>
  );
}
