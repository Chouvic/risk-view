import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { formatMoneyCompact } from "@/lib/format";
import { xirr, xnpv, type Flow } from "../lib/finance";
import {
  BASE,
  CURRENCIES,
  CURRENCY_COLOR,
  FUND,
  SYMBOL,
  baseFlows,
  irrFor,
  localFlows,
  type Currency,
} from "../lib/model";
import { Panel } from "./ui";

/**
 * IRR from first principles: not a formula to look up, but the one discount rate that
 * makes the whole dated schedule worth zero today. Move the rate and watch NPV cross.
 *
 * The stepper runs the bisection of `irr.py`, from the same starting bracket.
 */

const DOMAIN: [number, number] = [0, 0.25];
const SAMPLES = 160;

type Scope = Currency | "FUND";

export function IrrSolver() {
  const [scope, setScope] = useState<Scope>("GBP");
  const [rate, setRate] = useState(0.05);
  const [step, setStep] = useState(0);

  const fund = scope === "FUND";
  const currency = (fund ? BASE : scope) as Currency;
  const flows: Flow[] = useMemo(() => (fund ? baseFlows() : localFlows(scope)), [scope, fund]);
  const published = fund ? FUND.fundIrr : irrFor(scope);

  const solved = useMemo(() => xirr(flows), [flows]);
  const irr = solved.rate;

  /** The schedule read back out of the data, so the commentary below cannot drift from it. */
  const shape = useMemo(() => {
    if (fund) return null;
    const ordered = [...localFlows(scope)].sort((a, b) => a.date.localeCompare(b.date));
    const principal = Math.abs(ordered[0].amount);
    const coupons = ordered.slice(1, -1);
    const quarterly = (coupons[0]?.amount ?? 0) / principal;
    return {
      count: coupons.length,
      coupon: coupons[0]?.amount ?? 0,
      compounded: (1 + quarterly) ** 4 - 1,
    };
  }, [scope, fund]);

  const curve = useMemo(() => {
    const points: { rate: number; npv: number }[] = [];
    for (let i = 0; i <= SAMPLES; i += 1) {
      const r = DOMAIN[0] + ((DOMAIN[1] - DOMAIN[0]) * i) / SAMPLES;
      points.push({ rate: r, npv: xnpv(r, flows) });
    }
    return points;
  }, [flows]);

  const npv = useMemo(() => xnpv(rate, flows), [rate, flows]);

  const width = 660;
  const height = 220;
  const pad = { left: 60, right: 16, top: 14, bottom: 30 };
  const maxNpv = Math.max(...curve.map((p) => p.npv));
  const minNpv = Math.min(...curve.map((p) => p.npv));
  const x = (r: number) =>
    pad.left + ((r - DOMAIN[0]) / (DOMAIN[1] - DOMAIN[0])) * (width - pad.left - pad.right);
  const y = (v: number) =>
    pad.top + ((maxNpv - v) / (maxNpv - minNpv)) * (height - pad.top - pad.bottom);

  const path = curve
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.rate).toFixed(1)} ${y(p.npv).toFixed(1)}`)
    .join(" ");
  const current = solved.steps[Math.min(step, solved.steps.length - 1)];
  const bracketVisible = current.low >= DOMAIN[0] && current.high <= DOMAIN[1];
  const color = CURRENCY_COLOR[currency];

  return (
    <Panel
      title="IRR solver"
      description="IRR is the one rate at which the dated present value of the whole schedule is zero. There is no closed form, so it is solved — here by the bisection the API runs."
      actions={
        <Segmented
          ariaLabel="Position"
          value={scope}
          onChange={(next) => {
            setScope(next);
            setStep(0);
          }}
          options={[
            ...CURRENCIES.map((code) => ({
              value: code as Scope,
              label: code,
              color: CURRENCY_COLOR[code],
            })),
            { value: "FUND" as Scope, label: "Fund" },
          ]}
        />
      }
    >
      <div className="border-b border-hairline p-5">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Net present value of the ${currency} schedule against discount rate`}
        >
          {[0, 0.05, 0.1, 0.15, 0.2, 0.25].map((tick) => (
            <g key={tick}>
              <line
                x1={x(tick)}
                x2={x(tick)}
                y1={pad.top}
                y2={height - pad.bottom}
                stroke="var(--color-grid)"
              />
              <text
                x={x(tick)}
                y={height - pad.bottom + 15}
                textAnchor="middle"
                fontSize={10.5}
                fill="var(--color-ink-3)"
              >
                {(tick * 100).toFixed(0)}%
              </text>
            </g>
          ))}

          {bracketVisible ? (
            <rect
              x={x(current.low)}
              width={Math.max(x(current.high) - x(current.low), 1)}
              y={pad.top}
              height={height - pad.top - pad.bottom}
              fill="var(--color-accent)"
              opacity={0.12}
            />
          ) : null}

          {/* Zero is the whole point of the exercise, so it is drawn over the grid. */}
          <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} stroke="var(--color-ink-3)" />
          <text x={pad.left - 8} y={y(0) + 4} textAnchor="end" fontSize={10.5} fill="var(--color-ink-3)">
            0
          </text>
          <text x={pad.left - 8} y={y(maxNpv) + 10} textAnchor="end" fontSize={10.5} fill="var(--color-ink-3)">
            {formatMoneyCompact(maxNpv, currency)}
          </text>

          <path d={path} fill="none" stroke={color} strokeWidth={2} />

          <line
            x1={x(irr)}
            x2={x(irr)}
            y1={pad.top}
            y2={height - pad.bottom}
            stroke="var(--color-good)"
            strokeDasharray="4 3"
          />
          <text x={x(irr) + 6} y={pad.top + 12} fontSize={11} fontWeight={600} fill="var(--color-good)">
            IRR {(irr * 100).toFixed(2)}%
          </text>

          <line x1={x(rate)} x2={x(rate)} y1={pad.top} y2={height - pad.bottom} stroke="var(--color-ink)" />
          <circle cx={x(rate)} cy={y(npv)} r={4.5} fill="var(--color-ink)" />
        </svg>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_320px]">
        <div>
          <label className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-sm text-ink-3">Discount rate</span>
            <input
              type="range"
              min={DOMAIN[0]}
              max={DOMAIN[1]}
              step={0.0005}
              value={rate}
              onChange={(event) => setRate(Number(event.target.value))}
              className="min-w-0 flex-1 accent-ink"
              aria-label="Discount rate"
            />
            <span className="w-16 shrink-0 text-right text-sm font-medium tabular-nums text-ink">
              {(rate * 100).toFixed(2)}%
            </span>
          </label>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Readout
              label="NPV at that rate"
              value={`${SYMBOL[currency]}${npv.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`}
            />
            <Readout label="Solved IRR" value={`${(irr * 100).toFixed(4)}%`} tone="good" />
            <Readout
              label="Against the API"
              value={Math.abs(irr - published) < 1e-9 ? "identical" : "differs"}
            />
          </div>

          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-3">
            {shape ? (
              <>
                {scope} pays {shape.count} quarterly coupons of{" "}
                {formatMoneyCompact(shape.coupon, currency)} and nothing in the final quarter. Those
                coupons compound to {(shape.compounded * 100).toFixed(2)}%; pricing the whole
                schedule gives {(irr * 100).toFixed(2)}%. The gap is the twentieth coupon that never
                arrives — a number worth explaining rather than assuming.
              </>
            ) : (
              <>
                The fund IRR runs the same solver over the client-supplied base amounts. It is not a
                blend of the three currency IRRs: an average of rates is not a rate, because the
                timing and size of the flows are what set it.
              </>
            )}
          </p>
        </div>

        <div className="rounded-lg border border-hairline bg-subtle p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] font-semibold tracking-widest text-ink-3 uppercase">Bisection</p>
            <p className="font-mono text-[11px] text-ink-3">
              {step + 1} / {solved.steps.length}
            </p>
          </div>
          <dl className="mt-3 space-y-1.5 font-mono text-[12px]">
            <Row label="low" value={current.low.toFixed(9)} />
            <Row label="high" value={current.high.toFixed(9)} />
            <Row label="mid" value={current.mid.toFixed(9)} />
            <Row label="width" value={((current.high - current.low) / 2).toExponential(2)} />
            <Row label="NPV(mid)" value={current.npv.toExponential(3)} />
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => setStep((s) => Math.min(s + 1, solved.steps.length - 1))}>
              Step
            </Button>
            <Button onClick={() => setStep(solved.steps.length - 1)}>Converge</Button>
            <Button variant="ghost" onClick={() => setStep(0)}>
              Reset
            </Button>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
            Starts at [−0.999, 100] and halves. Slower than Newton and immune to a bad starting
            point; at this volume the difference is microseconds.
          </p>
        </div>
      </div>
    </Panel>
  );
}

function Readout({ label, value, tone }: { label: string; value: string; tone?: "good" }) {
  return (
    <div>
      <p className="text-sm text-ink-3">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums ${tone === "good" ? "text-good" : "text-ink"}`}
      >
        {value}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-3">{label}</dt>
      <dd className="tabular-nums text-ink">{value}</dd>
    </div>
  );
}
