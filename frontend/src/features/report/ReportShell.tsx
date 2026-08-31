import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveSection } from "@/hooks/useActiveSection";
import { cn } from "@/lib/cn";
import { OUTLINE, OUTLINE_IDS } from "./lib/outline";

/**
 * The report's frame: a sticky running order across the top, so the sequence is
 * visible while reading and a section is one click away while presenting.
 */
export function ReportShell({ children }: { children: ReactNode }) {
  const active = useActiveSection(OUTLINE_IDS, true);
  const navigate = useNavigate();

  function jumpTo(event: React.MouseEvent, id: string) {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "auto", block: "start" });
    navigate({ hash: id }, { replace: true });
  }

  return (
    <>
      <nav
        aria-label="Report sections"
        className="sticky top-0 z-20 border-b border-hairline bg-plane"
      >
        <ol className="flex gap-1 overflow-x-auto px-6 py-2.5">
          {OUTLINE.map((entry) => {
            const current = entry.id === active;
            return (
              <li key={entry.id}>
                <a
                  href={`#${entry.id}`}
                  onClick={(event) => jumpTo(event, entry.id)}
                  aria-current={current ? "true" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                    current
                      ? "bg-surface font-medium text-ink shadow-sm"
                      : "text-ink-3 hover:bg-surface/60 hover:text-ink-2",
                  )}
                >
                  <span
                    className={cn(
                      "font-mono text-[11px] tabular-nums",
                      current ? "text-accent" : "text-ink-3/70",
                    )}
                  >
                    {entry.step}
                  </span>
                  {entry.label}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
      {children}
    </>
  );
}

/** One numbered band of the report. The id is the running order's jump target. */
export function ReportSection({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const entry = OUTLINE.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`no outline entry for section '${id}'`);

  return (
    <section id={id} className="scroll-mt-14 border-b border-hairline px-6 py-10 last:border-b-0">
      <div className="max-w-3xl">
        <p className="font-mono text-[11px] tracking-widest text-ink-3 uppercase">{entry.step}</p>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-ink">{entry.title}</h2>
      </div>
      <div className="mt-6 space-y-6">{children}</div>
    </section>
  );
}
