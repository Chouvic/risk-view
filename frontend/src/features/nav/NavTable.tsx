import type { NavSchedule } from "@/api/types";
import { SortTh, SpacerTd, SpacerTh, Table, Td } from "@/components/ui/Table";
import { useSort } from "@/hooks/useSort";
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import { sortRows } from "@/lib/sorting";

type Column = "date" | "nav" | "exposure";

/** The chart's table twin — every plotted value readable without hovering. */
export function NavTable({ schedule }: { schedule: NavSchedule }) {
  const { sort, toggle } = useSort<Column>("date");
  const rows = sortRows(schedule.points, sort, (point, column) => {
    switch (column) {
      case "date":
        return point.date;
      case "nav":
        return toNumber(point.nav);
      case "exposure":
        return toNumber(point.open_exposure);
    }
  });

  return (
    <div className="max-h-[420px] overflow-y-auto">
      <Table>
        <thead>
          <tr>
            <SortTh column="date" sort={sort} onSort={toggle}>
              Date
            </SortTh>
            <SortTh column="nav" sort={sort} onSort={toggle} metric="nav" numeric>
              NAV ({schedule.currency})
            </SortTh>
            <SortTh column="exposure" sort={sort} onSort={toggle} metric="openExposure" numeric>
              Open exposure
            </SortTh>
            <SpacerTh />
          </tr>
        </thead>
        <tbody>
          {rows.map((point) => (
            <tr key={point.date} className="hover:bg-subtle">
              <Td>{formatDate(point.date)}</Td>
              <Td numeric>{formatMoney(point.nav, schedule.currency)}</Td>
              <Td numeric>{formatMoney(point.open_exposure, schedule.currency)}</Td>
              <SpacerTd />
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
