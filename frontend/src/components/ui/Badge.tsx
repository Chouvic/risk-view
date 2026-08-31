import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** A small, quiet label — a currency code, a count, a policy note. */
export function Badge({
  children,
  color,
  className,
}: {
  children: ReactNode;
  /** Draws a colour dot, keying the badge to a chart series. */
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-hairline bg-subtle px-2 py-0.5",
        "text-xs font-medium text-ink-2",
        className,
      )}
    >
      {color ? (
        <span aria-hidden className="size-1.5 rounded-full" style={{ background: color }} />
      ) : null}
      {children}
    </span>
  );
}
