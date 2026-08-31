import type { ReactNode } from "react";
import { InfoLabel } from "./InfoLabel";
import type { GlossaryKey } from "@/lib/glossary";

/** The one figure a view leads with. Exactly one per page. */
export function HeroStat({
  metric,
  label,
  value,
  detail,
}: {
  metric: GlossaryKey;
  label?: string;
  value: string;
  detail?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 p-5">
      <p className="text-sm font-medium text-ink-3">
        <InfoLabel metric={metric} label={label} />
      </p>
      <div>
        <p className="text-5xl leading-none font-semibold tracking-tight text-ink">{value}</p>
        {detail ? <p className="mt-2 text-sm text-ink-3">{detail}</p> : null}
      </div>
    </div>
  );
}

/** A supporting figure. Sits beside the hero, or in a row of its own. */
export function Stat({
  metric,
  label,
  value,
  detail,
}: {
  metric: GlossaryKey;
  label?: string;
  value: string;
  detail?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 p-5">
      <p className="text-sm font-medium text-ink-3">
        <InfoLabel metric={metric} label={label} />
      </p>
      <div>
        <p className="text-2xl font-semibold tracking-tight text-ink tabular-nums">{value}</p>
        {detail ? <p className="mt-1 text-sm text-ink-3">{detail}</p> : null}
      </div>
    </div>
  );
}
