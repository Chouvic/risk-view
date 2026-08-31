import { useMemo } from "react";
import { fetchFundAnalytics } from "@/api/client";
import type { FundAnalytics, FundSummary } from "@/api/types";
import { useAsyncResource } from "./useAsyncResource";

/** IRR, NAV schedules and hedges for one fund, fetched as a set. */
export function useFundAnalytics(fund: FundSummary | null) {
  const load = useMemo(
    () => (fund ? (signal: AbortSignal) => fetchFundAnalytics(fund, signal) : null),
    [fund],
  );
  return useAsyncResource<FundAnalytics>(load);
}
