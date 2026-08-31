import type { IngestionReport } from "@/api/types";

/**
 * One file ingested in this session. The API stores cashflows, not upload history,
 * so this lives in the browser for as long as the tab is open.
 */
export interface UploadRecord {
  id: string;
  fileName: string;
  /** ISO timestamp of when the batch was accepted. */
  at: string;
  report: IngestionReport;
}

export function newUploadRecord(fileName: string, report: IngestionReport): UploadRecord {
  return { id: `${Date.now()}-${fileName}`, fileName, at: new Date().toISOString(), report };
}
