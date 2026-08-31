/** The small set of shapes the report is written in: a claim, prose, a field table, a panel. */

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** The sentence a section argues for. One per section, before anything else. */
export function Claim({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-3xl text-[17px] leading-snug font-medium tracking-tight text-balance text-ink">
      {children}
    </p>
  );
}

export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("max-w-3xl text-sm leading-relaxed text-ink-2", className)}>{children}</p>
  );
}

/** A named sub-part of a section — the report's third heading level. */
export function Block({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold tracking-tight text-ink">{title}</h3>
        {hint ? <p className="text-sm text-ink-3">{hint}</p> : null}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** Wraps a live panel and says so, so a reader knows which figures respond to them. */
export function Panel({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold tracking-widest text-accent uppercase">
              Live
            </span>
            <h4 className="text-sm font-semibold tracking-tight text-ink">{title}</h4>
          </div>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-3">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

/** A schema entity's fields. The type column is the contract; the note is the reason. */
export function FieldTable({
  rows,
}: {
  rows: { field: string; type: string; note: ReactNode }[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-hairline">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="border-b border-hairline bg-subtle px-4 py-2 text-left text-sm font-medium text-ink-3">
              Field
            </th>
            <th className="border-b border-hairline bg-subtle px-4 py-2 text-left text-sm font-medium text-ink-3">
              Type
            </th>
            <th className="border-b border-hairline bg-subtle px-4 py-2 text-left text-sm font-medium text-ink-3">
              Why it is there
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.field}>
              <td className="border-b border-grid px-4 py-2 font-mono text-[13px] whitespace-nowrap text-ink">
                {row.field}
              </td>
              <td className="border-b border-grid px-4 py-2 font-mono text-[13px] whitespace-nowrap text-ink-3">
                {row.type}
              </td>
              <td className="border-b border-grid px-4 py-2 leading-relaxed text-ink-2">{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A two-column table for the report's many claim/where-it-lives pairs. */
export function PairTable({
  head,
  rows,
}: {
  head: [string, string];
  rows: [ReactNode, ReactNode][];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-hairline">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr>
            {head.map((label) => (
              <th
                key={label}
                className="border-b border-hairline bg-subtle px-4 py-2 text-left text-sm font-medium text-ink-3"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <td className="w-2/5 border-b border-grid px-4 py-2.5 align-top leading-relaxed text-ink">
                {row[0]}
              </td>
              <td className="border-b border-grid px-4 py-2.5 align-top leading-relaxed text-ink-2">
                {row[1]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A path into the repository. Named often enough to deserve its own mark. */
export function Path({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[12.5px] text-ink-2">
      {children}
    </code>
  );
}

export function Code({ children, label }: { children: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-hairline">
      {label ? (
        <p className="border-b border-hairline bg-subtle px-4 py-2 font-mono text-[11px] tracking-wide text-ink-3">
          {label}
        </p>
      ) : null}
      <pre className="overflow-x-auto bg-surface p-4 font-mono text-[12.5px] leading-relaxed text-ink-2">
        {children}
      </pre>
    </div>
  );
}

/** A conclusion worth separating from the argument that produced it. */
export function Takeaway({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-3xl rounded-lg border border-hairline border-l-2 border-l-ink bg-subtle px-4 py-3">
      <p className="text-sm leading-relaxed text-ink">{children}</p>
    </div>
  );
}

export function Grid({ cols = 2, children }: { cols?: 2 | 3; children: ReactNode }) {
  return (
    <div
      className={cn(
        "grid gap-4",
        cols === 2 ? "md:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {children}
    </div>
  );
}

/** A figure with its label, used in the strips that open a section. */
export function Figure({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  tone?: "good" | "warning";
}) {
  return (
    <div className="p-4">
      <p className="text-sm font-medium text-ink-3">{label}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold tracking-tight tabular-nums",
          tone === "good" ? "text-good" : tone === "warning" ? "text-warning" : "text-ink",
        )}
      >
        {value}
      </p>
      {detail ? <p className="mt-1 text-sm leading-relaxed text-ink-3">{detail}</p> : null}
    </div>
  );
}
