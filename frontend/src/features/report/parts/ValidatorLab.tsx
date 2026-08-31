import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Wrench } from "lucide-react";
import { DATA } from "../lib/model";
import { validateRow, type RawRow } from "../lib/validate";
import { Panel } from "./ui";
import { cn } from "@/lib/cn";

/**
 * The ingestion policy, run rather than described: fix what is unambiguous and record
 * the fix; reject everything else and quote the offending value back.
 *
 * Presets marked "in the file" are the real defects in samples/cashflows.csv. The rest
 * are the failure paths the model covers that this particular file does not exercise.
 */

const COLUMNS: (keyof RawRow)[] = [
  "id",
  "fund_name",
  "cashflow_date",
  "cashflow_type",
  "currency",
  "amount_local",
  "amount_base",
  "base_currency",
];

const LABELS: Record<keyof RawRow, string> = {
  id: "ID",
  fund_name: "Fund Name",
  cashflow_date: "Date",
  cashflow_type: "Cashflow Type",
  currency: "Local Currency",
  amount_local: "Amount Local",
  amount_base: "Amount Base",
  base_currency: "Base Currency",
};

/** Splits a raw line of the sample file into the model's fields, in file order. */
function parseLine(line: string): RawRow {
  const cells = line.split(",");
  return {
    id: cells[0] ?? "",
    fund_name: cells[1] ?? "",
    cashflow_date: cells[2] ?? "",
    cashflow_type: cells[3] ?? "",
    currency: cells[4] ?? "",
    amount_local: cells[5] ?? "",
    amount_base: cells[6] ?? "",
    base_currency: cells[7] ?? "",
  };
}

const ROWS = DATA.rawRows.map(parseLine);
const byId = (id: string) => ROWS.find((row) => row.id === id) ?? ROWS[0];

interface Preset {
  key: string;
  label: string;
  real: boolean;
  row: RawRow;
}

const PRESETS: Preset[] = [
  { key: "clean", label: "A clean row", real: true, row: byId("2") },
  { key: "typo", label: "Currency typo", real: true, row: byId("17") },
  { key: "junk", label: "Stray characters", real: true, row: byId("51") },
  {
    key: "money",
    label: "Formatted amount",
    real: false,
    row: { ...byId("2"), amount_local: "£2,500,000.00" },
  },
  {
    key: "unknown",
    label: "Unknown currency",
    real: false,
    row: { ...byId("2"), currency: "XZY" },
  },
  {
    key: "date",
    label: "Unreadable date",
    real: false,
    row: { ...byId("2"), cashflow_date: "Sept 30, 2030" },
  },
  {
    key: "sign",
    label: "Sign contradicts type",
    real: false,
    row: { ...byId("2"), amount_local: "-2500000" },
  },
];

export function ValidatorLab() {
  const [preset, setPreset] = useState<Preset>(PRESETS[1]);
  const [row, setRow] = useState<RawRow>(PRESETS[1].row);

  const verdict = useMemo(() => validateRow(row), [row]);

  function choose(next: Preset) {
    setPreset(next);
    setRow(next.row);
  }

  return (
    <Panel
      title="Validator"
      description="Pick a row or edit any cell. The rules are the ones in schemas.py, in the same order: scrub, coerce against the closed sets, then check the invariants that span fields."
      actions={
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-medium",
            verdict.accepted
              ? verdict.corrections.length > 0
                ? "bg-accent-soft text-accent"
                : "bg-subtle text-good"
              : "bg-[#fdecec] text-critical",
          )}
        >
          {verdict.accepted ? (
            verdict.corrections.length > 0 ? (
              <Wrench size={14} />
            ) : (
              <Check size={14} />
            )
          ) : (
            <AlertTriangle size={14} />
          )}
          {verdict.accepted
            ? verdict.corrections.length > 0
              ? "Accepted with corrections"
              : "Accepted"
            : "Rejected — batch refused"}
        </span>
      }
    >
      <div className="flex flex-wrap gap-1.5 border-b border-hairline px-5 py-3">
        {PRESETS.map((option) => (
          <button
            key={option.key}
            onClick={() => choose(option)}
            aria-pressed={option.key === preset.key}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-sm transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
              option.key === preset.key
                ? "border-ink bg-ink text-white"
                : "border-hairline bg-surface text-ink-2 hover:bg-subtle",
            )}
          >
            {option.label}
            {option.real ? (
              <span
                className={cn(
                  "ml-1.5 text-[10px] tracking-wide uppercase",
                  option.key === preset.key ? "text-white/60" : "text-ink-3",
                )}
              >
                in the file
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-hairline">
        <div className="p-5">
          <p className="text-[11px] font-semibold tracking-widest text-ink-3 uppercase">
            As supplied
          </p>
          <div className="mt-3 space-y-1.5">
            {COLUMNS.map((column) => (
              <label key={column} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm text-ink-3">{LABELS[column]}</span>
                <input
                  value={row[column]}
                  onChange={(event) => setRow({ ...row, [column]: event.target.value })}
                  spellCheck={false}
                  className={cn(
                    "min-w-0 flex-1 rounded-md border bg-surface px-2 py-1 font-mono text-[12.5px] text-ink",
                    "focus:outline-2 focus:-outline-offset-1 focus:outline-accent",
                    row[column] !== verdict.cleaned[column] && verdict.cleaned[column] !== undefined
                      ? "border-accent/50"
                      : "border-hairline",
                  )}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="p-5">
          <p className="text-[11px] font-semibold tracking-widest text-ink-3 uppercase">
            What the model did
          </p>

          {verdict.corrections.length === 0 && verdict.errors.length === 0 ? (
            <p className="mt-3 text-sm leading-relaxed text-ink-2">
              Nothing to fix. The row is stored as supplied, and the ingestion report counts it
              as accepted rather than corrected.
            </p>
          ) : null}

          {verdict.corrections.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {verdict.corrections.map((correction) => (
                <li key={correction} className="flex gap-2.5">
                  <Wrench size={14} className="mt-0.5 shrink-0 text-accent" />
                  <p className="font-mono text-[12px] leading-relaxed break-words text-ink-2">
                    {correction}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}

          {verdict.errors.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {verdict.errors.map((error) => (
                <li key={error} className="flex gap-2.5">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-critical" />
                  <p className="font-mono text-[12px] leading-relaxed break-words text-ink-2">
                    {error}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}

          {verdict.accepted ? (
            <div className="mt-4 rounded-lg border border-hairline bg-subtle p-3">
              <p className="text-[11px] font-semibold tracking-widest text-ink-3 uppercase">
                Stored
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] text-ink">
                <span>{verdict.cleaned.cashflow_date}</span>
                <ArrowRight size={12} className="text-ink-3" />
                <span>{verdict.cleaned.cashflow_type}</span>
                <ArrowRight size={12} className="text-ink-3" />
                <span>
                  {verdict.cleaned.currency} {verdict.cleaned.amount_local}
                </span>
                <ArrowRight size={12} className="text-ink-3" />
                <span className="text-ink-3">
                  {verdict.cleaned.base_currency} {verdict.cleaned.amount_base}
                </span>
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm leading-relaxed text-ink-3">
              One rejected row refuses the whole batch. Nothing is stored, no analytics run, and
              the supplier gets every failure in the file in a single response.
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}
