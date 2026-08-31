"""All Pydantic models in one module, grouped by role — the single source of
truth for shapes. ("schemas" = validation/serialisation, the FastAPI ecosystem
convention; the ORM models these map to live in riskview/db/models.py.)

A single file is the right size here — the official FastAPI full-stack template
does the same. When the app grows, the groups below are the natural split lines:
each service takes its own section (per-domain schemas, the Netflix Dispatch /
Polar layout) without any renaming.
"""

from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

# --------------------------------------------------------------------------
# Shared value types
# --------------------------------------------------------------------------


class CurrencyCode(str, Enum):
    """Currencies the platform trades. A closed set (rather than any 3-letter
    string) is what turns a typo like "GPB" into a validation error instead
    of silent bad data. Only the currencies seen in the client feed are
    listed; add a member here when a new currency actually needs support."""

    EUR = "EUR"
    GBP = "GBP"
    USD = "USD"


class FrozenModel(BaseModel):
    """Base for records that must not change once validated.

    Two reasons, not style: (1) Pydantic does not re-validate on assignment by
    default, so a mutable record could be edited into a state its own validators
    reject — freezing closes that hole; (2) validated batches and analytics
    results are shared between callers (batches, test fixtures), so one
    caller mutating an instance would corrupt it for every other reader.
    Transient carriers with no invariants (RawCashflowRow, API responses) stay
    plain BaseModel. Note freezing is shallow — it blocks attribute assignment,
    which is the accident worth preventing.
    """

    model_config = ConfigDict(frozen=True)


class CashflowType(str, Enum):
    """The three cashflow kinds in the source feed."""

    INVESTMENT = "Investment"
    INTEREST = "Interest"
    PRINCIPAL_REPAYMENT = "Principal Repayment"


# --------------------------------------------------------------------------
# Domain entities — the business objects every service speaks
# --------------------------------------------------------------------------


class Cashflow(FrozenModel):
    """A validated projected cashflow for one fund position.

    Sign convention: outflows (Investment) are negative, inflows (Interest,
    Principal Repayment) are positive — enforced below.
    """

    id: int = Field(description="Row id from the client feed, kept for reconciliation with the source file.")
    fund_name: str = Field(description="Name of the fund this cashflow belongs to.")
    cashflow_date: date = Field(description="Calendar date the cashflow occurs.")
    cashflow_type: CashflowType = Field(description="Investment, Interest, or Principal Repayment.")
    currency: CurrencyCode = Field(description="Local currency of the cashflow amount.")
    amount_local: Decimal = Field(
        description="Amount in the local currency; negative for outflows, positive for inflows."
    )
    amount_base: Decimal = Field(
        description="Amount converted to the fund's base currency, as supplied by the client."
    )
    base_currency: CurrencyCode = Field(description="The fund's reporting currency.")

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
    """NAV at one schedule date. By construction NAV(0) = 0 and NAV at the final
    date equals the position's terminal value — the brief's two sanity checks."""

    date: Annotated[date, Field(description="Schedule date this point represents.")]
    nav: Decimal = Field(
        description="Present value, at this date, of cashflows dated on or after it, discounted at the position's IRR."
    )
    open_exposure: Decimal = Field(
        description="Present value of cashflows dated strictly after this date — the exposure a hedge must still cover."
    )


class NavSchedule(FrozenModel):
    """NAV per schedule date for one fund position (or the whole fund in base currency)."""

    fund_name: str = Field(description="Fund this schedule belongs to.")
    currency: CurrencyCode = Field(
        description="Position currency; the fund's base currency for the fund-level schedule."
    )
    irr: float = Field(
        description="The position's internal rate of return — the discount rate for every point below."
    )
    points: tuple[NavPoint, ...] = Field(description="One point per cashflow date, in chronological order.")


class FxForwardTrade(FrozenModel):
    """A recommended FX forward: sell the exposure currency, buy the fund's base currency, rolled every 3 months."""

    fund_name: str = Field(description="Fund the hedge is recommended for.")
    trade_date: date = Field(description="Date the forward is entered into — a NAV schedule date.")
    value_date: date = Field(description="Settlement date, three months after the trade date.")
    sell_currency: CurrencyCode = Field(
        description="Currency sold forward — the fund's non-base exposure currency."
    )
    buy_currency: CurrencyCode = Field(description="Currency bought forward — the fund's base currency.")
    notional_sell: Decimal = Field(
        description="Amount of sell_currency hedged: coverage_ratio times the open exposure at the trade date."
    )
    coverage_ratio: float = Field(
        1.0, description="Fraction of the open exposure hedged; 1.0 covers it in full."
    )


# --------------------------------------------------------------------------
# Ingestion boundary — raw input and the ingestion outcome
# --------------------------------------------------------------------------


class RawCashflowRow(BaseModel):
    """One source row, verbatim. All strings; cleaning happens before Cashflow validation."""

    id: str
    fund_name: str
    date: str
    cashflow_type: str
    local_currency: str
    amount_local: str
    amount_base: str
    base_currency: str


class RowCorrection(FrozenModel):
    """A row that was accepted after an unambiguous automatic fix."""

    line: int = Field(description="Line number in the source file.")
    row_id: str = Field(description="Row id as supplied in the source file.")
    corrections: tuple[str, ...] = Field(
        description="Each fix applied, e.g. a currency alias resolved or a date format normalised."
    )


class RowReject(FrozenModel):
    """A row that could not be validated; kept for reconciliation with the data supplier."""

    line: int = Field(description="Line number in the source file.")
    row_id: str = Field(description="Row id as supplied in the source file.")
    errors: tuple[str, ...] = Field(description="Each validation failure that caused the row to be rejected.")


class IngestionResult(FrozenModel):
    """Validated records plus a full account of what was fixed or dropped."""

    cashflows: tuple[Cashflow, ...] = Field(description="Rows that passed validation, corrected or not.")
    corrections: tuple[RowCorrection, ...] = Field(
        description="Rows that needed an automatic fix before they validated."
    )
    rejects: tuple[RowReject, ...] = Field(description="Rows that failed validation and were dropped.")

    def summary(self) -> dict[str, int]:
        return {
            "accepted": len(self.cashflows),
            "corrected": len(self.corrections),
            "rejected": len(self.rejects),
        }


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
    summary: dict[str, int] = Field(description="Counts of accepted, corrected, and rejected rows.")
    corrections: tuple[RowCorrection, ...] = Field(
        description="Rows that needed an automatic fix before they validated."
    )
    rejects: tuple[RowReject, ...] = Field(description="Rows that failed validation and were dropped.")


# --------------------------------------------------------------------------
# Analytics output — the full derived picture for one fund
# --------------------------------------------------------------------------


class FundAnalytics(FrozenModel):
    """The full derived picture for one fund: IRR, NAV schedules, and hedge recommendations."""

    fund_id: int = Field(description="Store-assigned fund id.")
    fund_name: str = Field(description="Fund name.")
    base_currency: str = Field(description="The fund's reporting currency.")
    fund_irr: float = Field(description="IRR across the fund's base-currency cashflows.")
    currency_irr: dict[str, float] = Field(description="IRR per position currency, keyed by ISO 4217 code.")
    nav_schedules: dict[str, NavSchedule] = Field(
        description="NAV schedule per position currency, in local-currency terms."
    )
    fund_nav_schedule: NavSchedule = Field(
        description="NAV schedule for the whole fund, in base-currency terms."
    )
    hedges: tuple[FxForwardTrade, ...] = Field(
        description="Recommended FX forward trades across all non-base exposures."
    )


# --------------------------------------------------------------------------
# API responses — the wire contract, where it differs from the domain shape.
# Entities shaped exactly like their response (NavSchedule, FxForwardTrade)
# are served directly; a class here would be duplication with no seam.
# --------------------------------------------------------------------------


class FundSummary(BaseModel):
    """One row of the /funds listing."""

    fund_id: int = Field(description="Store-assigned fund id.")
    name: str = Field(description="Fund name.")
    base_currency: str = Field(description="The fund's reporting currency.")
    currencies: list[str] = Field(
        description="Position currencies for this fund; the base currency is included if the fund holds a base-currency position."
    )
    cashflow_count: int = Field(description="Number of validated cashflows currently stored for this fund.")


class FundIrr(BaseModel):
    """IRR breakdown for one fund."""

    fund_id: int = Field(description="Store-assigned fund id.")
    name: str = Field(description="Fund name.")
    base_currency: str = Field(description="The fund's reporting currency.")
    fund_irr: float = Field(description="IRR across the fund's base-currency cashflows.")
    currency_irr: dict[str, float] = Field(description="IRR per position currency, keyed by ISO 4217 code.")


class NavBundle(BaseModel):
    """Fund-level NAV in base currency plus each per-currency schedule."""

    fund: NavSchedule = Field(description="NAV schedule for the whole fund, in base-currency terms.")
    by_currency: dict[str, NavSchedule] = Field(
        description="NAV schedule per position currency, in local-currency terms."
    )
