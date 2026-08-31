import { CirclePlus, Equal, GitCommitVertical } from "lucide-react";
import type { FundVersionOutcome, VersionAction } from "@/api/types";
import { cn } from "@/lib/cn";

const ACTIONS: Record<
  VersionAction,
  { icon: typeof CirclePlus; tone: string; label: string; detail: (version: number) => string }
> = {
  new: {
    icon: CirclePlus,
    tone: "text-good",
    label: "New",
    detail: (version) => `first projection · v${version}`,
  },
  revised: {
    icon: GitCommitVertical,
    tone: "text-accent",
    label: "Revised",
    detail: (version) => `schedule changed · v${version} minted`,
  },
  unchanged: {
    icon: Equal,
    tone: "text-ink-3",
    label: "Unchanged",
    detail: (version) => `same schedule · still v${version}`,
  },
};

/**
 * What the upload did per fund. The distinction that matters is `unchanged`: a
 * file can be accepted in full and still mint nothing, because change is detected
 * on content rather than bytes.
 */
export function FundOutcomes({ funds }: { funds: FundVersionOutcome[] }) {
  if (funds.length === 0) return null;

  return (
    <ul className="divide-y divide-hairline">
      {funds.map((fund) => {
        const { icon: Icon, tone, label, detail } = ACTIONS[fund.action];
        return (
          <li key={fund.fund_id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-5 py-2.5">
            <Icon size={15} className={cn("shrink-0", tone)} />
            <span className="text-sm font-medium text-ink">{fund.fund_name}</span>
            <span className={cn("text-sm font-medium", tone)}>{label}</span>
            <span className="text-sm text-ink-3">{detail(fund.version_no)}</span>
          </li>
        );
      })}
    </ul>
  );
}
