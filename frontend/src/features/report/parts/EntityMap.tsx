import { useState } from "react";
import { FieldTable, Panel } from "./ui";
import { cn } from "@/lib/cn";

/**
 * The schema, arranged by provenance rather than alphabetically: what clients supply
 * on the left, what the platform derives on the right. Selecting a box shows its fields.
 */

type EntityId = "fund" | "deal" | "currency" | "cashflow" | "nav" | "hedge";

interface Entity {
  id: EntityId;
  title: string;
  kind: "context" | "supplied" | "derived";
  summary: string;
  note?: string;
  fields: { field: string; type: string; note: string }[];
}

const ENTITIES: Record<EntityId, Entity> = {
  fund: {
    id: "fund",
    title: "Fund",
    kind: "context",
    summary: "The reporting unit. Owns the base currency every analytic is expressed against.",
    note: "Implicit today: a fund here is a name and a base currency, so a table would add nothing. At rest it gains a surrogate id, because names change and references should not.",
    fields: [
      { field: "fund_id", type: "int", note: "Store-assigned, stable across a rename." },
      { field: "name", type: "str", note: "As supplied by the client feed." },
      { field: "base_currency", type: "ISO 4217", note: "The currency the fund reports in." },
    ],
  },
  deal: {
    id: "deal",
    title: "Deal",
    kind: "context",
    summary: "The position a cashflow belongs to. Not in the sample feed, so not modelled yet.",
    note: "When feeds carry deal ids, one additive migration adds a deals table and a nullable cashflows.deal_id. Old files keep loading, fund analytics are unchanged, and deal-level IRR is the same computation on a finer grouping.",
    fields: [
      { field: "deal_id", type: "int", note: "Absent today — the migration is designed, not pre-built." },
      { field: "fund_id", type: "FK → Fund", note: "A deal belongs to exactly one fund." },
      { field: "currency", type: "ISO 4217", note: "A position is a (fund, currency) pair until then." },
    ],
  },
  currency: {
    id: "currency",
    title: "Currency",
    kind: "context",
    summary: "A closed reference set. This is what turns a typo into a rejection.",
    note: "An enum in code, a reference table at rest. It holds exactly the codes the feed uses — EUR, GBP, USD — not the full ISO 4217 list, so GPB fails instead of becoming silent bad data.",
    fields: [
      { field: "code", type: "ISO 4217", note: "EUR, GBP, USD. Adding one is a one-line change." },
    ],
  },
  cashflow: {
    id: "cashflow",
    title: "Cashflow",
    kind: "supplied",
    summary: "The only entity clients supply. Everything else is a function of it.",
    note: "Natural key for upserts is (fund, currency, date, type). Amounts are exact decimals at rest; the solver uses floats and rounds back to cents on the way out.",
    fields: [
      { field: "id", type: "int", note: "Row id from the client file, kept for reconciliation." },
      { field: "fund_name", type: "str", note: "Owning fund; normalised to a fund_id FK at rest." },
      { field: "cashflow_date", type: "date", note: "A calendar date, not an instant." },
      { field: "cashflow_type", type: "enum", note: "Investment, Interest, Principal Repayment." },
      { field: "currency", type: "ISO 4217", note: "Local currency of the flow, against the closed set." },
      { field: "amount_local", type: "Decimal", note: "Outflows negative, inflows positive; enforced." },
      { field: "amount_base", type: "Decimal", note: "Client-supplied conversion to the base currency." },
      { field: "base_currency", type: "ISO 4217", note: "The fund's reporting currency." },
    ],
  },
  nav: {
    id: "nav",
    title: "NAV schedule",
    kind: "derived",
    summary: "One per (fund, currency) in local terms, plus one fund-level schedule in base terms.",
    note: "Never entered by hand, so it is always safe to rebuild. Each point carries two values, not one: NAV for reporting, open exposure for trading.",
    fields: [
      { field: "fund_name", type: "str", note: "" },
      { field: "currency", type: "ISO 4217", note: "Position currency; base currency at fund level." },
      { field: "irr", type: "float", note: "The position's IRR — also the discount rate for every point." },
      { field: "points[].date", type: "date", note: "One point per cashflow date, chronological." },
      { field: "points[].nav", type: "Decimal", note: "PV of flows dated on or after this date." },
      { field: "points[].open_exposure", type: "Decimal", note: "PV of flows dated strictly after — what a hedge covers." },
    ],
  },
  hedge: {
    id: "hedge",
    title: "FX hedge trade",
    kind: "derived",
    summary: "One forward per roll date per non-base exposure.",
    note: "coverage_ratio is a field rather than a constant, so moving off 100% is a data change, not a code change.",
    fields: [
      { field: "fund_name", type: "str", note: "" },
      { field: "trade_date", type: "date", note: "A NAV schedule date." },
      { field: "value_date", type: "date", note: "Three months on, month-end to month-end." },
      { field: "sell_currency", type: "ISO 4217", note: "The exposure currency." },
      { field: "buy_currency", type: "ISO 4217", note: "The fund's base currency." },
      { field: "notional_sell", type: "Decimal", note: "coverage_ratio × open exposure at the trade date." },
      { field: "coverage_ratio", type: "float", note: "1.0 — the brief's 100% of NAV." },
    ],
  },
};

const BOXES: { id: EntityId; x: number; y: number; w: number; h: number }[] = [
  { id: "fund", x: 16, y: 24, w: 148, h: 46 },
  { id: "currency", x: 16, y: 100, w: 148, h: 46 },
  { id: "deal", x: 16, y: 176, w: 148, h: 46 },
  { id: "cashflow", x: 320, y: 92, w: 176, h: 62 },
  { id: "nav", x: 636, y: 40, w: 172, h: 50 },
  { id: "hedge", x: 636, y: 156, w: 172, h: 50 },
];

const EDGES: { d: string; label: string; dashed?: boolean; labelX: number; labelY: number }[] = [
  { d: "M164 47 H 250 V 116 H 320", label: "holds", labelX: 205, labelY: 40 },
  { d: "M164 123 H 320", label: "denominates", labelX: 242, labelY: 116 },
  { d: "M164 199 H 250 V 130 H 320", label: "projects", labelX: 205, labelY: 214, dashed: true },
  { d: "M496 110 H 560 V 65 H 636", label: "discount at IRR", labelX: 566, labelY: 40 },
  { d: "M496 136 H 560 V 181 H 636", label: "size on open exposure", labelX: 566, labelY: 213 },
];

const KIND_STYLE: Record<Entity["kind"], { fill: string; stroke: string; text: string }> = {
  context: { fill: "var(--color-subtle)", stroke: "var(--color-hairline)", text: "var(--color-ink-2)" },
  supplied: { fill: "var(--color-accent-soft)", stroke: "var(--color-accent)", text: "var(--color-ink)" },
  derived: { fill: "var(--color-surface)", stroke: "var(--color-ink-3)", text: "var(--color-ink)" },
};

export function EntityMap() {
  const [selected, setSelected] = useState<EntityId>("cashflow");
  const entity = ENTITIES[selected];

  return (
    <Panel
      title="Schema map"
      description="Select an entity to see its fields. Blue is supplied by the client; outlined is derived by the platform; grey is the structure they hang off."
    >
      <div className="border-b border-hairline p-5">
        <svg viewBox="0 0 824 246" className="h-auto w-full" role="img" aria-label="Entity relationships">
          {EDGES.map((edge) => (
            <g key={edge.label}>
              <path
                d={edge.d}
                fill="none"
                stroke="var(--color-ink-3)"
                strokeWidth={1}
                strokeDasharray={edge.dashed ? "4 3" : undefined}
                opacity={0.55}
                markerEnd="url(#report-arrow)"
              />
              <text
                x={edge.labelX}
                y={edge.labelY}
                fontSize={10.5}
                fill="var(--color-ink-3)"
                fontStyle="italic"
              >
                {edge.label}
              </text>
            </g>
          ))}

          <defs>
            <marker id="report-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 L8 4 L0 8 z" fill="var(--color-ink-3)" opacity={0.7} />
            </marker>
          </defs>

          {BOXES.map((box) => {
            const item = ENTITIES[box.id];
            const style = KIND_STYLE[item.kind];
            const active = box.id === selected;
            return (
              <g
                key={box.id}
                role="button"
                tabIndex={0}
                aria-pressed={active}
                onClick={() => setSelected(box.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelected(box.id);
                  }
                }}
                className="cursor-pointer focus:outline-none"
              >
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.w}
                  height={box.h}
                  rx={8}
                  fill={style.fill}
                  stroke={active ? "var(--color-ink)" : style.stroke}
                  strokeWidth={active ? 2 : 1}
                  strokeDasharray={box.id === "deal" ? "5 3" : undefined}
                />
                <text
                  x={box.x + box.w / 2}
                  y={box.y + (item.kind === "supplied" ? box.h / 2 - 3 : box.h / 2 + 4)}
                  textAnchor="middle"
                  fontSize={13}
                  fontWeight={600}
                  fill={style.text}
                >
                  {item.title}
                </text>
                {item.kind === "supplied" ? (
                  <text
                    x={box.x + box.w / 2}
                    y={box.y + box.h / 2 + 15}
                    textAnchor="middle"
                    fontSize={10.5}
                    fill="var(--color-ink-2)"
                  >
                    the only input
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="p-5">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h5 className="text-sm font-semibold text-ink">{entity.title}</h5>
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-widest uppercase",
              entity.kind === "supplied"
                ? "bg-accent-soft text-accent"
                : entity.kind === "derived"
                  ? "bg-subtle text-ink-2"
                  : "bg-subtle text-ink-3",
            )}
          >
            {entity.kind === "context" ? "structure" : entity.kind}
          </span>
          <p className="text-sm text-ink-2">{entity.summary}</p>
        </div>
        {entity.note ? (
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-3">{entity.note}</p>
        ) : null}
        <div className="mt-4">
          <FieldTable rows={entity.fields} />
        </div>
      </div>
    </Panel>
  );
}
