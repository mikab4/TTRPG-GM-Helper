from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator

from app.schemas.types import OptionalNonBlankString


class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_number: int | None = None
    session_label: OptionalNonBlankString = None
    played_on: date | None = None
    summary: OptionalNonBlankString = None

    @model_validator(mode="after")
    def validate_session_identity(self) -> "SessionCreate":
        if self.session_number is None and self.session_label is None:
            raise ValueError("Session number or session label must be provided.")
        return self


class SessionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_number: int | None = None
    session_label: OptionalNonBlankString = None
    played_on: date | None = None
    summary: OptionalNonBlankString = None

    @model_validator(mode="after")
    def validate_update_fields(self) -> "SessionUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one session field must be provided.")
        return self


class SessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    campaign_id: UUID
    session_number: int | None
    session_label: str | None
    played_on: date | None
    summary: str | None
    created_at: datetime
    updated_at: datetime
