import { useCallback, useMemo } from "react";
import { fetchVersionDiff, fetchVersions } from "@/api/client";
import type { VersionDiff, VersionInfo } from "@/api/types";
import { useAsyncResource } from "./useAsyncResource";

/** One fund's projection history, oldest first. */
export function useFundVersions(fundId: number) {
  return useAsyncResource<VersionInfo[]>(
    useCallback((signal: AbortSignal) => fetchVersions(fundId, signal), [fundId]),
  );
}

/**
 * What changed between two versions. Null while there is no pair to compare — a
 * fund on its first version has no revision to show.
 */
export function useVersionDiff(fundId: number, from: number | null, to: number | null) {
  const load = useMemo(
    () =>
      from === null || to === null || from >= to
        ? null
        : (signal: AbortSignal) => fetchVersionDiff(fundId, from, to, signal),
    [fundId, from, to],
  );
  return useAsyncResource<VersionDiff>(load);
}
