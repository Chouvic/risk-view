import { ChevronLeft, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import type { FundSummary } from "@/api/types";
import { Badge } from "@/components/ui/Badge";
import { InfoLabel } from "@/components/ui/InfoLabel";
import { Segmented } from "@/components/ui/Segmented";
import { currencyColor } from "@/lib/series";
import { ALL_CURRENCIES } from "@/lib/scope";
import { pluralise } from "@/lib/format";

/** Fund identity plus the currency filter that scopes everything below it. */
export function FundHeader({
  fund,
  horizon,
  scope,
  onScopeChange,
}: {
  fund: FundSummary;
  horizon: string;
  scope: string;
  onScopeChange: (scope: string) => void;
}) {
  const options = [
    { value: ALL_CURRENCIES, label: "All" },
    ...fund.currencies.map((currency) => ({
      value: currency,
      label: currency,
      color: currencyColor(currency),
    })),
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-plane">
      <div className="px-6 pt-4">
        <Link
          to="/funds"
          className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-ink-3 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ChevronLeft size={14} />
          All funds
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-6 pt-2 pb-3">
        <h1 className="text-xl font-semibold tracking-tight">{fund.name}</h1>
        <Badge color={currencyColor(fund.base_currency)}>
          <InfoLabel metric="baseCurrency" label={`${fund.base_currency} base`} />
        </Badge>
        <Badge>
          <InfoLabel metric="cashflows" label={pluralise(fund.cashflow_count, "cashflow")} />
        </Badge>
        <Badge>
          <InfoLabel metric="horizon" label={horizon} />
        </Badge>
        {fund.source_file ? (
          <Badge className="max-w-[220px]">
            <FileText size={11} className="shrink-0 text-ink-3" />
            <span className="truncate" title={fund.source_file}>
              {fund.source_file}
            </span>
          </Badge>
        ) : null}
      </div>

      <div className="flex items-center gap-3 px-6 pb-3">
        <span className="text-xs font-medium tracking-wide text-ink-3 uppercase">Currency</span>
        <Segmented
          ariaLabel="Filter by position currency"
          options={options}
          value={scope}
          onChange={onScopeChange}
        />
      </div>
    </header>
  );
}
