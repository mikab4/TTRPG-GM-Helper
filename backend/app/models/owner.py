from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.campaign import Campaign


class Owner(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "owners"

    email: Mapped[str | None] = mapped_column(Text, nullable=True)
    display_name: Mapped[str | None] = mapped_column(Text, nullable=True)

    campaigns: Mapped[list["Campaign"]] = relationship(
        back_populates="owner",
        lazy="select",
    )
