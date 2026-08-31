import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { FundSummary, VersionInfo } from "@/api/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { InfoLabel } from "@/components/ui/InfoLabel";
import { SpacerTd, SpacerTh, Table, Td, Th } from "@/components/ui/Table";
import { useVersionDiff } from "@/hooks/useFundVersions";
import { formatDate, pluralise } from "@/lib/format";
import { cn } from "@/lib/cn";
import { VersionDiffView } from "./VersionDiffView";

/**
 * A fund's revision history and the diff between any two of its versions. The
 * fund's other sections show one version; this is the only place two are compared.
 */
export function RevisionsSection({
  fund,
  versions,
  viewing,
  onView,
}: {
  fund: FundSummary;
  versions: VersionInfo[];
  /** The version the rest of the page is showing. */
  viewing: number;
  onView: (version: number) => void;
}) {
  if (versions.length === 0) {
    return <p className="text-sm text-ink-3">No projection history for this fund.</p>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Projection history"
          description="One entry per version published. A file that restates a fund identically mints nothing, so every row here is a real change."
        />
        <HistoryTable versions={versions} viewing={viewing} onView={onView} />
      </Card>

      {versions.length > 1 ? (
        <DiffCard fund={fund} versions={versions} viewing={viewing} />
      ) : (
        <Card>
          <CardHeader
            title="What changed"
            description="Nothing to compare yet — this fund is on its first version."
          />
        </Card>
      )}
    </div>
  );
}

function HistoryTable({
  versions,
  viewing,
  onView,
}: {
  versions: VersionInfo[];
  viewing: number;
  onView: (version: number) => void;
}) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Version</Th>
          <Th>Published</Th>
          <Th numeric>
            <InfoLabel metric="cashflows" label="Cashflows" />
          </Th>
          <Th>Batch</Th>
          <Th>
            <span className="sr-only">View this version</span>
          </Th>
          <SpacerTh />
        </tr>
      </thead>
      <tbody>
        {versions
          .slice()
          .reverse()
          .map((version) => {
            const open = version.version_no === viewing;
            return (
              <tr key={version.version_no} className={cn(open && "bg-accent-soft/40")}>
                <Td className="font-medium text-ink">
                  <span className="inline-flex items-center gap-2">
                    v{version.version_no}
                    {version.is_current ? <Badge>current</Badge> : null}
                  </span>
                </Td>
                <Td>
                  {formatDate(version.created_at.slice(0, 10))}
                  <span className="ml-2 text-ink-3">
                    {new Date(version.created_at).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </Td>
                <Td numeric>{version.cashflow_count.toLocaleString("en-GB")}</Td>
                <Td className="text-ink-3">#{version.batch_id}</Td>
                <Td>
                  {open ? (
                    <span className="text-sm text-ink-3">viewing</span>
                  ) : (
                    <Button variant="ghost" onClick={() => onView(version.version_no)}>
                      View
                    </Button>
                  )}
                </Td>
                <SpacerTd />
              </tr>
            );
          })}
      </tbody>
    </Table>
  );
}

/**
 * Defaults to the revision that produced the version on screen — the question
 * asked most often is "what did this change?", not "pick two versions".
 */
function DiffCard({
  fund,
  versions,
  viewing,
}: {
  fund: FundSummary;
  versions: VersionInfo[];
  viewing: number;
}) {
  const numbers = versions.map((version) => version.version_no);
  const earlier = numbers.filter((n) => n < viewing);
  const [from, setFrom] = useState(earlier.length ? earlier[earlier.length - 1] : numbers[0]);
  const [to, setTo] = useState(viewing);

  // Re-anchor when the reader pins a different version: the comparison follows
  // the page rather than stranding them on a pair they did not choose.
  const [anchor, setAnchor] = useState(viewing);
  if (anchor !== viewing) {
    setAnchor(viewing);
    setTo(viewing);
    setFrom(earlier.length ? earlier[earlier.length - 1] : viewing);
  }

  const diff = useVersionDiff(fund.fund_id, from, to);

  return (
    <Card>
      <CardHeader
        title="What changed"
        description="Rows are matched on (currency, date, type), so a renumbered feed still lines up."
        actions={
          <div className="flex items-center gap-2 text-sm">
            <VersionSelect label="From" value={from} options={numbers} onChange={setFrom} />
            <span aria-hidden className="text-ink-3">
              →
            </span>
            <VersionSelect label="To" value={to} options={numbers} onChange={setTo} />
          </div>
        }
      />

      {from >= to ? (
        <CardBody>
          <p className="text-sm text-ink-2">
            Pick an earlier version on the left — a diff runs forward, from v{to} onwards.
          </p>
        </CardBody>
      ) : diff.error ? (
        <CardBody className="flex items-center gap-2 text-sm text-critical">
          <AlertTriangle size={15} />
          {diff.error}
        </CardBody>
      ) : diff.loading ? (
        <CardBody className="flex justify-center py-8">
          <Loader2 className="animate-spin text-ink-3" />
        </CardBody>
      ) : diff.data ? (
        <div className={cn("transition-opacity", diff.refreshing && "opacity-50")}>
          <p className="border-b border-hairline px-5 py-2.5 text-sm text-ink-3">
            v{diff.data.from_version} → v{diff.data.to_version} ·{" "}
            {pluralise(versionSpan(versions, diff.data.from_version, diff.data.to_version), "revision")}
          </p>
          <VersionDiffView diff={diff.data} baseCurrency={fund.base_currency} />
        </div>
      ) : null}
    </Card>
  );
}

/** Versions published strictly between the two endpoints, inclusive of the later one. */
function versionSpan(versions: VersionInfo[], from: number, to: number): number {
  return versions.filter((version) => version.version_no > from && version.version_no <= to).length;
}

function VersionSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: number[];
  onChange: (value: number) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="text-ink-3">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={cn(
          "cursor-pointer rounded-lg border border-hairline bg-surface px-2 py-1 text-sm font-medium text-ink",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
        )}
      >
        {options
          .slice()
          .reverse()
          .map((option) => (
            <option key={option} value={option}>
              v{option}
            </option>
          ))}
      </select>
    </label>
  );
}
