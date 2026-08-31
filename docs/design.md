# Design Document

Parts 1, 2 and 4 of the case study. Part 3 is the code in `src/riskview/` with tests in `tests/`; the README covers approach and assumptions.

## Part 1 — Schema Design

This feature runs on three entities. The **cashflow** is the input — the record clients supply; the **NAV schedule** and the **FX hedge trade** are derived from it. Each is defined below as implemented — the Pydantic models in `schemas.py` — and the same shapes are the target tables once persistence is added. Fund, Deal and Currency are the structure these entities hang off; they are explained in the relationships section rather than modelled as tables today, with notes on what would change when they are.

### Cashflow

The input entity — the only one clients supply; everything else is derived from it.

| Field | Type | Notes |
|---|---|---|
| id | int | row id from the client file, kept for reconciliation |
| fund_name | str | owning fund (normalised to a `fund_id` FK at rest) |
| cashflow_date | date | calendar date, no time component |
| cashflow_type | enum | Investment, Interest, Principal Repayment |
| currency | ISO 4217 | local currency of the flow; validated against a closed set — this is what catches `GPB` |
| amount_local | decimal | outflows negative, inflows positive; enforced by validators |
| amount_base | decimal | client-supplied conversion to the fund's base currency |
| base_currency | ISO 4217 | the fund's reporting currency |

Amounts are exact decimals at rest; analytics use floats for root-finding and round results back to cents. The natural key for upserts is (fund, currency, date, type).

### NAV schedule

Derived — one schedule per (fund, currency) in local-currency terms, plus one fund-level schedule in base currency. Never entered by hand, safe to rebuild at any time.

| Field | Type | Notes |
|---|---|---|
| fund_name | str | |
| currency | ISO 4217 | position currency (base currency for the fund-level schedule) |
| irr | float | the position's IRR, which is also the discount rate for every point |
| points | | one per cashflow date, each holding: |
| · date | date | |
| · nav | decimal | PV of flows on or after the date, at the IRR; by construction NAV(0) = 0 and NAV at the final date equals the terminal value — the schedule's built-in sanity checks |
| · open_exposure | decimal | PV of flows after the date — the amount a hedge must cover |

### FX hedge trade

Derived — one FX forward per quarterly roll per non-base-currency exposure.

| Field | Type | Notes |
|---|---|---|
| fund_name | str | |
| trade_date | date | a NAV schedule date |
| value_date | date | 3 months after the trade date — the next roll |
| sell_currency | ISO 4217 | the exposure currency |
| buy_currency | ISO 4217 | the fund's base currency |
| notional_sell | decimal | coverage_ratio × open exposure at the trade date |
| coverage_ratio | float | 1.0 — hedge the full exposure; a field rather than a constant, so partial cover is a data change, not a code change |

### How they relate to Fund, Deal and Currency

```mermaid
erDiagram
    FUND ||--o{ DEAL : holds
    DEAL ||--o{ CASHFLOW : projects
    CURRENCY ||--o{ CASHFLOW : denominates
    FUND ||--o{ NAV_SCHEDULE : "derived per currency"
    FUND ||--o{ FX_HEDGE_TRADE : "recommended per exposure"
```

**Fund** is the reporting unit and owns the base currency. Cashflows carry their fund and its base currency; NAV schedules and hedge trades are computed per fund. A fund table would add nothing today — a fund is a name and a base currency — so it stays implicit. *Future note: at rest, funds get a store-assigned surrogate id, because names can change while references shouldn't.*

**Deal** sits between fund and cashflow, but the sample feed has no deal identifier, so a position here is a (fund, currency) pair and there is no deal model — a synthetic deal per position would add nothing. *Future note: when feeds carry deal ids, one additive migration adds a `deals` table and a nullable `cashflows.deal_id`. Old files keep loading, fund-level analytics are unchanged (they already aggregate per fund and currency), and deal-level IRR becomes a finer grouping of the same computation.*

**Currency** is a reference set of ISO 4217 codes that every currency field validates against — a closed enum in code, a reference table at rest. Today that set is exactly the three currencies the sample feed uses (EUR, GBP, USD), not the full ISO 4217 list; this is what turns a typo like `GPB` into a validation error instead of silent bad data, and supporting a new currency is a one-line addition to the enum.

### Schema evolution

Data lives in memory today — the priority was the analytics, not persistence — so evolution is answered as design. In production:

- Every schema change is an Alembic migration, applied at deploy. The database is never edited by hand.
- Changes are additive: new optional columns with defaults, never repurposing a column.
- The Pydantic schemas are the contract; storage can differ per backend (amounts are strings in SQLite, `NUMERIC` in PostgreSQL).
- Unknown cashflow types are rejected at ingestion until analytics handle them; silently ignoring one would produce a wrong NAV.
- Next migration: a `projection_version` on cashflows and everything derived from them, making each uploaded batch immutable and versioned. Part 4 relies on it.

## Part 2 — Pipeline Design

```mermaid
flowchart LR
    A[Client file upload<br/>CSV / Excel] --> B[Ingestion<br/>read → validate against the model]
    B -->|corrections & rejects| R[Ingestion report]
    B -->|validated batch vN| C[(Store)]
    C --> D[Analytics<br/>IRR → NAV → hedges]
    D -->|results for vN| C
    C --> E[Serving API]
    E --> F[Client web app]
    R --> G[Ops / data supplier]
```

### Trigger mechanism and step dependencies

A file upload triggers ingestion; a validated batch makes analytics for the affected funds due; serving reads only stored results. The current implementation computes analytics on first read and caches them per batch — equivalent to computing at ingestion, since analytics are deterministic, and the whole computation takes milliseconds. Every step reads and writes stored artifacts, so the same steps can later run as queue workers without changing their logic.

### Where each piece of logic lives

| Layer | Package | Role |
|---|---|---|
| Ingestion | `riskview.ingestion` | CSV/Excel readers; maps source headers onto model fields and validates each row; the only place dirty data exists |
| Analytics | `riskview.analytics` | pure functions from cashflows to IRR, NAV and hedges; no I/O |
| Serving | `riskview.api` + `riskview.store` | the ingest endpoint plus read-only views over stored results; in-memory today, PostgreSQL behind the same interface in production |

Shared shapes live in `riskview.schemas` and `riskview.main` wires everything together. Each layer depends only on the shapes, so any of them can be split out later.

### Dirty data handling

Cleaning and validation are one step, not two. The `Cashflow` model does all of it: `@field_validator(..., mode="before")` methods normalise the raw client value, the field's own type coerces it and checks it against the closed sets, and a `@model_validator(mode="after")` checks the invariants that span fields — signs, and local against base. Ingestion has no cleaning code of its own: it maps the source headers onto model fields and calls `Cashflow.model_validate(row, context=fixes)`. That matters beyond tidiness, because a cleaning stage sitting in front of a model is a second place for the rules to live and drift from.

Fix only what is unambiguous, and record every fix: stray characters, known date formats, thousands separators, a short map of known currency typos (`GPB→GBP`). Fixes are appended to the list passed as the validation context, so an accepted row still reports exactly what changed. Date formats are a fixed whitelist because `03/04/2026` reads differently under day-first and month-first conventions — the convention comes from the source contract and is never guessed.

Anything not unambiguously fixable fails validation, and **a batch is all-or-nothing**. Every bad row is collected first, with Pydantic's reason and the offending value, and only then is the batch refused — so the supplier sees every problem in one pass rather than fixing the file one row per round trip. Nothing is stored and no analytics run.

Partial acceptance was the alternative and is the wrong trade here. A fund's IRR and NAV schedule are computed from all of its cashflows, so dropping six bad rows out of 126 does not yield an incomplete answer — it yields a confident, plausible, wrong one, served to a client-facing app with no signal that anything is missing. Refusing the batch turns a silent data-quality problem into a loud one, at the cost of a re-send. A missing column and a repeated row id fail the file the same way, just earlier — the first before validation starts, the second as a validator on `IngestionResult`.

### Idempotency

Ingestion is a pure function of the file bytes, and saving a batch replaces each fund's projections rather than appending. Analytics are deterministic. Re-running any step, or the whole pipeline, gives the same result, so retries are always safe.

### Pseudocode

```
on cashflow_file_uploaded(file):
    try:
        result = ingest(file)                 # read → validate; all-or-nothing
    except IngestionRejected as rejected:
        notify(supplier, rejected.rejects)    # every bad row, with its reason
        return                                # nothing stored, no analytics run

    version = store.save_batch(result.cashflows)          # immutable projection version
    for fund in funds_in(result):
        analytics = compute(fund, store.cashflows(fund, version))   # IRR → NAV → hedges, pure
        store.save_analytics(fund, version, analytics)
    store.set_current(version)                # atomic pointer swap; serving never sees partial state
```

## Part 4 — Trade-offs

### Serving analytics and hedge recommendations to a client-facing web application

Compute on write, serve reads from stored results. Projections change a few times a quarter while clients read daily, so the API stays a stateless read layer over precomputed views and never runs analytics in-request. Results are immutable per projection version, so `ETag = version` gives cache invalidation for free. As volume grows, ingestion and analytics move behind a queue, and auth and per-fund tenancy sit at the gateway. I would not split into microservices or add streaming at this stage: module boundaries in one deployable give the same separation at far lower cost.

### Cashflow projections revised mid-quarter with hedges in-flight

Keep two ledgers. Projections are versioned and replaceable; executed hedges are facts and never change. A revision creates projection version N+1 and recomputes the target exposure per roll date. The engine compares that against the live hedge book and recommends adjustment trades — top up or partially unwind — rather than cancel-and-replace, which keeps transaction costs down and the audit trail clean. Each recommendation records the projection version it came from, and small deltas can wait for the next roll under a tolerance band.
