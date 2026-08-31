import type { RowCorrection } from "@/api/types";
import { InfoDot } from "@/components/ui/InfoLabel";
import { SortTh, Table, Td, Th } from "@/components/ui/Table";
import { useSort } from "@/hooks/useSort";
import { sortRows } from "@/lib/sorting";

type Column = "line" | "rowId";

/** Every unambiguous fix applied on ingest, row by row. */
export function CorrectionList({ corrections }: { corrections: RowCorrection[] }) {
  const { sort, toggle } = useSort<Column>("line");
  const rows = sortRows(corrections, sort, (correction, column) =>
    column === "line" ? correction.line : correction.row_id,
  );

  if (corrections.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-ink-3">
        No corrections were needed — every row validated as supplied.
      </p>
    );
  }

  return (
    <div className="max-h-72 overflow-y-auto">
      <Table>
        <thead>
          <tr>
            <SortTh column="line" sort={sort} onSort={toggle} numeric>
              Line
            </SortTh>
            <SortTh column="rowId" sort={sort} onSort={toggle}>
              Row id
            </SortTh>
            <Th className="w-full">
              <span className="inline-flex items-center gap-1.5">
                Correction applied
                <InfoDot metric="correctedRows" />
              </span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((correction) => (
            <tr key={`${correction.line}-${correction.row_id}`} className="hover:bg-subtle">
              <Td numeric>{correction.line}</Td>
              <Td>{correction.row_id}</Td>
              <Td className="whitespace-normal">
                <ul className="space-y-0.5">
                  {correction.corrections.map((detail) => (
                    <li key={detail} className="font-mono text-xs text-ink-2">
                      {detail}
                    </li>
                  ))}
                </ul>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
