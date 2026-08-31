import { useMemo } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { DATA, selfCheck } from "../lib/model";

/**
 * One line, because the claim is small and the consequence of it being false is not:
 * every figure on this page is re-derived in the browser and compared against the
 * Python output. A stale dataset shows up here instead of as a quietly wrong number.
 */
export function SelfCheck() {
  const checks = useMemo(() => selfCheck(), []);
  const failed = checks.filter((check) => !check.ok);

  return (
    <p className="flex items-start gap-2 text-sm leading-relaxed text-ink-2">
      {failed.length === 0 ? (
        <Check size={15} className="mt-0.5 shrink-0 text-good" />
      ) : (
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-critical" />
      )}
      {failed.length === 0 ? (
        <>
          {DATA.tests.tests} tests across {DATA.tests.modules} modules guard the Python. This page
          also re-solves every IRR and re-discounts every NAV point in the browser and compares
          them against that output. They agree.
        </>
      ) : (
        <>
          {failed.length} of {checks.length} checks disagree with the Python output — regenerate{" "}
          <code className="font-mono text-[12.5px]">data.ts</code>.
        </>
      )}
    </p>
  );
}
