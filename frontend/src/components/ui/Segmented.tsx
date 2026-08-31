import { cn } from "@/lib/cn";

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Optional colour dot, used to key a segment to its series in the charts. */
  color?: string;
}

/** A single-choice control for short option sets — the dashboard's only filter widget. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-lg border border-hairline bg-subtle p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-sm font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
              selected ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {option.color ? (
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ background: option.color }}
              />
            ) : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
