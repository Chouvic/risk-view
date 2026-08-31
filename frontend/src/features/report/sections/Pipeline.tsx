import { ReportSection } from "../ReportShell";
import { PipelineFlow } from "../parts/PipelineFlow";
import { ValidatorLab } from "../parts/ValidatorLab";
import { DATA } from "../lib/model";
import { Block, Claim, PairTable, Path, Points, Prose } from "../parts/ui";

/** Part 2 — the pipeline, its one branch, and what it does with bad data. */
export function Pipeline() {
  return (
    <ReportSection id="pipeline">
      <Claim>One trigger, one gate, pure functions on the other side of it.</Claim>

      <Points
        items={[
          {
            point: "An upload is the only trigger",
            reason:
              "Nothing runs on a timer, because nothing changes until a client sends a file. Analytics run at write time; serving is a read.",
          },
          {
            point: "A batch is all-or-nothing",
            reason: `IRR and NAV use every row of a fund, so dropping bad rows does not give an incomplete answer — it gives a confident, wrong one.`,
          },
          {
            point: "Cleaning and validation are one step",
            reason:
              "The Pydantic model does both. A separate cleaning stage is a second place for the rules to live, and it will drift.",
          },
        ]}
      />

      <PipelineFlow />

      <Block title="Separation of concerns">
        <PairTable
          head={["Layer", "Role"]}
          rows={[
            [
              <Path>riskview.ingestion</Path>,
              "Readers and validation. The only place dirty data exists.",
            ],
            [
              <Path>riskview.analytics</Path>,
              "Cashflows to IRR, NAV and hedges. No I/O, no clock, no configuration.",
            ],
            [
              <Path>riskview.store</Path>,
              "Whole validated batches per fund, analytics cached. In memory today, behind an interface a database slots into.",
            ],
            [<Path>riskview.api</Path>, "The ingest endpoint plus read-only views over stored results."],
          ]}
        />
      </Block>

      <Block title="Dirty data" hint="Fix only what is unambiguous, and record every fix">
        <ValidatorLab />
        <Prose className="mt-3">
          Date formats are a whitelist, not a best guess: <Path>03/04/2026</Path> is a different day
          under day-first and month-first conventions, and that comes from the source contract. The
          sample file needed {DATA.corrections.length} repairs — one currency typo, two dates
          carrying stray characters.
        </Prose>
      </Block>

      <Block title="Idempotency">
        <Prose>
          Ingestion is a pure function of the file bytes, a batch replaces a fund's projections
          rather than appending, and the analytics are deterministic. Any retry converges. Identity
          is content rather than bytes — section 06 shows why that distinction matters.
        </Prose>
      </Block>
    </ReportSection>
  );
}
