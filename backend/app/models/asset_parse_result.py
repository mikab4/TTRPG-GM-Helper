from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.enums import ParseStatus
from app.models.base import Base, UUIDPrimaryKeyMixin, allowed_values_check, json_document, utcnow

if TYPE_CHECKING:
    from app.models.source_asset import SourceAsset


class AssetParseResult(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "asset_parse_results"
    __table_args__ = (
        ForeignKeyConstraint(
            ["asset_id"],
            ["source_assets.id"],
            ondelete="CASCADE",
            name="fk_asset_parse_results_asset_id",
        ),
        UniqueConstraint(
            "asset_id",
            "parser_kind",
            "parser_version",
            "source_checksum",
            name="uq_asset_parse_results_asset_parser_checksum",
        ),
        allowed_values_check("parse_status", ParseStatus, name="ck_asset_parse_results_parse_status_allowed"),
        Index("ix_asset_parse_results_asset_id", "asset_id"),
    )

    asset_id: Mapped[UUID] = mapped_column(Uuid(), nullable=False)
    parser_kind: Mapped[str] = mapped_column(Text, nullable=False)
    parser_version: Mapped[str] = mapped_column(Text, nullable=False)
    source_checksum: Mapped[str] = mapped_column(Text, nullable=False)
    parse_status: Mapped[str] = mapped_column(Text, nullable=False)
    inline_raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    inline_structured_content: Mapped[dict[str, object] | None] = mapped_column(
        json_document,
        nullable=True,
    )
    artifact_storage_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    artifact_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    warnings: Mapped[list[object]] = mapped_column(
        json_document,
        nullable=False,
        default=list,
        server_default=text("'[]'::jsonb"),
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    parsed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )

    asset: Mapped["SourceAsset"] = relationship(back_populates="parse_results", lazy="select")
