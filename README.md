# riskview

Fund-level FX risk analytics for private credit funds: ingest projected cashflow schedules, compute IRR and NAV per currency, and recommend 3-month rolling FX forward hedges.

## Deliverables

| Case study ask | Where |
|---|---|
| Part 1 — Schema design | [docs/design.md](docs/design.md#part-1--schema-design) |
| Part 2 — Pipeline design (+ pseudocode) | [docs/design.md](docs/design.md#part-2--pipeline-design) |
| Part 3 — Implementation with tests | `src/riskview/` + `tests/` — run below |
| Part 4 — Trade-offs | [docs/design.md](docs/design.md#part-4--trade-offs) |
| Approach and assumptions | this README |

## Quick start

Requires Python ≥ 3.12 and [uv](https://docs.astral.sh/uv/).

```bash
uv sync                       # install
uv run pytest                 # run the test suite
uv run python scripts/fund_report.py            # validate a cashflow file, print IRRs + NAV schedules
uv run uvicorn riskview.main:app   # serve the analytics as an API on :8000

cd frontend && npm install && npm run dev   # the web UI on :5173
```

The report script reads `samples/cashflows.csv` by default (see [Data](#data)) and takes `--data path/to/file.csv|.xlsx`, `--fund NAME` and `--currency CCY`. The API starts with an empty store, so post a file first: `curl -F file=@samples/cashflows.csv localhost:8000/ingest`. It then serves `/funds`, `/funds/{id}/irr`, `/funds/{id}/nav`, `/funds/{id}/hedges`; interactive docs at `/docs`. `/funds` also returns `source_file`, the file each fund's projections were ingested from.

The UI proxies `/api` to the backend, so start the API first and open <http://localhost:5173>.

In VS Code these are tasks (⇧⌘P → *Run Task*): **Serve API**, **Serve UI**, **Serve API + UI** and
**Sample report**.

## Web UI

`frontend/` is a React + TypeScript app (Vite, Tailwind, Recharts) over the same API. Three routes,
each with its own URL: `/funds` lists the funds, `/funds/:id` is one fund top to bottom — overview,
returns, NAV and hedges, scoped by a currency filter — and `/data` handles ingestion, since a file
can carry several funds and a fund only names the file it came from.

Metric names carry a dotted underline: hovering one gives the definition and the convention behind
it, from `src/lib/glossary.ts`. Tables sort on any column. A currency keeps its colour throughout, so
filtering never repaints a series.

```
frontend/src/
├── api/          # the only place that talks HTTP: client + TypeScript mirrors of the schemas
├── pages/        # one per route
├── features/     # the pieces those pages are built from
├── components/   # ui/ primitives and charts/ wrappers
├── hooks/        # data loading
└── lib/          # formatting, colours, axis ticks, sorting, the glossary
```

## Approach

Three layers behind shared Pydantic schemas; the pipeline from the design doc is the package layout:

```
src/riskview/
├── schemas.py    # all Pydantic models: the validation contract, domain entities, API responses
├── ingestion/    # readers (CSV/Excel) → Cashflow.model_validate → an all-or-nothing batch
├── analytics/    # pure functions: cashflows → IRR → NAV schedule → hedge recommendations
├── store.py      # in-memory store of batches + cached analytics (persistence is a design-doc step)
├── api/          # FastAPI app: the /ingest endpoint plus read endpoints over the store
└── main.py       # composition root
```

Validation is the Pydantic models, not a pipeline in front of them. `Cashflow` carries `mode="before"` field validators that clean the raw client value, plain domain types that coerce and check it, and a model validator for the invariants that span fields, so ingestion maps the source headers onto model fields and calls `Cashflow.model_validate(row, context=fixes)` — there is no separate cleaning stage to keep in sync.

Dirty data is fixed only where the fix is unambiguous (stray characters, known date formats, thousands separators, known typos like `GPB→GBP`). Every fix is appended to the validation context, so an accepted row still reports exactly what changed.

Anything else fails validation, and a batch is all-or-nothing: every bad row is collected with its reason, then the whole file is refused and nothing is stored. A fund's IRR and NAV are computed from all of its cashflows, so ingesting 120 of 126 rows would not produce an incomplete answer — it would produce a confident wrong one. The supplier gets the full list of failures in one pass and re-sends the file. The sample loads as 126 accepted, 3 corrected.

Fund I results (base EUR): IRR 9.95% GBP, 7.89% EUR, 12.05% USD, 10.05% fund-level. The NAV schedules satisfy both sanity checks from the brief — NAV(0) = 0 and NAV at the final date equals the terminal value — asserted in `tests/test_nav.py`.

## Assumptions

- The sample has no deal column, so a position is one (fund, currency) pair, and there's no Deal model in code today — see the design doc for the additive migration to deal-grained feeds.
- Data lives in memory: the assignment asks for ingestion, validation, and computation, not persistence. The database layer (PostgreSQL + Alembic, behind the same store interface) is described in the design doc.
- Currency is a closed set — EUR, GBP, USD, the three the sample feed uses — not the full ISO 4217 list. Any other code is rejected at validation; supporting a new one is a one-line addition to `CurrencyCode`.
- IRR is XIRR-style: dated flows, actual/365, solved by bisection. Currency-level IRR uses local amounts; fund-level uses base amounts.
- NAV(t) is the PV of flows dated on or after t at the relevant IRR — the definition under which the brief's sanity checks hold. Open exposure at t is the PV of flows after t (at t=0, the invested amount) and is what hedges cover.
- Hedges sell 100% of each non-base currency's open exposure forward 3 months at every quarterly date. No trade once exposure is zero; the base currency is never hedged.
- Base amounts are used as given (the file's implied FX rates are internally consistent) and only for fund-level analytics.
- Amounts are `Decimal` end to end; analytics use floats internally and round back to cents.

## Data

`samples/cashflows.csv` is the sample cashflow data, used by the commands above and by the tests. It holds two funds across three currencies with quarterly flows 2025–2030, and contains the intentional errors the brief describes: a currency code typo (`GPB`), inconsistent date formats, and stray characters. It ingests as 126 accepted, 3 corrected — the corrections are rows 17, 21 and 51. The numeric formatting the brief also mentions (thousands separators, currency symbols, parenthesised negatives) is not present in this sample but is handled, and covered in `tests/test_validation.py`.

Excel is supported on the same path — `--data file.xlsx` and `POST /ingest` both accept it, and `tests/test_ingestion.py` asserts a workbook ingests identically to the CSV.
