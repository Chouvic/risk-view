import { ChevronDown, History } from "lucide-react";
import type { VersionInfo } from "@/api/types";
import { cn } from "@/lib/cn";

/**
 * Pins the page to one projection version. A native select rather than a custom
 * menu: the option list is unbounded — a fund gains a version per revision — and
 * keyboard and screen-reader behaviour come for free.
 */
export function VersionPicker({
  versions,
  value,
  onChange,
  className,
}: {
  versions: VersionInfo[];
  value: number;
  onChange: (version: number) => void;
  className?: string;
}) {
  const current = versions.find((version) => version.is_current)?.version_no;
  const pinned = current !== undefined && value !== current;

  // One version is a fact about the fund, not a choice: state it, don't offer it.
  if (versions.length < 2) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-hairline bg-subtle px-2 py-0.5",
          "text-xs font-medium text-ink-2",
          className,
        )}
      >
        <History size={11} className="text-ink-3" />v{value}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        "focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accent",
        pinned ? "border-warning/40 bg-warning/10 text-ink" : "border-hairline bg-subtle text-ink-2",
        className,
      )}
    >
      <History size={11} className={pinned ? "text-warning" : "text-ink-3"} />
      <select
        aria-label="Projection version"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="cursor-pointer appearance-none bg-transparent pr-3.5 font-medium focus:outline-none"
      >
        {versions
          .slice()
          .reverse()
          .map((version) => (
            <option key={version.version_no} value={version.version_no}>
              v{version.version_no}
              {version.is_current ? " (current)" : ""}
            </option>
          ))}
      </select>
      <ChevronDown size={11} aria-hidden className="pointer-events-none absolute right-1.5 text-ink-3" />
    </span>
  );
}
