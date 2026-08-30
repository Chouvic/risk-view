"""Field-level normalisers for dirty input data.

Policy: fix only what is unambiguous, and record every fix as a correction so the
ingestion report shows exactly what was changed. Anything ambiguous is left to fail
validation and be rejected with a reason.

The rules are the explicit constants below, matching this platform's client feed.
Date formats are a whitelist on purpose: "03/04/2026" is a different day under
day-first and month-first conventions, so a fuzzy parser (dateutil, pandas) would
still need the convention configured per source — and would silently accept
ambiguous garbage on top. If feeds with different conventions arrive, these
constants become per-source configuration; until then, explicit beats configurable.
"""

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

# Characters that show up as copy/paste debris around otherwise-valid values.
JUNK_CHARS = "`'\" "

# Exact, known source-system typos only; an unmapped bad code is rejected, not guessed.
CURRENCY_ALIASES = {
    "GPB": "GBP",
    "EURO": "EUR",
    "UDS": "USD",
}

# Day-first (this source's convention), plus ISO 8601. Date only — any time-of-day
# component is discarded before parsing, since cashflow dates are calendar dates.
DATE_FORMATS = ("%d/%m/%Y", "%Y-%m-%d")


class CleaningError(ValueError):
    """A field value that cannot be normalised unambiguously."""


def _scrub(raw: str, corrections: list[str], field: str) -> str:
    """Strip junk characters and collapse repeated whitespace, recording the change."""
    cleaned = raw.strip().strip(JUNK_CHARS).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    if cleaned != raw:
        corrections.append(f"{field}: scrubbed {raw!r} -> {cleaned!r}")
    return cleaned


def clean_date(raw: str) -> tuple[date, list[str]]:
    """Parse a date string in any tolerated format, scrubbing debris first."""
    corrections: list[str] = []
    cleaned = _scrub(raw, corrections, "date")
    date_part = re.split(r"[ T]", cleaned, maxsplit=1)[0]  # calendar date only; drop any time-of-day
    for fmt in DATE_FORMATS:
        try:
            # Naive on purpose: cashflow dates are calendar dates, not instants.
            return datetime.strptime(date_part, fmt).date(), corrections  # noqa: DTZ007
        except ValueError:
            continue
    raise CleaningError(f"unparseable date: {raw!r}")


def clean_amount(raw: str) -> tuple[Decimal, list[str]]:
    """Parse a numeric amount, tolerating thousands separators, currency symbols,
    and accounting-style parenthesised negatives."""
    corrections: list[str] = []
    cleaned = _scrub(raw, corrections, "amount").replace(" ", "")
    negative = cleaned.startswith("(") and cleaned.endswith(")")
    if negative:
        cleaned = cleaned[1:-1]
    stripped = re.sub(r"[,€£$]", "", cleaned)
    if stripped != cleaned:
        corrections.append(f"amount: normalised {raw!r} -> {stripped!r}")
    try:
        value = Decimal(stripped)
    except InvalidOperation:
        raise CleaningError(f"unparseable amount: {raw!r}") from None
    if negative:
        value = -value
        corrections.append(f"amount: parenthesised negative {raw!r}")
    return value, corrections


def clean_currency(raw: str) -> tuple[str, list[str]]:
    """Uppercase and trim a currency code, then apply the known-typo alias map."""
    corrections: list[str] = []
    cleaned = _scrub(raw, corrections, "currency").upper()
    if cleaned != raw.strip():
        corrections.append(f"currency: normalised case {raw!r} -> {cleaned!r}")
    if cleaned in CURRENCY_ALIASES:
        fixed = CURRENCY_ALIASES[cleaned]
        corrections.append(f"currency: corrected typo {cleaned!r} -> {fixed!r}")
        cleaned = fixed
    return cleaned, corrections
