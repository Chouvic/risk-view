"""Every Pydantic model in the app: domain entities, the ingestion report, and API
responses. The ORM models these map to live in riskview/db/models.py."""

import re
from collections import Counter
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    ValidationInfo,
    field_validator,
    model_validator,
)

# --------------------------------------------------------------------------
# Shared value types
# --------------------------------------------------------------------------


class CurrencyCode(str, Enum):
    """A closed set, so a typo like "GPB" fails validation instead of becoming bad data."""

    EUR = "EUR"
    GBP = "GBP"
    USD = "USD"


class CashflowType(str, Enum):
    INVESTMENT = "Investment"
    INTEREST = "Interest"
    PRINCIPAL_REPAYMENT = "Principal Repayment"


class FrozenModel(BaseModel):
    """Frozen: validated records are cached and shared, and Pydantic does not re-validate on assignment."""

    model_config = ConfigDict(frozen=True)


# --------------------------------------------------------------------------
# Input cleaning — fix only what is unambiguous, record every fix on the list
# passed as validation context, and let anything else fail validation.
# --------------------------------------------------------------------------

JUNK_CHARS = "`'\" "

# Known source-system typos only; an unmapped bad code is rejected, not guessed.
CURRENCY_ALIASES = {"GPB": "GBP", "EURO": "EUR", "UDS": "USD"}

# A whitelist, because "03/04/2026" is a different day under day-first and month-first
# conventions and the convention comes from the source contract, never a guess.
DATE_FORMATS = ("%d/%m/%Y", "%Y-%m-%d")


def _note(info: ValidationInfo, message: str) -> None:
    if isinstance(info.context, list):
        info.context.append(f"{info.field_name}: {message}")


def _scrub(value: Any, info: ValidationInfo) -> Any:
    """Strip junk characters and collapse whitespace; non-strings (a typed Excel cell) pass through."""
    if not isinstance(value, str):
        return value
    cleaned = re.sub(r"\s+", " ", value.strip().strip(JUNK_CHARS).strip())
    if cleaned != value:
        _note(info, f"scrubbed {value!r} -> {cleaned!r}")
    return cleaned


# --------------------------------------------------------------------------
# Domain entities
# --------------------------------------------------------------------------


class Cashflow(FrozenModel):
    """A validated projected cashflow for one fund position."""

    id: int = Field(description="Row id from the client feed, kept for reconciliation with the source file.")
    fund_name: str = Field(min_length=1)
    cashflow_date: date
    cashflow_type: CashflowType
    currency: CurrencyCode = Field(description="Local currency of the cashflow.")
    amount_local: Decimal = Field(description="Negative for outflows, positive for inflows.")
    amount_base: Decimal = Field(description="Client-supplied conversion to the fund's base currency.")
    base_currency: CurrencyCode = Field(description="The fund's reporting currency.")

    @field_validator("fund_name", "cashflow_type", mode="before")
    @classmethod
    def _clean_text(cls, value: Any, info: ValidationInfo) -> Any:
        return _scrub(value, info)

    @field_validator("currency", "base_currency", mode="before")
    @classmethod
    def _clean_currency(cls, value: Any, info: ValidationInfo) -> Any:
        """An unknown code is passed through unchanged, for CurrencyCode itself to reject."""
        code = _scrub(value, info)
        if not isinstance(code, str):
            return code
        if code != code.upper():
            _note(info, f"uppercased {code!r}")
            code = code.upper()
        if code in CURRENCY_ALIASES:
            _note(info, f"corrected typo {code!r} -> {CURRENCY_ALIASES[code]!r}")
            code = CURRENCY_ALIASES[code]
        return code

    @field_validator("cashflow_date", mode="before")
    @classmethod
    def _clean_date(cls, value: Any, info: ValidationInfo) -> Any:
        text = _scrub(value, info)
        if not isinstance(text, str):
            return text
        day = re.split(r"[ T]", text, maxsplit=1)[0]
        for fmt in DATE_FORMATS:
            try:
                # Naive: cashflow dates are calendar dates, not instants.
                return datetime.strptime(day, fmt).date()  # noqa: DTZ007
            except ValueError:
                continue
        raise ValueError("unrecognised date format, expected day-first DD/MM/YYYY or ISO YYYY-MM-DD")

    @field_validator("amount_local", "amount_base", mode="before")
    @classmethod
    def _clean_amount(cls, value: Any, info: ValidationInfo) -> Any:
        text = _scrub(value, info)
        if not isinstance(text, str):
            return text
        text = text.replace(" ", "")
        if text.startswith("(") and text.endswith(")"):
            _note(info, f"read parenthesised {value!r} as negative")
            text = f"-{text[1:-1]}"
        stripped = re.sub(r"[,€£$]", "", text)
        if stripped != text:
            _note(info, f"normalised {value!r} -> {stripped!r}")
        return stripped

    @model_validator(mode="after")
    def _check_signs_and_base(self) -> "Cashflow":
        if self.cashflow_type is CashflowType.INVESTMENT:
            if self.amount_local >= 0:
                raise ValueError("Investment cashflow must be negative (an outflow)")
        elif self.amount_local <= 0:
            raise ValueError(f"{self.cashflow_type.value} cashflow must be positive (an inflow)")
        if (self.amount_local < 0) != (self.amount_base < 0):
            raise ValueError("local and base amounts must have the same sign")
        if self.currency == self.base_currency and self.amount_local != self.amount_base:
            raise ValueError("base-currency cashflow must have amount_local == amount_base")
        return self


class NavPoint(FrozenModel):
    date: date
    nav: Decimal = Field(description="PV at this date of cashflows dated on or after it.")
    open_exposure: Decimal = Field(
        description="PV of cashflows dated strictly after this date — what a hedge must cover."
    )


class NavSchedule(FrozenModel):
    fund_name: str
    currency: CurrencyCode = Field(
        description="Position currency; the fund's base currency for the fund-level schedule."
    )
    irr: float = Field(description="The discount rate applied to every point below.")
    points: tuple[NavPoint, ...] = Field(description="One point per cashflow date, chronological.")


class FxForwardTrade(FrozenModel):
    """A recommended FX forward: sell the exposure currency, buy the fund's base currency."""

    fund_name: str
    trade_date: date
    value_date: date = Field(description="Settlement date, three months after the trade date.")
    sell_currency: CurrencyCode = Field(description="The fund's non-base exposure currency.")
    buy_currency: CurrencyCode = Field(description="The fund's base currency.")
    notional_sell: Decimal = Field(
        description="coverage_ratio times the open exposure at the trade date."
    )
    coverage_ratio: float = Field(1.0, description="Fraction of the open exposure hedged.")


# --------------------------------------------------------------------------
# Ingestion boundary
# --------------------------------------------------------------------------


class RowCorrection(FrozenModel):
    line: int
    row_id: str = Field(description="Row id as supplied in the source file.")
    corrections: tuple[str, ...] = Field(description="Each fix applied to the row.")


def describe_errors(exc: ValidationError) -> tuple[str, ...]:
    """Append the offending value, which Pydantic's message omits and the data supplier needs."""
    reasons = []
    for error in exc.errors():
        if error["loc"]:
            location = ".".join(str(part) for part in error["loc"])
            reasons.append(f"{location}: {error['msg']} (got {error['input']!r})")
        else:
            reasons.append(str(error["msg"]))
    return tuple(reasons)


class RowReject(FrozenModel):
    line: int
    row_id: str = Field(description="Row id as supplied in the source file.")
    errors: tuple[str, ...] = Field(description="Each validation failure that caused the rejection.")

    @classmethod
    def from_validation_error(cls, line: int, row_id: str, exc: ValidationError) -> "RowReject":
        return cls(line=line, row_id=row_id, errors=describe_errors(exc))


class IngestionResult(FrozenModel):
    """A whole validated batch. Rejects are not represented: a batch with any is never built."""

    cashflows: tuple[Cashflow, ...] = Field(description="Rows that passed validation, corrected or not.")
    corrections: tuple[RowCorrection, ...]

    @model_validator(mode="after")
    def _check_unique_ids(self) -> "IngestionResult":
        """A repeated row id means a broken file rather than a bad row, so the whole batch fails."""
        counts = Counter(cashflow.id for cashflow in self.cashflows)
        duplicates = sorted(row_id for row_id, count in counts.items() if count > 1)
        if duplicates:
            raise ValueError(f"duplicate cashflow ids in input: {duplicates}")
        return self

    @model_validator(mode="after")
    def _check_unique_natural_keys(self) -> "IngestionResult":
        """(fund, currency, date, type) identifies a cashflow, and is a unique
        constraint at rest. Two rows sharing one is a broken file, not a row to
        drop: nothing in the data says which of the pair is the real projection.
        Failing here gives the supplier a legible message instead of a database
        IntegrityError surfacing as a 500."""
        counts = Counter(
            (cf.fund_name, cf.currency.value, cf.cashflow_date, cf.cashflow_type.value)
            for cf in self.cashflows
        )
        duplicates = sorted(str(key) for key, count in counts.items() if count > 1)
        if duplicates:
            raise ValueError(f"duplicate (fund, currency, date, type) in input: {duplicates}")
        return self

    def summary(self) -> dict[str, int]:
        return {"accepted": len(self.cashflows), "corrected": len(self.corrections)}


class VersionAction(str, Enum):
    """What one upload did to one fund's projection ledger."""

    NEW = "new"  # first projection for a fund not seen before
    REVISED = "revised"  # content changed: version N+1 minted, pointer moved
    UNCHANGED = "unchanged"  # canonical content hash matched the current version; nothing minted


class FundVersionOutcome(FrozenModel):
    """Per-fund result of one upload — what a supplier reads to see what changed."""

    fund_id: int
    fund_name: str
    action: VersionAction
    version_no: int = Field(
        description="The version now current for this fund: freshly minted, or pre-existing if unchanged."
    )


class IngestionReport(BaseModel):
    """What happened to one uploaded file — the reconciliation artefact.

    Returned by POST /ingest and stored, so GET /ingestions/{batch_id} can serve
    it again long after the upload response has been lost.
    """

    batch_id: int = Field(description="Id of the stored ingestion batch this file landed in.")
    duplicate: bool = Field(
        description=(
            "True when these exact bytes had already been ingested; the upload was a no-op and this "
            "report is the original one."
        )
    )
    summary: dict[str, int] = Field(description="Counts of accepted and corrected rows.")
    corrections: tuple[RowCorrection, ...] = Field(
        description="Rows that needed an automatic fix before they validated."
    )
    funds: tuple[FundVersionOutcome, ...] = Field(
        (),
        description=(
            "What this upload did per fund: new, revised, or unchanged. Re-served reports list only "
            "the versions the batch minted — unchanged outcomes are not stored."
        ),
    )


# --------------------------------------------------------------------------
# Analytics output
# --------------------------------------------------------------------------


class FundAnalytics(FrozenModel):
    fund_id: int
    fund_name: str
    base_currency: str
    fund_irr: float = Field(description="IRR across the fund's base-currency cashflows.")
    currency_irr: dict[str, float] = Field(description="IRR per position currency.")
    nav_schedules: dict[str, NavSchedule] = Field(description="Per position currency, in local terms.")
    fund_nav_schedule: NavSchedule = Field(description="Whole fund, in base-currency terms.")
    hedges: tuple[FxForwardTrade, ...]


# --------------------------------------------------------------------------
# API responses. Entities already shaped like their response (NavSchedule,
# FxForwardTrade) are served directly rather than duplicated here.
# --------------------------------------------------------------------------


class FundSummary(BaseModel):
    fund_id: int
    name: str
    base_currency: str
    currencies: list[str] = Field(description="Position currencies, including the base currency if held.")
    cashflow_count: int = Field(description="Validated cashflows currently stored for this fund.")
    version_no: int = Field(description="The projection version reads serve by default.")
    source_file: str | None = Field(
        default=None,
        description="File the fund's current projection version was ingested from, if known.",
    )


class VersionInfo(BaseModel):
    """One entry of a fund's projection history."""

    version_no: int
    batch_id: int = Field(description="The upload that minted this version.")
    created_at: datetime
    cashflow_count: int
    content_hash: str = Field(description="Canonical content hash — why this version was (or wasn't) minted.")
    is_current: bool = Field(description="True for the version reads serve by default.")


class CashflowSnapshot(BaseModel):
    """One cashflow as it appears on one side of a version diff, named by its
    natural key — row ids are reconciliation metadata and play no part here."""

    currency: str
    cashflow_date: date
    cashflow_type: str
    amount_local: Decimal
    amount_base: Decimal


class CashflowAmountChange(BaseModel):
    """A cashflow present in both versions whose amounts moved."""

    currency: str
    cashflow_date: date
    cashflow_type: str
    old_amount_local: Decimal
    new_amount_local: Decimal
    old_amount_base: Decimal
    new_amount_base: Decimal


class IrrChange(BaseModel):
    old: float | None = Field(description="None when the position did not exist in the old version.")
    new: float | None = Field(description="None when the position no longer exists in the new version.")


class HedgeChange(BaseModel):
    """A hedge roll whose recommended notional differs between two versions."""

    sell_currency: str
    trade_date: date
    value_date: date
    old_notional: Decimal | None = Field(description="None when the old version had no trade at this roll.")
    new_notional: Decimal | None = Field(description="None when the roll disappears in the new version.")


class VersionDiff(BaseModel):
    """What changed between two projection versions — the rows, and what the
    change did to IRR and the hedge programme."""

    fund_id: int
    fund_name: str
    from_version: int
    to_version: int
    added: tuple[CashflowSnapshot, ...]
    removed: tuple[CashflowSnapshot, ...]
    changed: tuple[CashflowAmountChange, ...]
    fund_irr: IrrChange
    currency_irr: dict[str, IrrChange] = Field(
        description="Only currencies whose IRR actually moved; an unchanged position does not appear."
    )
    hedge_changes: tuple[HedgeChange, ...] = Field(
        description="Only rolls whose notional differs; an unchanged hedge programme is an empty tuple."
    )


class FundIrr(BaseModel):
    fund_id: int
    name: str
    base_currency: str
    fund_irr: float = Field(description="IRR across the fund's base-currency cashflows.")
    currency_irr: dict[str, float] = Field(description="IRR per position currency.")


class NavBundle(BaseModel):
    fund: NavSchedule = Field(description="Whole fund, in base-currency terms.")
    by_currency: dict[str, NavSchedule] = Field(description="Per position currency, in local terms.")
