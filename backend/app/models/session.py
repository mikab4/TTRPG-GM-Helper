from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.campaign import Campaign
    from app.models.source_asset import SourceAsset


class Session(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "sessions"
    __table_args__ = (
        UniqueConstraint("campaign_id", "session_number", name="uq_sessions_campaign_number"),
        UniqueConstraint("id", "campaign_id", name="uq_sessions_id_campaign"),
        CheckConstraint(
            "session_number IS NOT NULL OR session_label IS NOT NULL",
            name="ck_sessions_number_or_label",
        ),
        Index("ix_sessions_campaign_id", "campaign_id"),
    )

    campaign_id: Mapped[UUID] = mapped_column(
        Uuid(),
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
    )
    session_number: Mapped[int | None] = mapped_column(nullable=True)
    session_label: Mapped[str | None] = mapped_column(Text, nullable=True)
    played_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    campaign: Mapped["Campaign"] = relationship(back_populates="sessions", lazy="select")
    source_assets: Mapped[list["SourceAsset"]] = relationship(
        back_populates="session",
        lazy="select",
        overlaps="campaign,source_assets",
    )
