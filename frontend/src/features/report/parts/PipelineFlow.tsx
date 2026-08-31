import { useState } from "react";
import { Segmented } from "@/components/ui/Segmented";
import { Panel, Path } from "./ui";
import { cn } from "@/lib/cn";

/**
 * The pipeline, and the one decision in it. Switching the batch between clean and
 * defective re-routes the diagram: nothing crosses the gate but a whole valid batch,
 * so a bad row stops the run rather than shrinking it.
 */

type StageId = "upload" | "ingest" | "gate" | "store" | "analytics" | "serve" | "reject";
type Mode = "clean" | "defective";

interface Stage {
  id: StageId;
  title: string;
  lives: string;
  what: string;
  fails: string;
}

const STAGES: Record<StageId, Stage> = {
  upload: {
    id: "upload",
    title: "Upload",
    lives: "client web app → POST /ingest",
    what: "A file arrives — CSV or Excel. The upload is the only trigger; nothing runs on a timer.",
    fails: "An unsupported extension is refused by the reader before a row is parsed: 422 unsupported file type 'pdf'.",
  },
  ingest: {
    id: "ingest",
    title: "Ingest",
    lives: "riskview.ingestion",
    what: "Reads the file, maps source headers onto model fields, and calls Cashflow.model_validate on every row. Cleaning and validation are the same step — the model does both, so the rules live in one place.",
    fails: "Missing columns fail before validation starts. Every failing row is collected with its reason and its offending value, so the supplier sees the whole problem in one pass.",
  },
  gate: {
    id: "gate",
    title: "All valid?",
    lives: "riskview.ingestion.service",
    what: "The only branch in the pipeline. A batch is all-or-nothing.",
    fails: "There is no partial path through this diagram. Why refusing a whole batch beats accepting most of it is argued below the panel.",
  },
  store: {
    id: "store",
    title: "Store batch",
    lives: "riskview.store",
    what: "A whole validated batch replaces the fund's projections. Each fund in the file is independent; funds not in the file are untouched.",
    fails: "Nothing partial is ever written, so a reader cannot observe half a batch.",
  },
  analytics: {
    id: "analytics",
    title: "Analytics",
    lives: "riskview.analytics",
    what: "IRR → NAV schedule → hedge trades, at write time. Pure functions over validated cashflows: no I/O, no clock, no configuration. Re-running them is free and always converges.",
    fails: "A position with no sign change has no IRR, and says so rather than returning a number.",
  },
  serve: {
    id: "serve",
    title: "Serve",
    lives: "riskview.api",
    what: "Read-only views over stored results. The API never runs the analytics engine in-request, so a client-facing read stays a lookup.",
    fails: "An unknown fund or an unheld currency is a 404 that names it. Reads cannot fail on data quality, because unvalidated data never reached the store.",
  },
  reject: {
    id: "reject",
    title: "422 — refuse the batch",
    lives: "riskview.api.routes.ingestion",
    what: "Every bad row is returned together, each with its line, its row id, the rule it broke and the value that broke it. Nothing is stored and no analytics run.",
    fails: "The supplier fixes the file and re-uploads. That round trip is the cost of the design, and it is cheaper than a wrong number reaching a client.",
  },
};

const BOXES: { id: StageId; x: number; y: number; w: number; h: number }[] = [
  { id: "upload", x: 10, y: 28, w: 120, h: 56 },
  { id: "ingest", x: 170, y: 28, w: 120, h: 56 },
  { id: "store", x: 410, y: 28, w: 120, h: 56 },
  { id: "analytics", x: 570, y: 28, w: 120, h: 56 },
  { id: "serve", x: 730, y: 28, w: 120, h: 56 },
  { id: "reject", x: 270, y: 142, w: 200, h: 48 },
];

export function PipelineFlow() {
  const [mode, setMode] = useState<Mode>("clean");
  const [selected, setSelected] = useState<StageId>("gate");
  const stage = STAGES[selected];
  const clean = mode === "clean";

  const live = "var(--color-ink)";
  const dim = "var(--color-hairline)";
  const bad = "var(--color-critical)";

  const downstream = clean ? live : dim;
  const rejectStroke = clean ? dim : bad;

  return (
    <Panel
      title="Pipeline"
      description="Select a stage for what it does and how it fails. Switch the batch to see where a defective file stops."
      actions={
        <Segmented
          ariaLabel="Batch quality"
          value={mode}
          onChange={(next) => {
            setMode(next);
            setSelected(next === "clean" ? "analytics" : "reject");
          }}
          options={[
            { value: "clean", label: "126 valid rows" },
            { value: "defective", label: "1 row fails" },
          ]}
        />
      }
    >
      <div className="border-b border-hairline p-5">
        <svg viewBox="0 0 900 208" className="h-auto w-full" role="img" aria-label="Ingestion to serving pipeline">
          <defs>
            <marker id="flow-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 L8 4 L0 8 z" fill="var(--color-ink-3)" />
            </marker>
            <marker id="flow-arrow-bad" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 L8 4 L0 8 z" fill="var(--color-critical)" />
            </marker>
            <marker id="flow-arrow-dim" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 L8 4 L0 8 z" fill="var(--color-hairline)" />
            </marker>
          </defs>

          {/* Always live: the file reaches the gate whatever it contains. */}
          <path d="M130 56 H 168" fill="none" stroke="var(--color-ink-3)" markerEnd="url(#flow-arrow)" />
          <path d="M290 56 H 328" fill="none" stroke="var(--color-ink-3)" markerEnd="url(#flow-arrow)" />

          {/* The gate. */}
          <path
            d="M368 32 L 400 56 L 368 80 L 336 56 Z"
            fill={clean ? "var(--color-surface)" : "#fdecec"}
            stroke={clean ? "var(--color-ink)" : bad}
            strokeWidth={selected === "gate" ? 2 : 1.25}
            className="cursor-pointer"
            onClick={() => setSelected("gate")}
          />
          <text x={368} y={20} textAnchor="middle" fontSize={10.5} fill="var(--color-ink-3)">
            every row valid?
          </text>

          {/* Accepted path. */}
          <path d="M402 56 H 408" fill="none" stroke={downstream} markerEnd={clean ? "url(#flow-arrow)" : "url(#flow-arrow-dim)"} />
          <path d="M530 56 H 568" fill="none" stroke={downstream} markerEnd={clean ? "url(#flow-arrow)" : "url(#flow-arrow-dim)"} />
          <path d="M690 56 H 728" fill="none" stroke={downstream} markerEnd={clean ? "url(#flow-arrow)" : "url(#flow-arrow-dim)"} />

          {/* Refusal path. */}
          <path
            d="M368 82 V 140"
            fill="none"
            stroke={rejectStroke}
            markerEnd={clean ? "url(#flow-arrow-dim)" : "url(#flow-arrow-bad)"}
          />
          <text x={376} y={112} fontSize={10} fill={clean ? "var(--color-ink-3)" : bad}>
            no — nothing stored
          </text>

          {/* The supplier's loop back to the top. */}
          <path
            d="M270 166 H 70 V 86"
            fill="none"
            stroke={rejectStroke}
            strokeDasharray="4 3"
            markerEnd={clean ? "url(#flow-arrow-dim)" : "url(#flow-arrow-bad)"}
          />
          <text x={82} y={126} fontSize={10} fill={clean ? "var(--color-ink-3)" : bad}>
            fix and re-upload
          </text>

          {BOXES.map((box) => {
            const item = STAGES[box.id];
            const isReject = box.id === "reject";
            const muted = isReject ? clean : !clean;
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
                  fill={isReject ? (clean ? "var(--color-subtle)" : "#fdecec") : "var(--color-surface)"}
                  stroke={active ? (isReject && !clean ? bad : live) : muted ? dim : "var(--color-hairline)"}
                  strokeWidth={active ? 2 : 1}
                  opacity={muted ? 0.55 : 1}
                />
                <text
                  x={box.x + box.w / 2}
                  y={box.y + (isReject ? 30 : 30)}
                  textAnchor="middle"
                  fontSize={12.5}
                  fontWeight={600}
                  fill={isReject && !clean ? bad : "var(--color-ink)"}
                  opacity={muted ? 0.6 : 1}
                >
                  {item.title}
                </text>
                {!isReject ? (
                  <text
                    x={box.x + box.w / 2}
                    y={box.y + 46}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--color-ink-3)"
                    opacity={muted ? 0.6 : 1}
                  >
                    {item.lives.split(" ")[0].replace("riskview.", "")}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="p-5">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h5 className="text-sm font-semibold text-ink">{stage.title}</h5>
          <Path>{stage.lives}</Path>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-2">{stage.what}</p>
        <p
          className={cn(
            "mt-2 max-w-3xl text-sm leading-relaxed",
            selected === "reject" && !clean ? "text-critical" : "text-ink-3",
          )}
        >
          {stage.fails}
        </p>
      </div>
    </Panel>
  );
}
