import { useMemo } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { DATA, selfCheck } from "../lib/model";
import { cn } from "@/lib/cn";

/**
 * The report re-derives every published figure in the browser and compares it against
 * the Python output baked into `data.ts`. If the analytics change and the dataset is
 * not regenerated, this says so rather than quietly showing a stale number.
 */
export function SelfCheck() {
  const checks = useMemo(() => selfCheck(), []);
  const passing = checks.every((check) => check.ok);

  return (
    <div className="rounded-xl border border-hairline bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
        <div>
          <h4 className="text-sm font-semibold tracking-tight text-ink">
            Every figure on this page, re-derived in the browser
          </h4>
          <p className="mt-1 text-sm text-ink-3">
            {DATA.tests.tests} tests across {DATA.tests.modules} modules guard the Python. This
            checks that the page is showing what the Python actually produced.
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-medium",
            passing ? "bg-subtle text-good" : "bg-[#fdecec] text-critical",
          )}
        >
          {passing ? <Check size={14} /> : <AlertTriangle size={14} />}
          {passing ? "All agree" : "Stale dataset"}
        </span>
      </div>
      <ul className="divide-y divide-grid">
        {checks.map((check) => (
          <li key={check.label} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
            {check.ok ? (
              <Check size={14} className="shrink-0 text-good" />
            ) : (
              <AlertTriangle size={14} className="shrink-0 text-critical" />
            )}
            <span className="text-sm font-medium text-ink">{check.label}</span>
            <span className="font-mono text-[12px] text-ink-3">{check.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
