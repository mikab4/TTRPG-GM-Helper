from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.entity import Entity
    from app.models.extraction import ExtractionCandidate, ExtractionJob
    from app.models.owner import Owner
    from app.models.relationship import Relationship
    from app.models.relationship_type_definition import RelationshipTypeDefinition
    from app.models.session import Session
    from app.models.source_asset import SourceAsset


class Campaign(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "campaigns"
    __table_args__ = (UniqueConstraint("owner_id", "name", name="uq_campaign_owner_name"),)

    owner_id: Mapped[UUID] = mapped_column(
        Uuid(),
        ForeignKey("owners.id", ondelete="RESTRICT"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    owner: Mapped["Owner"] = relationship(back_populates="campaigns", lazy="select")
    sessions: Mapped[list["Session"]] = relationship(
        back_populates="campaign",
        lazy="select",
        passive_deletes="all",
    )
    source_assets: Mapped[list["SourceAsset"]] = relationship(
        back_populates="campaign",
        lazy="select",
        passive_deletes="all",
    )
    extraction_jobs: Mapped[list["ExtractionJob"]] = relationship(
        back_populates="campaign",
        lazy="select",
        passive_deletes="all",
    )
    extraction_candidates: Mapped[list["ExtractionCandidate"]] = relationship(
        back_populates="campaign",
        lazy="select",
        passive_deletes="all",
    )
    entities: Mapped[list["Entity"]] = relationship(
        back_populates="campaign",
        lazy="select",
        passive_deletes="all",
    )
    relationships: Mapped[list["Relationship"]] = relationship(
        back_populates="campaign",
        lazy="select",
        passive_deletes="all",
    )
    relationship_type_definitions: Mapped[list["RelationshipTypeDefinition"]] = relationship(
        back_populates="campaign",
        lazy="select",
        passive_deletes="all",
    )
