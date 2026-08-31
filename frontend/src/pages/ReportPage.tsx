import { PageTitle } from "@/features/shell/PageTitle";
import { ReportShell } from "@/features/report/ReportShell";
import { Problem } from "@/features/report/sections/Problem";
import { Brief } from "@/features/report/sections/Brief";
import { Schema } from "@/features/report/sections/Schema";
import { Pipeline } from "@/features/report/sections/Pipeline";
import { Implementation } from "@/features/report/sections/Implementation";
import { Tradeoffs } from "@/features/report/sections/Tradeoffs";
import { Scope } from "@/features/report/sections/Scope";

/**
 * The case study walkthrough, in the brief's own order: the problem, then Parts 1 to 4,
 * then what is deliberately missing.
 *
 * Static by design — it reads a dataset generated from the real pipeline rather than
 * calling the API, so it presents identically whether or not a backend is running.
 */
export function ReportPage() {
  return (
    <>
      <PageTitle
        title="Case study report"
        description="Fund-level risk analytics and hedge recommendations — the design, the data and the code, walked through in the order the brief asks for them."
      />
      <ReportShell>
        <Problem />
        <Brief />
        <Schema />
        <Pipeline />
        <Implementation />
        <Tradeoffs />
        <Scope />
      </ReportShell>
    </>
  );
}
