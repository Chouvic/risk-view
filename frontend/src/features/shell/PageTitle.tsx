import type { ReactNode } from "react";

/** The heading block the Funds and Data pages open with. */
export function PageTitle({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline px-6 py-6">
      <div className="max-w-2xl">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-3">{description}</p>
      </div>
      {actions}
    </div>
  );
}
