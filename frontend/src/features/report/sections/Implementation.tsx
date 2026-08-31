import { ReportSection } from "../ReportShell";
import { HedgeBlotter } from "../parts/HedgeBlotter";
import { NavExplorer } from "../parts/NavExplorer";
import { SelfCheck } from "../parts/SelfCheck";
import { BASE, CURRENCIES, FUND, couponShape, irrFor } from "../lib/model";
import { Block, Claim, Code, Figure, PairTable, Path, Points, Prose } from "../parts/ui";
import { formatPercent } from "@/lib/format";

const NAV_CODE = `def _pv_at(t, rate, flows, include_on_date):
    pv = sum(
        cf / (1.0 + rate) ** ((d - t).days / DAYS_PER_YEAR)
        for d, cf in flows
        if d > t or (include_on_date and d == t)
    )
    return Decimal(pv).quantize(Decimal("0.01"))`;

/** Part 3 — the code and the three computations it exists to perform. */
export function Implementation() {
  const gbp = couponShape("GBP");

  return (
    <ReportSection id="implementation">
      <Claim>
        Four small analytics modules, no numerical dependencies, every number reproducible by hand.
      </Claim>

      <Points
        items={[
          {
            point: "IRR is solved, not derived",
            reason:
              "The one rate at which the dated present value of the schedule is zero. Bisection on actual/365 — no closed form exists.",
          },
          {
            point: "NAV is that same discounting from a moving date",
            reason:
              "Each position is discounted at its own IRR, which is why NAV(0) = 0 is a check rather than a coincidence.",
          },
          {
            point: "Hedges are sized on open exposure",
            reason:
              "One flag separates the two: what the position is worth today, and what is still outstanding to cover.",
          },
        ]}
      />

      <Block title="What is where">
        <PairTable
          head={["Module", "What it does"]}
          rows={[
            [<Path>schemas.py</Path>, "Every Pydantic model: entities, validation rules, API responses."],
            [<Path>analytics/irr.py</Path>, "Dated NPV and IRR by bisection. Knows nothing about funds."],
            [<Path>analytics/nav.py</Path>, "The NAV schedule — the PV of what remains, twice."],
            [<Path>analytics/hedge.py</Path>, "Rolling forwards, with month-end roll arithmetic."],
          ]}
        />
        <Prose className="mt-3">
          No SciPy, no pandas, no dateutil: the whole numerical surface is one bisection and one
          discounting loop, small enough for a reviewer to check.
        </Prose>
      </Block>

      <Block title="IRR" hint="Fund I, solved from the validated cashflows">
        <div className="grid grid-cols-2 divide-x divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface sm:grid-cols-4 sm:divide-y-0">
          {CURRENCIES.map((code) => (
            <Figure
              key={code}
              label={`${code} position`}
              value={formatPercent(irrFor(code))}
              detail={code === BASE ? "base currency" : "local currency terms"}
            />
          ))}
          <Figure
            label="Fund"
            value={formatPercent(FUND.fundIrr)}
            detail={`${BASE} base amounts`}
          />
        </div>
        <Prose className="mt-3">
          The fund IRR is solved on the base amounts, not blended from the three currency IRRs — an
          average of rates is not a rate. Each position pays {gbp.count} quarterly coupons and none
          in the final quarter, so GBP lands at {formatPercent(irrFor("GBP"))} against the{" "}
          {formatPercent(gbp.compounded)} its coupons compound to. Worth explaining rather than
          assuming.
        </Prose>
      </Block>

      <Block title="NAV schedule">
        <NavExplorer />
        <div className="mt-4">
          <Code label="analytics/nav.py — the whole computation">{NAV_CODE}</Code>
        </div>
        <Prose className="mt-3">
          <Path>include_on_date=True</Path> gives NAV. <Path>False</Path> gives the open exposure a
          forward must cover. Computing both in one pass keeps the reporting view and the trading
          view from drifting apart.
        </Prose>
      </Block>

      <Block title="Hedges">
        <HedgeBlotter />
        <Prose className="mt-3">
          Sized on open exposure, not NAV. On the final date NAV is the terminal value but nothing is
          outstanding, so a trade there would be an outright short position nobody decided to take.
        </Prose>
      </Block>

      <Block title="Evidence">
        <SelfCheck />
      </Block>
    </ReportSection>
  );
}
