/** The readout shared by every chart: the value leads, the series name follows. */
interface TooltipRow {
  label: string;
  value: string;
  color: string;
  /** A wash key (area fill) instead of a line key. */
  area?: boolean;
}

export function TooltipCard({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="pointer-events-none rounded-lg border border-hairline bg-surface px-3 py-2 shadow-lg shadow-black/5">
      <p className="text-xs font-medium text-ink-3">{title}</p>
      <div className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline gap-3">
            <span
              aria-hidden
              className="mt-1 shrink-0 self-center rounded-full"
              style={{
                background: row.color,
                width: 10,
                height: row.area ? 8 : 2,
                opacity: row.area ? 0.35 : 1,
                borderRadius: row.area ? 2 : 999,
              }}
            />
            <span className="grow text-sm whitespace-nowrap text-ink-3">{row.label}</span>
            <span className="text-sm font-semibold tabular-nums text-ink">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
