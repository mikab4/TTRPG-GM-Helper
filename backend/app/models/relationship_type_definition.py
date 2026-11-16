from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, json_document

if TYPE_CHECKING:
    from app.models.campaign import Campaign


class RelationshipTypeDefinition(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "relationship_type_definitions"
    __table_args__ = (
        UniqueConstraint(
            "campaign_id",
            "key",
            name="uq_relationship_type_definitions_campaign_key",
        ),
        CheckConstraint(
            """
            (
                is_symmetric = true
                AND reverse_label IS NULL
            )
            OR
            (
                is_symmetric = false
                AND reverse_label IS NOT NULL
                AND trim(reverse_label) <> ''
            )
            """,
            name="ck_relationship_type_definitions_direction_labels",
        ),
    )

    campaign_id: Mapped[UUID] = mapped_column(
        Uuid(),
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
    )
    key: Mapped[str] = mapped_column(Text, nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    family: Mapped[str] = mapped_column(Text, nullable=False)
    reverse_label: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_symmetric: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    allowed_source_types: Mapped[list[str]] = mapped_column(
        json_document,
        nullable=False,
        default=list,
        server_default=text("'[]'::jsonb"),
    )
    allowed_target_types: Mapped[list[str]] = mapped_column(
        json_document,
        nullable=False,
        default=list,
        server_default=text("'[]'::jsonb"),
    )

    campaign: Mapped["Campaign"] = relationship(back_populates="relationship_type_definitions")
