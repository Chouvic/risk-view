"""Declarative base and the metadata naming convention.

The naming convention is not cosmetic. SQLite cannot ALTER a constraint, so
Alembic rebuilds the table (batch mode) and needs a deterministic name for every
constraint it re-creates. Adding this after the first migration would not rename
constraints in databases that already exist, which is why it lives here from
revision one.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Any, ClassVar

from sqlalchemy import Date, MetaData, String
from sqlalchemy.orm import DeclarativeBase

from riskview.db.types import ExactDecimal, UtcDateTime

NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_N_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)

    # Every annotated column of these types gets the right storage without
    # repeating the type on each mapped_column.
    type_annotation_map: ClassVar[dict[Any, Any]] = {
        Decimal: ExactDecimal,
        datetime: UtcDateTime,
        date: Date,
        str: String,
    }
