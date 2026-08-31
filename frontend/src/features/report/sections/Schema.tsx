import { ReportSection } from "../ReportShell";
import { EntityMap } from "../parts/EntityMap";
import { Claim, Path, Points } from "../parts/ui";

/** Part 1 — the data model, and how it is allowed to change. */
export function Schema() {
  return (
    <ReportSection id="schema">
      <Claim>One entity is supplied. Two are derived. That distinction decides the rest.</Claim>

      <Points
        items={[
          {
            point: "Cashflows are the only input",
            reason:
              "NAV schedules and hedge trades are functions of them, so they are rebuilt rather than repaired — and carry no migration risk at all.",
          },
          {
            point: "Evolution is additive, never a repurposed column",
            reason:
              "A repurposed column silently changes the meaning of every historical row. A new nullable one costs a migration and nothing else.",
          },
          {
            point: "Closed enums are the contract",
            reason: (
              <>
                Currency and cashflow type validate against a fixed set. That is what turns{" "}
                <Path>GPB</Path> into a rejected row instead of a new currency.
              </>
            ),
          },
        ]}
      />

      <EntityMap />
    </ReportSection>
  );
}
