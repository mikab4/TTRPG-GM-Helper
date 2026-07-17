from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, json_document

if TYPE_CHECKING:
    from app.models.asset_parse_result import AssetParseResult
    from app.models.campaign import Campaign
    from app.models.entity import Entity
    from app.models.extraction import ExtractionJob
    from app.models.relationship import Relationship
    from app.models.session import Session


class SourceAsset(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "source_assets"
    __table_args__ = (
        UniqueConstraint("id", "campaign_id", name="uq_source_assets_id_campaign"),
        ForeignKeyConstraint(
            ["session_id", "campaign_id"],
            ["sessions.id", "sessions.campaign_id"],
            ondelete="RESTRICT",
            name="fk_source_assets_session_campaign",
        ),
        Index("ix_source_assets_campaign_id", "campaign_id"),
        Index("ix_source_assets_session_id_campaign_id", "session_id", "campaign_id"),
    )

    campaign_id: Mapped[UUID] = mapped_column(
        Uuid(),
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
    )
    session_id: Mapped[UUID | None] = mapped_column(Uuid(), nullable=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    truth_status: Mapped[str] = mapped_column(Text, nullable=False)
    media_type: Mapped[str] = mapped_column(Text, nullable=False)
    original_filename: Mapped[str] = mapped_column(Text, nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    checksum: Mapped[str] = mapped_column(Text, nullable=False)
    storage_key: Mapped[str] = mapped_column(Text, nullable=False)
    lifecycle_status: Mapped[str] = mapped_column(Text, nullable=False)
    storage_status: Mapped[str] = mapped_column(Text, nullable=False)
    delete_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delete_last_error_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delete_last_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    parse_status: Mapped[str] = mapped_column(Text, nullable=False)
    last_parsed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_: Mapped[dict[str, object]] = mapped_column(
        "metadata",
        json_document,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )

    campaign: Mapped["Campaign"] = relationship(
        back_populates="source_assets",
        lazy="select",
        overlaps="session,source_assets",
    )
    session: Mapped["Session | None"] = relationship(
        back_populates="source_assets",
        lazy="select",
        overlaps="campaign,source_assets",
    )
    extraction_jobs: Mapped[list["ExtractionJob"]] = relationship(
        back_populates="source_asset",
        lazy="select",
        overlaps="campaign,extraction_jobs",
    )
    entities: Mapped[list["Entity"]] = relationship(
        back_populates="source_asset",
        lazy="select",
        overlaps="campaign,entities",
    )
    relationships: Mapped[list["Relationship"]] = relationship(
        back_populates="source_asset",
        lazy="select",
        overlaps="campaign,relationships",
    )
    parse_results: Mapped[list["AssetParseResult"]] = relationship(
        back_populates="asset",
        lazy="select",
        cascade="all, delete-orphan",
        overlaps="campaign,parse_results",
    )
