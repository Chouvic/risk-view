import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { InfoDot } from "./InfoLabel";
import type { GlossaryKey } from "@/lib/glossary";
import type { Sort } from "@/lib/sorting";
import { cn } from "@/lib/cn";

/** The table twin every chart is paired with. Scrolls itself rather than the page. */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[520px] border-collapse text-sm">{children}</table>
    </div>
  );
}

/**
 * An empty trailing column that soaks up the width the real columns do not need,
 * so the slack sits at the end rather than as a gap between two columns.
 */
export function SpacerTh() {
  return <th aria-hidden className="sticky top-0 z-10 w-full border-b border-hairline bg-surface" />;
}

export function SpacerTd() {
  return <td aria-hidden className="border-b border-grid" />;
}

export function Th({
  children,
  numeric,
  className,
  ariaSort,
}: {
  children: ReactNode;
  numeric?: boolean;
  className?: string;
  ariaSort?: "ascending" | "descending" | "none";
}) {
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={cn(
        "sticky top-0 z-10 border-b border-hairline bg-surface px-4 py-2.5 text-sm font-medium whitespace-nowrap text-ink-3",
        numeric ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

/** Sorts its column and explains it: the name sorts, the icon opens the glossary. */
export function SortTh<K extends string>({
  column,
  sort,
  onSort,
  metric,
  numeric,
  className,
  children,
}: {
  column: K;
  sort: Sort<K>;
  onSort: (column: K) => void;
  /** Adds the glossary icon beside the name. */
  metric?: GlossaryKey;
  numeric?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const active = sort.key === column;
  const Icon = !active ? ChevronsUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <Th
      numeric={numeric}
      className={className}
      ariaSort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
    >
      {/* The header's alignment comes from the cell, so the parts keep one order. */}
      <span className="inline-flex items-center gap-1.5">
        <button
          onClick={() => onSort(column)}
          className={cn(
            "inline-flex items-center gap-1 rounded-sm transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            active ? "text-ink" : "hover:text-ink-2",
          )}
        >
          {children}
          <Icon size={13} className={cn(active ? "text-ink" : "text-ink-3/70")} />
        </button>
        {metric ? <InfoDot metric={metric} /> : null}
      </span>
    </Th>
  );
}

export function Td({
  children,
  numeric,
  className,
}: {
  children: ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "border-b border-grid px-4 py-2.5 whitespace-nowrap text-ink-2",
        numeric && "text-right tabular-nums text-ink",
        className,
      )}
    >
      {children}
    </td>
  );
}
