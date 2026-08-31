import type { ReactNode } from "react";

/** One band of a fund's page. The id is the sidebar's jump target. */
export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-32 border-b border-hairline px-6 py-8 last:border-b-0">
      <div className="mb-4 max-w-3xl">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-3">{description}</p>
      </div>
      {children}
    </section>
  );
}
