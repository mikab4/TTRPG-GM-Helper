from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid7

from sqlalchemy import JSON, DateTime, Uuid, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(UTC)


json_document = JSON().with_variant(JSONB, "postgresql")


class Base(DeclarativeBase):
    pass


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
