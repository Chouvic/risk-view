import { ReportSection } from "../ReportShell";
import { RevisionLab } from "../parts/RevisionLab";
import { Block, Claim, PairTable, Path, Prose, Takeaway } from "../parts/ui";

/** Part 4 — serving a client-facing app, and revisions against live hedges. */
export function Tradeoffs() {
  return (
    <ReportSection id="tradeoffs">
      <Claim>
        Compute on write, serve reads. Projections are versioned and replaceable; executed trades
        are facts and never change.
      </Claim>

      <Block title="Serving analytics to a client-facing web application">
        <Prose className="mb-4">
          The access pattern decides the architecture. Projections change a few times a quarter;
          clients read daily. So analytics run at write time and the API stays a stateless read layer
          over stored results — a client-facing read is a lookup, never a solve.
        </Prose>
        <PairTable
          head={["Decision", "Reasoning"]}
          rows={[
            [
              "Analytics at write time, not in the request",
              "The read path has no failure mode of its own, and a slow position cannot make a page slow. Recomputation is free because the analytics are pure.",
            ],
            [
              "Results immutable per projection version",
              <>
                <Path>ETag = version</Path> gives correct cache invalidation for nothing. A client
                that has the current version gets a 304.
              </>,
            ],
            [
              "One deployable, module boundaries inside it",
              "Ingestion, analytics, storage and serving already depend only on the shared schemas. Splitting them into services now would buy the same separation at much higher cost — and I would rather pay that when volume, not architecture diagrams, demands it.",
            ],
            [
              "The queue is the next step, not this one",
              "Every step reads and writes stored artifacts, so moving ingestion and analytics behind a worker is a deployment change rather than a rewrite.",
            ],
            [
              "Auth and per-fund tenancy at the gateway",
              "A fund is the natural tenancy boundary, and no analytic crosses it. Keeping that check out of the analytics keeps them pure.",
            ],
            [
              "Storage behind a repository interface",
              <>
                In memory today; the same interface takes SQLite or PostgreSQL with no change above{" "}
                <Path>riskview.store</Path>. That seam is cut, and it is the first thing I would
                finish.
              </>,
            ],
          ]}
        />
      </Block>

      <Block title="Projections revised mid-quarter, hedges already in flight">
        <Prose className="mb-4">
          This is the question the design has to answer honestly, because it is where a naive system
          does damage. A revision is a full restatement of a fund's schedule, and the hedges already
          in the market are not a projection — they are executed contracts. Two ledgers: one
          replaceable, one append-only.
        </Prose>

        <RevisionLab />
      </Block>

      <Takeaway>
        The trap is cancel-and-replace. Re-deriving the target book and unwinding everything that
        differs is simple to implement, pays spread twice on every roll, and leaves an audit trail
        nobody can follow. Comparing the new target against the live book and trading only the
        difference — with a tolerance band so a rounding difference waits for the next scheduled roll
        — is the same answer for less money and a cleaner record of why every trade exists.
      </Takeaway>
    </ReportSection>
  );
}
