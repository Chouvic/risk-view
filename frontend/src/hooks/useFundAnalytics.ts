import { useMemo } from "react";
import { fetchFundAnalytics } from "@/api/client";
import type { FundAnalytics, FundSummary } from "@/api/types";
import { useAsyncResource } from "./useAsyncResource";

/**
 * IRR, NAV schedules and hedges for one fund, fetched as a set. `version` pins a
 * historical version; omitted, the API serves the fund's current one.
 */
export function useFundAnalytics(fund: FundSummary | null, version?: number) {
  const load = useMemo(
    () => (fund ? (signal: AbortSignal) => fetchFundAnalytics(fund, version, signal) : null),
    [fund, version],
  );
  return useAsyncResource<FundAnalytics>(load);
}
