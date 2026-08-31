import { ReportSection } from "../ReportShell";
import { EntityMap } from "../parts/EntityMap";
import { Block, Claim, PairTable, Path, Prose } from "../parts/ui";

/** Part 1 — the data model, and how it is allowed to change. */
export function Schema() {
  return (
    <ReportSection id="schema">
      <Claim>
        One entity is supplied by the client. Two are derived from it. Modelling that difference is
        what keeps the system honest: derived data can always be rebuilt, so it never has to be
        repaired.
      </Claim>

      <Prose>
        The cashflow is the input. The NAV schedule and the FX hedge trade are functions of it. Fund,
        Deal and Currency are the structure those three hang off — and only one of them needs a table
        today.
      </Prose>

      <EntityMap />

      <Block
        title="Schema evolution"
        hint="What is allowed to change, and what a change costs"
      >
        <PairTable
          head={["Rule", "Why"]}
          rows={[
            [
              "Additive only — new optional columns with defaults, never a repurposed one",
              "A repurposed column silently changes the meaning of every historical row. A new nullable column costs a migration and nothing else.",
            ],
            [
              "Closed enums are the contract",
              <>
                Currency and cashflow type validate against a fixed set. That is what turns{" "}
                <Path>GPB</Path> into a rejected row rather than a new currency. Adding one is a
                one-line change plus a reference-table migration.
              </>,
            ],
            [
              "Unknown cashflow types are rejected, not ignored",
              "Skipping a type the analytics do not understand does not give a partial NAV — it gives a wrong one, with no signal that anything is missing.",
            ],
            [
              "Derived entities carry no migration risk",
              "NAV schedules and hedge trades are dropped and rebuilt from the cashflows. Only the input entity ever needs careful evolution.",
            ],
            [
              "Pydantic models are the contract; storage is an implementation detail",
              "Amounts are exact decimals in the model. They can be strings in SQLite and NUMERIC in PostgreSQL without the API shape moving.",
            ],
            [
              "Deal is the known extension, designed and not pre-built",
              <>
                The sample feed has no deal identifier, so a position is a (fund, currency) pair. When
                feeds carry one: add a <Path>deals</Path> table and a nullable{" "}
                <Path>cashflows.deal_id</Path>. Old files keep loading, fund analytics are unchanged
                because they already aggregate per fund and currency, and deal-level IRR becomes the
                same computation on a finer grouping.
              </>,
            ],
          ]}
        />
      </Block>

      <Block title="Identity" hint="What makes two uploads the same upload">
        <Prose>
          The natural key for a cashflow is (fund, currency, date, type); the client's row id is kept
          for reconciliation with the source file, not as identity. At the batch level there are two
          different questions, and they need two different answers — the SHA-256 of the uploaded
          bytes says whether these exact bytes have been seen before, while a canonical hash over the
          validated, normalised rows says whether the schedule has actually changed. Section 06 shows
          why conflating them would churn analytics every time a client re-exports the same file.
        </Prose>
      </Block>
    </ReportSection>
  );
}
