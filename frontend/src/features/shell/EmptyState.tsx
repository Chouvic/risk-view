import { BadgeCheck, Calculator, ShieldCheck } from "lucide-react";
import type { IngestionReport } from "@/api/types";
import { UploadPanel } from "@/features/upload/UploadPanel";

const STEPS = [
  {
    icon: BadgeCheck,
    title: "Validate",
    body: "Rows are checked against the schema. Unambiguous defects are repaired and reported; anything else refuses the batch.",
  },
  {
    icon: Calculator,
    title: "Compute",
    body: "IRR per position currency and for the fund, then a NAV schedule discounting each currency's remaining flows.",
  },
  {
    icon: ShieldCheck,
    title: "Hedge",
    body: "Rolling three-month forwards sized to the open exposure at each cashflow date, one programme per non-base currency.",
  },
];

/** The first screen: nothing is stored yet, so the only action is to ingest a file. */
export function EmptyState({
  onIngested,
}: {
  onIngested: (report: IngestionReport, fileName: string) => void;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-6 py-16">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="size-6 rounded-md bg-ink" />
        <p className="text-[15px] font-semibold tracking-tight">RiskView</p>
      </div>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight text-ink">
        Start with a cashflow file
      </h1>
      <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-2">
        Ingest a projected cashflow schedule for fund and per-currency IRR, NAV over the fund's life,
        and a recommended FX forward programme.
      </p>

      <div className="mt-8">
        <UploadPanel onIngested={onIngested} />
      </div>

      <ol className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, body }, index) => (
          <li key={title}>
            <div className="flex items-center gap-2 text-ink">
              <Icon size={15} />
              <span className="text-sm font-semibold">
                {index + 1}. {title}
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
