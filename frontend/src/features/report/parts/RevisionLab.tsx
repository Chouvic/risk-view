import { useMemo, useState } from "react";
import { formatDate, formatMoney, formatMoneyCompact } from "@/lib/format";
import { pvAt, toCents, xirr, type Flow } from "../lib/finance";
import { irrFor, localFlows, scheduleFor } from "../lib/model";
import { Panel } from "./ui";
import { cn } from "@/lib/cn";

/**
 * A revision arriving mid-quarter, against a hedge book already in the market.
 *
 * The projection half of this is what the platform stores; the executed-hedge ledger is
 * design, so this panel simulates it — the revised schedule is re-solved in the browser
 * from the real Fund I GBP flows and compared roll by roll against the live book.
 */

const CURRENCY = "GBP" as const;
const TOLERANCE = 0.02;

interface Scenario {
  key: string;
  label: string;
  headline: string;
  apply: (flows: Flow[]) => Flow[];
}

const SCENARIOS: Scenario[] = [
  {
    key: "reexport",
    label: "Re-export, no change",
    headline:
      "The client re-sends the same schedule from a different system: reordered rows, renumbered ids, a CSV saved as Excel.",
    apply: (flows) => [...flows].reverse(),
  },
  {
    key: "early",
    label: "Principal repaid a year early",
    headline:
      "The borrower refinances. Principal returns in September 2029 and the last four coupons never arrive.",
    apply: (flows) => {
      const cutoff = "2029-09-30";
      const principal = Math.abs(flows[0].amount);
      return [
        ...flows.filter((f) => f.date <= cutoff && f.amount < 0),
        ...flows.filter((f) => f.date <= cutoff && f.amount > 0 && f.amount < principal),
        { date: cutoff, amount: principal },
      ];
    },
  },
  {
    key: "coupon",
    label: "Coupon reset lower",
    headline:
      "A rate reset cuts the coupon by 30% from September 2027. The horizon is unchanged; every remaining exposure is smaller.",
    apply: (flows) => {
      const principal = Math.abs(flows[0].amount);
      return flows.map((f) =>
        f.date >= "2027-09-30" && f.amount > 0 && f.amount < principal
          ? { ...f, amount: f.amount * 0.7 }
          : f,
      );
    },
  },
];

export function RevisionLab() {
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[1]);

  const original = useMemo(() => localFlows(CURRENCY), []);
  const revised = useMemo(() => scenario.apply(original), [scenario, original]);

  /**
   * Identity is content, not bytes. A canonical hash over the validated, normalised rows
   * is what decides whether a version is minted, so a re-export mints nothing.
   */
  const contentHash = (flows: Flow[]) =>
    JSON.stringify(
      [...flows]
        .map((f) => `${f.date}|${f.amount.toFixed(2)}`)
        .sort((a, b) => a.localeCompare(b)),
    );
  const changed = contentHash(original) !== contentHash(revised);

  const revisedIrr = useMemo(() => (changed ? xirr(revised).rate : irrFor(CURRENCY)), [revised, changed]);
  const originalIrr = irrFor(CURRENCY);
  const schedule = scheduleFor(CURRENCY);

  const rolls = useMemo(() => {
    return schedule.points
      .map((point) => {
        const before = Number(point.open);
        const after = changed ? toCents(pvAt(point.date, revisedIrr, revised, false)) : before;
        const delta = after - before;
        const band = Math.abs(before) * TOLERANCE;
        const action =
          before === 0 && after === 0
            ? "none"
            : Math.abs(delta) <= band
              ? "hold"
              : after === 0
                ? "unwind"
                : delta < 0
                  ? "reduce"
                  : "top up";
        return { date: point.date, before, after, delta, action };
      })
      .filter((roll) => roll.action !== "none");
  }, [schedule, revised, revisedIrr, changed]);

  const adjusted = rolls.filter((roll) => roll.action !== "hold");
  const unwound = rolls.filter((roll) => roll.action === "unwind");
  // Each roll is its own contract, so signed deltas do not net against one another:
  // what the revision actually costs is the notional that has to be traded.
  const toTrade = adjusted.reduce((sum, roll) => sum + Math.abs(roll.delta), 0);

  return (
    <Panel
      title="Revision against a live hedge book"
      description="Projections are versioned and replaceable. Executed hedges are facts. A revision therefore produces adjustment trades, not a cancel-and-replace."
      actions={
        <div className="flex flex-wrap gap-1.5">
          {SCENARIOS.map((option) => (
            <button
              key={option.key}
              onClick={() => setScenario(option)}
              aria-pressed={option.key === scenario.key}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-sm transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                option.key === scenario.key
                  ? "border-ink bg-ink text-white"
                  : "border-hairline bg-surface text-ink-2 hover:bg-subtle",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="border-b border-hairline px-5 py-4">
        <p className="max-w-3xl text-sm leading-relaxed text-ink-2">{scenario.headline}</p>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Figure
            label="Version minted"
            value={changed ? "yes — v2" : "no"}
            detail={changed ? "content hash moved" : "same content, new bytes"}
            tone={changed ? undefined : "good"}
          />
          <Figure
            label={`${CURRENCY} IRR`}
            value={`${(revisedIrr * 100).toFixed(2)}%`}
            detail={
              changed
                ? `${((revisedIrr - originalIrr) * 10_000 >= 0 ? "+" : "") + Math.round((revisedIrr - originalIrr) * 10_000)} bps`
                : "unchanged"
            }
          />
          <Figure
            label="Rolls to adjust"
            value={`${adjusted.length} of ${rolls.length}`}
            detail={unwound.length > 0 ? `${unwound.length} unwound in full` : "within tolerance elsewhere"}
          />
          <Figure
            label="Notional to trade"
            value={formatMoneyCompact(toTrade, CURRENCY)}
            detail={toTrade > 0 ? "across the adjusting rolls" : "nothing to do"}
            tone={toTrade > 0 ? "warning" : "good"}
          />
        </div>
      </div>

      {changed ? (
        <div className="p-5">
          <div className="max-h-72 overflow-auto rounded-lg border border-hairline">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead>
                <tr>
                  {["Roll date", "In the market", "New target", "Delta", "Action"].map((label, i) => (
                    <th
                      key={label}
                      className={cn(
                        "sticky top-0 z-10 border-b border-hairline bg-subtle px-4 py-2 text-sm font-medium text-ink-3",
                        i >= 1 && i <= 3 ? "text-right" : "text-left",
                      )}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rolls.map((roll) => (
                  <tr key={roll.date}>
                    <td className="border-b border-grid px-4 py-1.5 whitespace-nowrap text-ink-2">
                      {formatDate(roll.date)}
                    </td>
                    <td className="border-b border-grid px-4 py-1.5 text-right tabular-nums text-ink-3">
                      {formatMoney(roll.before, CURRENCY)}
                    </td>
                    <td className="border-b border-grid px-4 py-1.5 text-right tabular-nums text-ink">
                      {formatMoney(roll.after, CURRENCY)}
                    </td>
                    <td
                      className={cn(
                        "border-b border-grid px-4 py-1.5 text-right tabular-nums",
                        roll.action === "hold" ? "text-ink-3" : roll.delta < 0 ? "text-critical" : "text-good",
                      )}
                    >
                      {roll.delta > 0 ? "+" : ""}
                      {formatMoney(roll.delta, CURRENCY)}
                    </td>
                    <td className="border-b border-grid px-4 py-1.5">
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-xs font-medium",
                          roll.action === "hold"
                            ? "bg-subtle text-ink-3"
                            : roll.action === "unwind"
                              ? "bg-[#fdecec] text-critical"
                              : roll.action === "reduce"
                                ? "bg-subtle text-ink-2"
                                : "bg-accent-soft text-accent",
                        )}
                      >
                        {roll.action}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink-2">
            Adjustment rather than cancel-and-replace: the executed forward stays on the book and a
            second, smaller trade moves the position to the new target. That keeps transaction costs
            down and leaves an audit trail that reads in order. Anything inside a{" "}
            {(TOLERANCE * 100).toFixed(0)}% band waits for the next scheduled roll rather than
            paying spread to correct a rounding difference, and every recommendation records the
            projection version it came from.
          </p>
        </div>
      ) : (
        <div className="p-5">
          <p className="max-w-3xl text-sm leading-relaxed text-ink-2">
            Nothing happens, and that is the point. The submission is recorded — it is a fact that
            the client sent a file — but the canonical content hash is unchanged, so no version is
            minted, no analytics run and no trade is recommended. Byte-identical retries short-circuit
            even earlier, on the batch SHA-256. Two hashes, two different jobs: one answers "have I
            seen these exact bytes?", the other answers "is this actually a different schedule?".
          </p>
        </div>
      )}
    </Panel>
  );
}

function Figure({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "good" | "warning";
}) {
  return (
    <div>
      <p className="text-sm text-ink-3">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          tone === "good" ? "text-good" : tone === "warning" ? "text-warning" : "text-ink",
        )}
      >
        {value}
      </p>
      {detail ? <p className="mt-0.5 text-sm text-ink-3">{detail}</p> : null}
    </div>
  );
}
