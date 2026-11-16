from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
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

from app.models.base import Base, UUIDPrimaryKeyMixin, json_document, utcnow

if TYPE_CHECKING:
    from app.models.campaign import Campaign
    from app.models.source_asset import SourceAsset


class ExtractionJob(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "extraction_jobs"
    __table_args__ = (
        UniqueConstraint("id", "campaign_id", name="uq_extraction_job_id_campaign"),
        ForeignKeyConstraint(
            ["source_asset_id", "campaign_id"],
            ["source_assets.id", "source_assets.campaign_id"],
            ondelete="CASCADE",
            name="fk_extraction_jobs_source_asset_campaign",
        ),
        Index("ix_extraction_jobs_campaign_id", "campaign_id"),
        Index(
            "ix_extraction_jobs_source_asset_id_campaign_id",
            "source_asset_id",
            "campaign_id",
        ),
    )

    campaign_id: Mapped[UUID] = mapped_column(
        Uuid(),
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
    )
    source_asset_id: Mapped[UUID] = mapped_column(
        Uuid(),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(Text, nullable=False)
    extractor_kind: Mapped[str] = mapped_column(Text, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    campaign: Mapped["Campaign"] = relationship(back_populates="extraction_jobs", lazy="select")
    source_asset: Mapped["SourceAsset"] = relationship(
        back_populates="extraction_jobs",
        lazy="select",
        overlaps="campaign,extraction_jobs",
    )
    candidates: Mapped[list["ExtractionCandidate"]] = relationship(
        back_populates="extraction_job",
        lazy="select",
        overlaps="extraction_candidates",
    )


class ExtractionCandidate(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "extraction_candidates"
    __table_args__ = (
        ForeignKeyConstraint(
            ["extraction_job_id", "campaign_id"],
            ["extraction_jobs.id", "extraction_jobs.campaign_id"],
            ondelete="CASCADE",
            name="fk_extraction_candidates_job_campaign",
        ),
        Index("ix_extraction_candidates_campaign_id", "campaign_id"),
        Index(
            "ix_extraction_candidates_extraction_job_id_campaign_id",
            "extraction_job_id",
            "campaign_id",
        ),
    )

    campaign_id: Mapped[UUID] = mapped_column(
        Uuid(),
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
    )
    extraction_job_id: Mapped[UUID] = mapped_column(
        Uuid(),
        nullable=False,
    )
    candidate_type: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict[str, object]] = mapped_column(json_document, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    provenance_excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    provenance_data: Mapped[dict[str, object]] = mapped_column(
        json_document,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
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

    campaign: Mapped["Campaign"] = relationship(
        back_populates="extraction_candidates",
        lazy="select",
        overlaps="candidates",
    )
    extraction_job: Mapped["ExtractionJob"] = relationship(
        back_populates="candidates",
        lazy="select",
        overlaps="campaign,extraction_candidates",
    )
