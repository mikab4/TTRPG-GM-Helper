from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from uuid import UUID, uuid7

from sqlalchemy import JSON, CheckConstraint, DateTime, Uuid, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(UTC)


json_document = JSON().with_variant(JSONB, "postgresql")


class Base(DeclarativeBase):
    pass


def allowed_values_check(column_name: str, allowed_values_enum: type[StrEnum], *, name: str) -> CheckConstraint:
    allowed_values_sql = ", ".join(f"'{allowed_value.value}'" for allowed_value in allowed_values_enum)
    return CheckConstraint(f"{column_name} IN ({allowed_values_sql})", name=name)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )


class UUIDPrimaryKeyMixin:
    id: Mapped[UUID] = mapped_column(Uuid(), primary_key=True, default=uuid7)
