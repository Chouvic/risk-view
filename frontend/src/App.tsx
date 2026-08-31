import { useState } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { FundSummary, IngestionReport } from "@/api/types";
import { Button } from "@/components/ui/Button";
import { useFunds } from "@/hooks/useFunds";
import { newUploadRecord, type UploadRecord } from "@/lib/uploads";
import { EmptyState } from "@/features/shell/EmptyState";
import { Sidebar } from "@/features/shell/Sidebar";
import { FundsPage } from "@/pages/FundsPage";
import { FundPage } from "@/pages/FundPage";
import { DataPage } from "@/pages/DataPage";
import { ReportPage } from "@/pages/ReportPage";

export default function App() {
  const funds = useFunds();
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [activeSection, setActiveSection] = useState<string>();
  const location = useLocation();
  const list = funds.data ?? [];

  // The case study report is static: it reads a generated dataset rather than the API,
  // so it stays reachable while the funds request is loading, failing or empty.
  const staticRoute = location.pathname.startsWith("/report");

  function handleIngested(report: IngestionReport, fileName: string) {
    setUploads((current) => [newUploadRecord(fileName, report), ...current]);
    funds.reload();
  }

  if (funds.loading && !staticRoute) {
    return (
      <FullPage>
        <Loader2 className="animate-spin text-ink-3" />
      </FullPage>
    );
  }

  if (funds.error && !staticRoute) {
    return (
      <FullPage>
        <div className="max-w-sm text-center">
          <AlertTriangle className="mx-auto text-critical" size={20} />
          <p className="mt-3 text-[15px] font-medium text-ink">Cannot reach the analytics API</p>
          <p className="mt-1 text-sm text-ink-2">{funds.error}</p>
          <Button className="mt-4" onClick={funds.reload}>
            Try again
          </Button>
        </div>
      </FullPage>
    );
  }

  // Nothing stored and nothing sent: the only useful screen is the one that ingests a file.
  if (list.length === 0 && uploads.length === 0 && !staticRoute) {
    return <EmptyState onIngested={handleIngested} />;
  }

  // The sidebar sits outside <Routes>, so it reads the open fund from the location.
  const openFundId = location.pathname.match(/^\/funds\/(\d+)/)?.[1];

  return (
    <>
      <Sidebar
        fund={list.find((fund) => String(fund.fund_id) === openFundId)}
        activeSection={activeSection}
      />
      <main className="lg:pl-60">
        <Routes>
          <Route path="/" element={<Navigate to="/funds" replace />} />
          <Route path="/funds" element={<FundsPage funds={list} />} />
          <Route
            path="/funds/:fundId"
            element={<FundRoute funds={list} onActiveSectionChange={setActiveSection} />}
          />
          <Route path="/data" element={<DataPage uploads={uploads} onIngested={handleIngested} />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="*" element={<Navigate to="/funds" replace />} />
        </Routes>
      </main>
    </>
  );
}

/** Resolves `:fundId` against the loaded funds; an unknown id falls back to the list. */
function FundRoute({
  funds,
  onActiveSectionChange,
}: {
  funds: FundSummary[];
  onActiveSectionChange: (id: string) => void;
}) {
  const { fundId } = useParams();
  const fund = funds.find((candidate) => String(candidate.fund_id) === fundId);
  if (!fund) return <Navigate to="/funds" replace />;
  return <FundPage key={fund.fund_id} fund={fund} onActiveSectionChange={onActiveSectionChange} />;
}

function FullPage({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center p-6">{children}</div>;
}
