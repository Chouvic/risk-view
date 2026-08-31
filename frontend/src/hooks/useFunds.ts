import { useCallback } from "react";
import { fetchFunds } from "@/api/client";
import type { FundSummary } from "@/api/types";
import { useAsyncResource } from "./useAsyncResource";

/** Every fund the API currently holds. Empty until a cashflow file is ingested. */
export function useFunds() {
  return useAsyncResource<FundSummary[]>(useCallback((signal: AbortSignal) => fetchFunds(signal), []));
}
