/** The only place that talks HTTP. `/api` is same-origin; Vite proxies it to FastAPI. */

import type {
  FundAnalytics,
  FundIrr,
  FundSummary,
  FxForwardTrade,
  IngestionReport,
  NavBundle,
  RowReject,
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

/** One fund's whole analytics set. The three reads are independent, so they run together. */
export async function fetchFundAnalytics(
  summary: FundSummary,
  signal?: AbortSignal,
): Promise<FundAnalytics> {
  const [irr, nav, hedges] = await Promise.all([
    get<FundIrr>(`/funds/${summary.fund_id}/irr`, signal),
    get<NavBundle>(`/funds/${summary.fund_id}/nav`, signal),
    get<FxForwardTrade[]>(`/funds/${summary.fund_id}/hedges`, signal),
  ]);
  return { summary, irr, nav, hedges };
}

export async function uploadCashflows(file: File): Promise<IngestionReport> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${BASE}/ingest`, { method: "POST", body });
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as IngestionReport;
}
