import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { ApiError, uploadCashflows } from "@/api/client";
import type { IngestionReport, RowReject } from "@/api/types";
import { Dropzone } from "./Dropzone";

interface Failure {
  message: string;
  rejects: RowReject[];
}

/**
 * The ingestion boundary. A batch is all-or-nothing, so this either confirms the
 * accepted count or lists every rejection.
 */
export function UploadPanel({
  onIngested,
}: {
  onIngested: (report: IngestionReport, fileName: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string>();
  const [accepted, setAccepted] = useState<IngestionReport | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setFileName(file.name);
    setAccepted(null);
    setFailure(null);
    try {
      const report = await uploadCashflows(file);
      setAccepted(report);
      onIngested(report, file.name);
    } catch (cause) {
      setFailure(
        cause instanceof ApiError
          ? { message: cause.message, rejects: cause.rejects }
          : { message: cause instanceof Error ? cause.message : "Upload failed", rejects: [] },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Dropzone onFile={handleFile} busy={busy} fileName={fileName} />

      {accepted ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-hairline bg-subtle px-4 py-3">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-good" />
          <p className="text-sm leading-relaxed text-ink-2">
            <span className="font-semibold text-ink">{accepted.summary.accepted}</span> rows accepted
            from {fileName}
            {accepted.summary.corrected > 0 ? (
              <>
                , <span className="font-semibold text-ink">{accepted.summary.corrected}</span> corrected
              </>
            ) : null}
            . Full record below.
          </p>
        </div>
      ) : null}

      {failure ? (
        <div className="rounded-xl border border-critical/30 bg-critical/5">
          <div className="flex items-start gap-2.5 px-4 py-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-critical" />
            <div>
              <p className="text-sm font-medium text-ink">{failure.message}</p>
              <p className="mt-1 text-sm text-ink-2">
                Nothing was stored — a batch is accepted or refused whole. Correct the rows below and
                re-send.
              </p>
            </div>
          </div>
          {failure.rejects.length > 0 ? (
            <ul className="max-h-64 space-y-1 overflow-y-auto border-t border-critical/20 px-4 py-3">
              {failure.rejects.map((reject) => (
                <li key={`${reject.line}-${reject.row_id}`} className="text-sm text-ink-2">
                  <span className="font-medium text-ink">
                    Line {reject.line} (id {reject.row_id})
                  </span>{" "}
                  — {reject.errors.join("; ")}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
