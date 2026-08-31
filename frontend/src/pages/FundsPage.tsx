import { useMemo } from "react";
import { ChevronRight, FileText, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fetchFundIrrs } from "@/api/client";
import type { FundIrr, FundSummary } from "@/api/types";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InfoDot } from "@/components/ui/InfoLabel";
import { SortTh, Table, Td, Th } from "@/components/ui/Table";
import { PageTitle } from "@/features/shell/PageTitle";
import { useAsyncResource } from "@/hooks/useAsyncResource";
import { useSort } from "@/hooks/useSort";
import { sortRows } from "@/lib/sorting";
import { formatPercent, pluralise } from "@/lib/format";
import { currencyColor } from "@/lib/series";

type Column = "name" | "base" | "irr" | "cashflows" | "source";

/** The landing page: every fund the API holds, with enough on each row to choose one. */
export function FundsPage({ funds }: { funds: FundSummary[] }) {
  const navigate = useNavigate();
  const load = useMemo(
    () => (funds.length ? (signal: AbortSignal) => fetchFundIrrs(funds, signal) : null),
    [funds],
  );
  const irrs = useAsyncResource<FundIrr[]>(load);
  const irrByFund = new Map((irrs.data ?? []).map((entry) => [entry.fund_id, entry.fund_irr]));

  const { sort, toggle } = useSort<Column>("name");
  const rows = sortRows(funds, sort, (fund, column) => {
    switch (column) {
      case "name":
        return fund.name;
      case "base":
        return fund.base_currency;
      case "irr":
        return irrByFund.get(fund.fund_id) ?? -Infinity;
      case "cashflows":
        return fund.cashflow_count;
      case "source":
        return fund.source_file ?? "";
    }
  });

  return (
    <>
      <PageTitle
        title="Funds"
        description="Open a fund for its returns, NAV schedule and hedge programme."
        actions={
          <ButtonLink to="/data" variant="primary">
            <Upload size={14} />
            Upload cashflows
          </ButtonLink>
        }
      />

      <div className="p-6">
        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <SortTh column="name" sort={sort} onSort={toggle} className="w-full">
                  Fund
                </SortTh>
                <SortTh column="base" sort={sort} onSort={toggle} metric="baseCurrency">
                  Base
                </SortTh>
                <Th>
                  <span className="inline-flex items-center gap-1.5">
                    Positions
                    <InfoDot metric="positionCurrency" />
                  </span>
                </Th>
                <SortTh column="irr" sort={sort} onSort={toggle} metric="fundIrr" numeric>
                  Fund IRR
                </SortTh>
                <SortTh column="cashflows" sort={sort} onSort={toggle} metric="cashflows" numeric>
                  Cashflows
                </SortTh>
                <SortTh column="source" sort={sort} onSort={toggle}>
                  Source file
                </SortTh>
                <Th>
                  <span className="sr-only">Open</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((fund) => {
                const irr = irrByFund.get(fund.fund_id);
                const open = () => navigate(`/funds/${fund.fund_id}`);
                return (
                  <tr
                    key={fund.fund_id}
                    role="link"
                    tabIndex={0}
                    onClick={open}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") open();
                    }}
                    className="cursor-pointer transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                  >
                    <Td className="font-medium text-ink">{fund.name}</Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className="size-1.5 rounded-full"
                          style={{ background: currencyColor(fund.base_currency) }}
                        />
                        {fund.base_currency}
                      </span>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-1.5">
                        {fund.currencies.map((currency) => (
                          <span
                            key={currency}
                            className="rounded border border-hairline px-1.5 py-0.5 text-xs text-ink-2"
                          >
                            {currency}
                          </span>
                        ))}
                      </span>
                    </Td>
                    <Td numeric>{irr === undefined ? "—" : formatPercent(irr)}</Td>
                    <Td numeric>{fund.cashflow_count.toLocaleString("en-GB")}</Td>
                    <Td>
                      {fund.source_file ? (
                        <span className="inline-flex max-w-[200px] items-center gap-1.5">
                          <FileText size={12} className="shrink-0 text-ink-3" />
                          <span className="truncate" title={fund.source_file}>
                            {fund.source_file}
                          </span>
                        </span>
                      ) : (
                        <span className="text-ink-3">Not recorded</span>
                      )}
                    </Td>
                    <Td className="w-8 text-right">
                      <ChevronRight size={15} className="inline text-ink-3" />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          <p className="px-5 py-3 text-sm text-ink-3">
            {pluralise(funds.length, "fund")}. An upload replaces the projections of every fund in
            the file.
          </p>
        </Card>
      </div>
    </>
  );
}
