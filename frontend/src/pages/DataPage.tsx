import { CheckCircle2, FileSpreadsheet } from "lucide-react";
import type { IngestionReport } from "@/api/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { InfoLabel } from "@/components/ui/InfoLabel";
import { Stat } from "@/components/ui/Stat";
import { CorrectionList } from "@/features/upload/CorrectionList";
import { UploadPanel } from "@/features/upload/UploadPanel";
import { PageTitle } from "@/features/shell/PageTitle";
import { formatDate } from "@/lib/format";
import type { UploadRecord } from "@/lib/uploads";

/**
 * Ingestion, kept separate from the analytics: a file can carry several funds, so
 * this page owns the upload and a fund's page only names its source.
 */
export function DataPage({
  uploads,
  onIngested,
}: {
  uploads: UploadRecord[];
  onIngested: (report: IngestionReport, fileName: string) => void;
}) {
  return (
    <>
      <PageTitle
        title="Data"
        description="Ingest a cashflow file and review its validation record."
      />

      <div className="space-y-4 p-6">
        <Card>
        <CardHeader
          title="Ingest a cashflow file"
          description="Each fund in the file replaces its stored projections. Other funds are unchanged."
        />
        <CardBody>
          <UploadPanel onIngested={onIngested} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Ingestion history"
          description="Files ingested in this session, newest first. The API stores cashflows, not upload history."
        />
        {uploads.length === 0 ? (
          <CardBody className="flex items-start gap-3">
            <FileSpreadsheet size={17} className="mt-0.5 shrink-0 text-ink-3" />
            <p className="text-sm leading-relaxed text-ink-2">
              No files ingested in this session.
            </p>
          </CardBody>
        ) : (
          <ul>
            {uploads.map((upload) => (
              <IngestionRecord key={upload.id} upload={upload} />
            ))}
          </ul>
        )}
        </Card>
      </div>
    </>
  );
}

function IngestionRecord({ upload }: { upload: UploadRecord }) {
  const { report } = upload;
  return (
    <li className="border-t border-hairline first:border-t-0">
      <div className="flex flex-wrap items-center gap-2.5 px-5 py-3">
        <CheckCircle2 size={15} className="shrink-0 text-good" />
        <p className="text-sm font-medium text-ink">{upload.fileName}</p>
        <p className="text-sm text-ink-3">
          {formatDate(upload.at.slice(0, 10))} ·{" "}
          {new Date(upload.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      <div className="grid grid-cols-1 divide-y divide-hairline border-t border-hairline sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Stat
          metric="acceptedRows"
          label="Accepted"
          value={report.summary.accepted.toLocaleString("en-GB")}
          detail="Stored and analysed"
        />
        <Stat
          metric="correctedRows"
          label="Corrected"
          value={report.summary.corrected.toLocaleString("en-GB")}
          detail="Repaired on ingest"
        />
        <Stat metric="rejectedRows" label="Rejected" value="0" detail="Batch accepted whole" />
      </div>

      <div className="border-t border-hairline px-5 pt-4 pb-1">
        <p className="text-sm font-medium text-ink-2">
          <InfoLabel metric="correctedRows" label="Corrections applied" />
        </p>
      </div>
      <CorrectionList corrections={report.corrections} />
    </li>
  );
}
