"""Validate a cashflow file, then print each fund's IRRs and NAV schedules.

    uv run python scripts/fund_report.py [--data FILE] [--fund NAME] [--currency CCY]
"""

import argparse
import sys
from pathlib import Path

from riskview.analytics import compute_fund_analytics
from riskview.ingestion import IngestionRejected, ingest_file

DEFAULT_DATA = Path(__file__).resolve().parents[1] / "samples" / "cashflows.csv"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--data",
        type=Path,
        default=DEFAULT_DATA,
        help="cashflow file, CSV or Excel (default: samples/cashflows.csv)",
    )
    parser.add_argument("--fund", help="report a single fund by name (default: every fund in the file)")
    parser.add_argument("--currency", help="restrict NAV schedules to one currency code")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    try:
        result = ingest_file(args.data)
    except IngestionRejected as exc:
        print(f"{exc}:", file=sys.stderr)
        for reject in exc.rejects:
            print(f"  line {reject.line} (id {reject.row_id}): {'; '.join(reject.errors)}", file=sys.stderr)
        sys.exit(1)

    summary = result.summary()
    print(f"Ingestion: {summary['accepted']} accepted, {summary['corrected']} corrected")

    fund_names = sorted({cf.fund_name for cf in result.cashflows})
    if args.fund:
        if args.fund not in fund_names:
            sys.exit(f"unknown fund {args.fund!r}; available: {', '.join(fund_names)}")
        selected = [args.fund]
    else:
        selected = fund_names

    currency = args.currency.upper() if args.currency else None

    for fund_id, name in enumerate(selected, start=1):
        flows = [cf for cf in result.cashflows if cf.fund_name == name]
        analytics = compute_fund_analytics(fund_id, flows)

        print(f"\n{name} — base currency {analytics.base_currency}")
        print(f"Fund-level IRR: {analytics.fund_irr:.4%}")
        for ccy, rate in sorted(analytics.currency_irr.items()):
            print(f"  {ccy} IRR:    {rate:.4%}")

        for ccy in sorted(analytics.nav_schedules):
            if currency and ccy != currency:
                continue
            schedule = analytics.nav_schedules[ccy]
            print(f"\nNAV schedule — {name}, {ccy} (local currency)")
            print(f"  {'date':<12}{'nav':>18}{'open exposure':>18}")
            for point in schedule.points:
                print(f"  {point.date.isoformat():<12}{point.nav:>18,.2f}{point.open_exposure:>18,.2f}")


if __name__ == "__main__":
    main()
