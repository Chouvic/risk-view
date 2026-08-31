/** The only place that talks HTTP. `/api` is same-origin; Vite proxies it to FastAPI. */

import type {
  FundAnalytics,
  FundIrr,
  FundSummary,
  FxForwardTrade,
  IngestionReport,
  NavBundle,
  RowReject,
  VersionDiff,
  VersionInfo,
} from "./types";

const BASE = "/api";

/** An API failure with the detail the backend supplies — including per-row rejects. */
export class ApiError extends Error {
  readonly status: number;
  readonly rejects: RowReject[];

  constructor(status: number, message: string, rejects: RowReject[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.rejects = rejects;
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  const fallback = `${response.status} ${response.statusText}`;
  let detail: unknown;
  try {
    detail = (await response.json())?.detail;
  } catch {
    return new ApiError(response.status, fallback);
  }
  // /ingest refuses a batch with `{error, rejects}`; every other route sends a string.
  if (detail && typeof detail === "object" && "error" in detail) {
    const body = detail as { error: string; rejects?: RowReject[] };
    return new ApiError(response.status, body.error, body.rejects ?? []);
  }
  return new ApiError(response.status, typeof detail === "string" ? detail : fallback);
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { signal });
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as T;
}

export function fetchFunds(signal?: AbortSignal): Promise<FundSummary[]> {
  return get<FundSummary[]>("/funds", signal);
}

/**
 * Headline IRR for every fund, one request each — `/funds` returns identity, not
 * analytics. Fine for a handful of funds; a larger book would want it folded in.
 */
export function fetchFundIrrs(funds: FundSummary[], signal?: AbortSignal): Promise<FundIrr[]> {
  return Promise.all(funds.map((fund) => get<FundIrr>(`/funds/${fund.fund_id}/irr`, signal)));
}

/**
 * One fund's whole analytics set. The three reads are independent, so they run
 * together — and they take the same `?version=`, so all three describe one
 * version of the projection rather than a mix of two.
 */
export async function fetchFundAnalytics(
  summary: FundSummary,
  version?: number,
  signal?: AbortSignal,
): Promise<FundAnalytics> {
  const at = version === undefined ? "" : `?version=${version}`;
  const [irr, nav, hedges] = await Promise.all([
    get<FundIrr>(`/funds/${summary.fund_id}/irr${at}`, signal),
    get<NavBundle>(`/funds/${summary.fund_id}/nav${at}`, signal),
    get<FxForwardTrade[]>(`/funds/${summary.fund_id}/hedges${at}`, signal),
  ]);
  return { summary, version_no: version ?? summary.version_no, irr, nav, hedges };
}

/** A fund's projection history, oldest first. One entry per version ever published. */
export function fetchVersions(fundId: number, signal?: AbortSignal): Promise<VersionInfo[]> {
  return get<VersionInfo[]>(`/funds/${fundId}/versions`, signal);
}

/** What changed between two versions. `to` defaults server-side to the current version. */
export function fetchVersionDiff(
  fundId: number,
  from: number,
  to?: number,
  signal?: AbortSignal,
): Promise<VersionDiff> {
  const params = new URLSearchParams({ from_version: String(from) });
  if (to !== undefined) params.set("to_version", String(to));
  return get<VersionDiff>(`/funds/${fundId}/versions/diff?${params}`, signal);
}

export async function uploadCashflows(file: File): Promise<IngestionReport> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${BASE}/ingest`, { method: "POST", body });
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as IngestionReport;
}
