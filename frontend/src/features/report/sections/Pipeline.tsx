import { ReportSection } from "../ReportShell";
import { PipelineFlow } from "../parts/PipelineFlow";
import { ValidatorLab } from "../parts/ValidatorLab";
import { DATA } from "../lib/model";
import { Block, Claim, Code, PairTable, Path, Prose, Takeaway } from "../parts/ui";

const PSEUDOCODE = `on cashflow_file_uploaded(file):
    try:
        result = ingest(file)                 # read → validate; all-or-nothing
    except IngestionRejected as rejected:
        notify(supplier, rejected.rejects)    # every bad row, with its reason
        return                                # nothing stored, no analytics run

    version = store.save_batch(result.cashflows)          # immutable projection version
    for fund in funds_in(result):
        analytics = compute(fund, store.cashflows(fund, version))   # IRR → NAV → hedges, pure
        store.save_analytics(fund, version, analytics)
    store.set_current(version)                # atomic pointer swap; serving never sees partial state`;

/** Part 2 — the pipeline, its one branch, and what it does with bad data. */
export function Pipeline() {
  return (
    <ReportSection id="pipeline">
      <Claim>
        One trigger, one gate, and pure functions on the other side of it. Nothing crosses the gate
        but a whole valid batch.
      </Claim>

      <PipelineFlow />

      <Block title="Trigger and step dependencies">
        <Prose>
          The upload is the only trigger — nothing runs on a timer, because nothing changes until a
          client sends a file. A validated batch replaces that fund's projections and its analytics
          are computed from them; funds not in the file are untouched. Serving reads stored results
          and never runs the analytics engine in-request. Every step reads and writes stored
          artifacts rather than passing objects to the next call, so the same steps can later run as
          queue workers without a change to their logic.
        </Prose>
      </Block>

      <Block title="Where each piece of logic lives">
        <PairTable
          head={["Layer", "Role"]}
          rows={[
            [
              <Path>riskview.ingestion</Path>,
              "CSV and Excel readers; maps source headers onto model fields and validates each row. The only place in the system where dirty data exists.",
            ],
            [
              <Path>riskview.analytics</Path>,
              "Pure functions from cashflows to IRR, NAV and hedges. No I/O, no clock, no configuration — which is why re-running them is always safe.",
            ],
            [
              <Path>riskview.store</Path>,
              "Whole validated batches, per fund, with the derived analytics computed once and cached. In memory today, behind an interface a database slots into.",
            ],
            [
              <Path>riskview.api</Path>,
              "The ingest endpoint plus read-only views over stored results.",
            ],
            [
              <Path>riskview.schemas</Path>,
              "The shapes every layer depends on. Each layer depends only on these, so any of them can be split out later.",
            ],
          ]}
        />
      </Block>

      <Block
        title="Dirty data"
        hint="Cleaning and validation are one step, not two"
      >
        <Prose className="mb-4">
          A cleaning stage sitting in front of a model is a second place for the rules to live, and
          it will drift. So the <Path>Cashflow</Path> model does both: before-validators normalise
          the raw value, the field's own type coerces it against the closed sets, and an
          after-validator checks the invariants that span fields. Ingestion has no cleaning code of
          its own. Fix only what is unambiguous, record every fix, and reject the rest.
        </Prose>

        <ValidatorLab />

        <Prose className="mt-4">
          Date formats are a whitelist rather than a best guess, because <Path>03/04/2026</Path> is a
          different day under day-first and month-first conventions — that convention comes from the
          source contract, and guessing it wrong is worse than failing. The sample file needed{" "}
          {DATA.corrections.length} repairs: a <Path>GPB</Path> currency typo and two dates carrying
          stray whitespace and a backtick. Amount normalisation — thousands separators, currency
          symbols, parenthesised negatives — is implemented and tested, and this particular file
          happens not to exercise it.
        </Prose>
      </Block>

      <Takeaway>
        A batch is all-or-nothing, and that is a deliberate trade. IRR and NAV are computed from{" "}
        <em>all</em> of a fund's cashflows, so dropping six bad rows out of {DATA.summary.accepted}{" "}
        does not produce an incomplete answer — it produces a confident, plausible, wrong one, served
        to a client-facing app with no signal that anything is missing. Refusing the batch turns a
        silent data-quality problem into a loud one. The cost is a re-send; the supplier gets every
        failure in the file in a single response rather than one per round trip.
      </Takeaway>

      <Block title="Idempotency">
        <Prose>
          Ingestion is a pure function of the file bytes, saving a batch replaces a fund's
          projections rather than appending to them, and the analytics are deterministic. Re-running
          any step — or the whole pipeline — converges on the same result, so a retry is always safe.
          Section 06 takes this further: a content hash that distinguishes a genuinely revised
          schedule from the same schedule re-exported in different bytes.
        </Prose>
      </Block>

      <Block title="Pseudocode">
        <Code label="ingestion → analytics → serving">{PSEUDOCODE}</Code>
      </Block>
    </ReportSection>
  );
}
