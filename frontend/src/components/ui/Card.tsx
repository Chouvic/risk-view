import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** The single surface every panel on the dashboard is built from. */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-hairline bg-surface", className)}>{children}</div>
  );
}

export function CardHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-5 py-4">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold tracking-tight text-ink">{title}</h3>
        {description ? <p className="mt-1 text-sm leading-relaxed text-ink-3">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}
