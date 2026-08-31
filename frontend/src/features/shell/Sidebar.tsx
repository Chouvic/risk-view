import { Database, Layers, Upload } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import type { FundSummary } from "@/api/types";
import { FUND_SECTIONS } from "@/lib/sections";
import { cn } from "@/lib/cn";
import { ButtonLink } from "@/components/ui/Button";

/** Primary navigation. Section links appear only while a fund's page is open. */
export function Sidebar({
  fund,
  activeSection,
}: {
  /** The fund currently open, when the route is a fund page. */
  fund?: FundSummary;
  activeSection?: string;
}) {
  const navigate = useNavigate();

  /**
   * A section jump is a scroll, not a route change: scroll, then record the hash
   * with `replace` so Back returns to the funds list. Instant, because a smooth
   * scroll is dropped outright in some browser configurations.
   */
  function jumpTo(event: React.MouseEvent, id: string) {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "auto", block: "start" });
    navigate({ hash: id }, { replace: true });
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-hairline bg-surface lg:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span aria-hidden className="size-6 rounded-md bg-ink" />
        <div>
          <p className="text-[15px] leading-none font-semibold tracking-tight">RiskView</p>
          <p className="mt-1 text-xs leading-none text-ink-3">FX risk analytics</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <div className="space-y-0.5">
          <PrimaryLink to="/funds" icon={Layers} label="Funds" />
          <PrimaryLink to="/data" icon={Database} label="Data" />
        </div>

        {fund ? (
          <div className="mt-5">
            <p className="truncate px-2.5 pb-1.5 text-[11px] font-semibold tracking-widest text-ink-3 uppercase">
              {fund.name}
            </p>
            <div className="space-y-0.5">
              {FUND_SECTIONS.map(({ id, label, icon: Icon }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  onClick={(event) => jumpTo(event, id)}
                  aria-current={id === activeSection ? "true" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                    id === activeSection ? "bg-subtle font-medium text-ink" : "text-ink-2 hover:text-ink",
                  )}
                >
                  <Icon size={15} />
                  {label}
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </nav>

      <div className="border-t border-hairline p-3">
        <ButtonLink to="/data" variant="primary" className="w-full">
          <Upload size={14} />
          Upload cashflows
        </ButtonLink>
      </div>
    </aside>
  );
}

function PrimaryLink({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
          isActive ? "bg-accent-soft font-medium text-ink" : "text-ink-2 hover:bg-subtle hover:text-ink",
        )
      }
    >
      <Icon size={15} />
      {label}
    </NavLink>
  );
}
