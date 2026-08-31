"""Command line entry point.

    uv run riskview ingest samples/cashflows.csv

Loading a file is an ordinary pipeline operation, not a fixture step: this goes
through the same ingest_into as POST /ingest, lands the same audit row, and is
idempotent on the file's bytes. There is deliberately no back door that writes
cashflows straight into the database.

Note this is the only CLI that touches storage — scripts/fund_report.py validates
and computes offline, so a client file can be checked before it is ingested.
"""

import argparse
import sys
from pathlib import Path

from riskview.db.alembic_support import schema_is_current
from riskview.db.repository import CashflowRepository
from riskview.db.session import create_db_engine, create_session_factory, session_scope
from riskview.ingestion.readers import UnsupportedFormatError
from riskview.ingestion.service import ingest_into


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="riskview", description=__doc__.splitlines()[0])
    subcommands = parser.add_subparsers(dest="command", required=True)

    ingest = subcommands.add_parser("ingest", help="load a cashflow file into the database")
    ingest.add_argument("path", type=Path, help="cashflow file, CSV or Excel")
    ingest.add_argument("--database-url", help="override RISKVIEW_DATABASE_URL for this run")

    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if not args.path.is_file():
        return _fail(f"no such file: {args.path}")

    engine = create_db_engine(args.database_url)
    try:
        schema_is_current(engine)
    except RuntimeError as exc:
        engine.dispose()
        return _fail(str(exc))

    try:
        with session_scope(create_session_factory(engine)) as session:
            report = ingest_into(
                CashflowRepository(session), args.path.read_bytes(), args.path.name
            )
    except (UnsupportedFormatError, ValueError) as exc:
        return _fail(str(exc))
    finally:
        engine.dispose()

    if report.duplicate:
        print(f"Already ingested as batch {report.batch_id}; nothing changed.")
    else:
        print(f"Batch {report.batch_id}: ", end="")
    summary = report.summary
    print(
        f"{summary['accepted']} accepted, {summary['corrected']} corrected, "
        f"{summary['rejected']} rejected"
    )
    for row in report.rejects:
        print(f"  rejected line {row.line} (id {row.row_id}): {'; '.join(row.errors)}")
    return 0


def _fail(message: str) -> int:
    print(f"error: {message}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
