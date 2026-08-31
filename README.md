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
```

The report script reads `samples/cashflows.csv` by default (see [Data](#data)) and takes `--data path/to/file.csv|.xlsx`, `--fund NAME` and `--currency CCY`. It never touches the database, so a client file can be checked before anyone decides to ingest it.

To run the service, create the database, load a file into it, and start the two servers:

```bash
uv run alembic upgrade head                     # create the schema; the only way it is ever created
uv run riskview ingest samples/cashflows.csv    # 126 accepted, 3 corrected
uv run uvicorn riskview.main:app                # serve the API on :8000

cd frontend && npm install && npm run dev       # the web UI on :5173
```

The database is a local SQLite file (`riskview.db`), overridable with `RISKVIEW_DATABASE_URL`. The API serves `/funds`, `/funds/{id}/irr`, `/funds/{id}/nav`, `/funds/{id}/hedges` (each taking `?version=N` for a historical version), `/funds/{id}/versions`, `/funds/{id}/versions/diff?from_version=N`, and `/ingestions/{batch_id}`; interactive docs at `/docs`. `/funds` also returns each fund's current `version_no` and the `source_file` that version was ingested from. Uploading over HTTP works the same way as the CLI — `curl -F file=@samples/cashflows.csv localhost:8000/ingest` — and posting the same bytes twice is a no-op that returns the original report. The app refuses to start against a database that is behind the migrations, so `alembic upgrade head` is never optional.

### Revisions

A revision is a full restatement: re-upload the fund's complete schedule and the upload response says, per fund, whether it was `new`, `revised` (version N+1 minted) or `unchanged`. Change detection is by content, not bytes — a re-export with reordered rows, renumbered ids or a CSV-to-Excel round trip mints nothing — and superseded versions stay readable via `?version=N`, with `/funds/{id}/versions/diff` showing which rows changed and what that did to IRR and the hedge schedule. Two revision samples tell the canonical stories:

```bash
curl -F file=@samples/cashflows_rev_fx_update.csv localhost:8000/ingest         # Fund I revised, Fund II untouched
curl "localhost:8000/funds/1/versions/diff?from_version=1"                      # base amounts moved; hedges unchanged
curl -F file=@samples/cashflows_rev_early_repayment.csv localhost:8000/ingest   # the GBP loan repays 3 years early
curl "localhost:8000/funds/1/versions/diff?from_version=2"                      # hedge programme shortens
```

The UI reads the same routes: it shows the version each fund is on, lets you pin any earlier version, and renders the diff between two versions.

The UI proxies `/api` to the backend, so start the API first and open <http://localhost:5173>.

In VS Code these are tasks (⇧⌘P → *Run Task*): **Serve API**, **Serve UI**, **Serve API + UI** and
**Sample report**. Each serve task first frees its port, so a server left behind by an earlier run
cannot fail the next one with `Address already in use` — `scripts/free-port.sh PORT` on macOS and
Linux, `scripts\free-port.cmd PORT` on Windows, both a no-op when the port is already free.

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
├── db/           # SQLAlchemy models, engine/session, repository, and the Alembic migrations
├── api/          # FastAPI app: the /ingest endpoint plus read endpoints over stored results
├── cli.py        # `riskview ingest FILE`
├── config.py     # settings; RISKVIEW_DATABASE_URL
└── main.py       # composition root
```

Validation is the Pydantic models, not a pipeline in front of them. `Cashflow` carries `mode="before"` field validators that clean the raw client value, plain domain types that coerce and check it, and a model validator for the invariants that span fields, so ingestion maps the source headers onto model fields and calls `Cashflow.model_validate(row, context=fixes)` — there is no separate cleaning stage to keep in sync.

Dirty data is fixed only where the fix is unambiguous (stray characters, known date formats, thousands separators, known typos like `GPB→GBP`). Every fix is appended to the validation context, so an accepted row still reports exactly what changed.

Anything else fails validation, and a batch is all-or-nothing: every bad row is collected with its reason, then the whole file is refused and nothing is stored. A fund's IRR and NAV are computed from all of its cashflows, so ingesting 120 of 126 rows would not produce an incomplete answer — it would produce a confident wrong one. The supplier gets the full list of failures in one pass and re-sends the file. The sample loads as 126 accepted, 3 corrected.

Fund I results (base EUR): IRR 9.95% GBP, 7.89% EUR, 12.05% USD, 10.05% fund-level. The NAV schedules satisfy both sanity checks from the brief — NAV(0) = 0 and NAV at the final date equals the terminal value — asserted in `tests/test_nav.py`.

## Assumptions

- The sample has no deal column, so a position is one (fund, currency) pair, and there's no Deal model in code today — see the design doc for the additive migration to deal-grained feeds.
- Data lives in SQLite, created and evolved only by Alembic migrations — the application never calls `create_all`, so the migrations are exercised on every test run. Amounts are stored as exact text (SQLite has no exact numeric type) and become `NUMERIC` on PostgreSQL, which is the one dialect-specific choice; see `db/types.py`.
- Each upload that changes a fund's schedule is an immutable projection version, published by moving a pointer as the last step of one transaction, so a file lands whole or not at all and readers never see a partial batch. Re-uploading identical bytes is a no-op keyed on their SHA-256; identical content in different bytes is detected by a canonical per-fund content hash and mints nothing; a genuine revision is version N+1 rather than an overwrite, and old versions stay readable.
- Analytics are computed at ingestion and served from stored rows — reads never run the analytics engine.
- Currency is a closed set — EUR, GBP, USD, the three the sample feed uses — not the full ISO 4217 list. Any other code is rejected at validation; supporting a new one is a one-line addition to `CurrencyCode`.
- IRR is XIRR-style: dated flows, actual/365, solved by bisection. Currency-level IRR uses local amounts; fund-level uses base amounts.
- NAV(t) is the PV of flows dated on or after t at the relevant IRR — the definition under which the brief's sanity checks hold. Open exposure at t is the PV of flows after t (at t=0, the invested amount) and is what hedges cover.
- Hedges sell 100% of each non-base currency's open exposure forward 3 months at every quarterly date. No trade once exposure is zero; the base currency is never hedged.
- Base amounts are used as given (the file's implied FX rates are internally consistent) and only for fund-level analytics.
- Amounts are `Decimal` end to end; analytics use floats internally and round back to cents.

## Data

`samples/cashflows.csv` is the sample cashflow data, used by the commands above and by the tests. It holds two funds across three currencies with quarterly flows 2025–2030, and contains the intentional errors the brief describes: a currency code typo (`GPB`), inconsistent date formats, and stray characters. It ingests as 126 accepted, 3 corrected — the corrections are rows 17, 21 and 51. The numeric formatting the brief also mentions (thousands separators, currency symbols, parenthesised negatives) is not present in this sample but is handled, and covered in `tests/test_validation.py`.

Excel is supported on the same path — `--data file.xlsx` and `POST /ingest` both accept it, and `tests/test_ingestion.py` asserts a workbook ingests identically to the CSV.

Two revision files restate Fund I in full (Fund II is untouched by them, since a batch only replaces the funds it contains): `samples/cashflows_rev_early_repayment.csv` returns the GBP principal on 30/09/2027 instead of 30/09/2030 and drops the interest that no longer accrues, and `samples/cashflows_rev_fx_update.csv` keeps every date and local amount but restates the GBP base amounts at 1.20 EUR/GBP. `tests/test_diff.py` pins what each does to the diff, the IRRs and the hedge schedule.
