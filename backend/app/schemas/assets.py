from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.enums import (
    SourceAssetLifecycleStatus,
    SourceAssetStorageStatus,
    SourceAssetTruthStatus,
    normalize_str_enum_value,
)
from app.schemas.types import OptionalNonBlankString


class AssetCreateFormData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: OptionalNonBlankString = None
    truth_status: SourceAssetTruthStatus = SourceAssetTruthStatus.UNCERTAIN
    session_id: UUID | None = None

    @field_validator("truth_status", mode="before")
    @classmethod
    def validate_truth_status(cls, truth_status: str | SourceAssetTruthStatus) -> SourceAssetTruthStatus:
        if isinstance(truth_status, SourceAssetTruthStatus):
            return truth_status
        return normalize_str_enum_value(SourceAssetTruthStatus, truth_status)


class AssetUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: OptionalNonBlankString = None
    truth_status: SourceAssetTruthStatus | None = None
    session_id: UUID | None = None
    metadata: dict[str, object] | None = None

    @field_validator("truth_status", mode="before")
    @classmethod
    def validate_truth_status(
        cls,
        truth_status: str | SourceAssetTruthStatus | None,
    ) -> SourceAssetTruthStatus | None:
        if truth_status is None:
            return truth_status
        if isinstance(truth_status, SourceAssetTruthStatus):
            return truth_status
        return normalize_str_enum_value(SourceAssetTruthStatus, truth_status)

    @model_validator(mode="after")
    def validate_update_fields(self) -> "AssetUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one asset field must be provided.")

        if self.metadata is None and "metadata" in self.model_fields_set:
            raise ValueError("Asset metadata cannot be null.")

        return self


class AssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    campaign_id: UUID
    session_id: UUID | None
    title: str | None
    truth_status: str
    media_type: str
    original_filename: str
    file_size_bytes: int
    lifecycle_status: SourceAssetLifecycleStatus
    storage_status: SourceAssetStorageStatus
    metadata: dict[str, object] = Field(
        validation_alias="metadata_",
        serialization_alias="metadata",
    )
    created_at: datetime
    updated_at: datetime
