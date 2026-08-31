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

To run the service, create the database and load a file into it:

```bash
uv run alembic upgrade head                     # create the schema; the only way it is ever created
uv run riskview ingest samples/cashflows.csv    # 126 accepted, 3 corrected, 0 rejected
uv run uvicorn riskview.main:app                # serve on :8000
```

The database is a local SQLite file (`riskview.db`), overridable with `RISKVIEW_DATABASE_URL`. The API serves `/funds`, `/funds/{id}/irr`, `/funds/{id}/nav`, `/funds/{id}/hedges` and `/ingestions/{batch_id}`; interactive docs at `/docs`. Uploading over HTTP works the same way as the CLI — `curl -F file=@samples/cashflows.csv localhost:8000/ingest` — and posting the same bytes twice is a no-op that returns the original report. The app refuses to start against a database that is behind the migrations, so `alembic upgrade head` is never optional.

## Approach

Three layers behind shared Pydantic schemas; the pipeline from the design doc is the package layout:

```
src/riskview/
├── schemas.py    # all Pydantic models: domain entities, ingestion report, API responses
├── ingestion/    # readers (CSV/Excel) → cleaning → validation; the only place dirty data exists
├── analytics/    # pure functions: cashflows → IRR → NAV schedule → hedge recommendations
├── db/           # SQLAlchemy models, engine/session, repository, and the Alembic migrations
├── api/          # FastAPI app: the /ingest endpoint plus read endpoints over stored results
├── cli.py        # `riskview ingest FILE`
├── config.py     # settings; RISKVIEW_DATABASE_URL
└── main.py       # composition root
```

Dirty data is fixed only where the fix is unambiguous (stray characters, known date formats, known typos like `GPB→GBP`), every fix is recorded, and everything else is rejected row by row with a reason. The sample loads as 126 accepted, 3 corrected, 0 rejected.

Fund I results (base EUR): IRR 9.95% GBP, 7.89% EUR, 12.05% USD, 10.05% fund-level. The NAV schedules satisfy both sanity checks from the brief — NAV(0) = 0 and NAV at the final date equals the terminal value — asserted in `tests/test_nav.py`.

## Assumptions

- The sample has no deal column, so a position is one (fund, currency) pair, and there's no Deal model in code today — see the design doc for the additive migration to deal-grained feeds.
- Data lives in SQLite, created and evolved only by Alembic migrations — the application never calls `create_all`, so the migrations are exercised on every test run. Amounts are stored as exact text (SQLite has no exact numeric type) and become `NUMERIC` on PostgreSQL, which is the one dialect-specific choice; see `db/types.py`.
- Each upload is an immutable projection version per fund, published by moving a pointer as the last step of one transaction, so a file lands whole or not at all and readers never see a partial batch. Re-uploading identical bytes is a no-op keyed on their SHA-256; a corrected file is version N+1 rather than an overwrite.
- Analytics are computed at ingestion and served from stored rows — reads never run the analytics engine.
- Currency is a closed set — EUR, GBP, USD, the three the sample feed uses — not the full ISO 4217 list. Any other code is rejected at validation; supporting a new one is a one-line addition to `CurrencyCode`.
- IRR is XIRR-style: dated flows, actual/365, solved by bisection. Currency-level IRR uses local amounts; fund-level uses base amounts.
- NAV(t) is the PV of flows dated on or after t at the relevant IRR — the definition under which the brief's sanity checks hold. Open exposure at t is the PV of flows after t (at t=0, the invested amount) and is what hedges cover.
- Hedges sell 100% of each non-base currency's open exposure forward 3 months at every quarterly date. No trade once exposure is zero; the base currency is never hedged.
- Base amounts are used as given (the file's implied FX rates are internally consistent) and only for fund-level analytics.
- Amounts are `Decimal` end to end; analytics use floats internally and round back to cents.

## Data

`samples/cashflows.csv` is the sample cashflow data, used by the commands above and by the tests. It holds two funds across three currencies with quarterly flows 2025–2030, and contains the intentional errors the brief describes: a currency code typo, inconsistent date formats, and numeric formatting issues. It ingests as 126 accepted, 3 corrected, 0 rejected.

Excel is supported on the same path — `--data file.xlsx` and `POST /ingest` both accept it, and `tests/test_ingestion.py` asserts a workbook ingests identically to the CSV.
