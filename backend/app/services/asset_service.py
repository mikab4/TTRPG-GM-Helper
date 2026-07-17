from __future__ import annotations

from pathlib import Path
from uuid import UUID, uuid4

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.enums import ParseStatus
from app.models import Session as CampaignSession
from app.models import SourceAsset
from app.schemas import AssetCreateFormData, AssetUpdate
from app.services.asset_storage import AssetStorage
from app.services.campaign_lookup import ensure_campaign_exists
from app.services.errors import ConflictError, NotFoundError, UnsupportedMediaTypeError

SUPPORTED_MEDIA_TYPES = {
    "application/pdf",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/webp",
    "text/csv",
    "text/markdown",
    "text/plain",
}
UPLOAD_READ_CHUNK_SIZE = 1024 * 1024


def create_asset(
    db_session: Session,
    *,
    campaign_id: UUID,
    asset_create: AssetCreateFormData,
    upload_file: UploadFile,
    asset_storage: AssetStorage,
    max_upload_bytes: int = 25 * 1024 * 1024,
) -> SourceAsset:
    ensure_campaign_exists(db_session, campaign_id)
    _validate_session_link(
        db_session,
        campaign_id=campaign_id,
        session_id=asset_create.session_id,
    )

    media_type = upload_file.content_type or "application/octet-stream"
    if media_type not in SUPPORTED_MEDIA_TYPES:
        raise UnsupportedMediaTypeError("Unsupported asset media type.")

    original_filename = upload_file.filename or f"upload-{uuid4()}"
    storage_key = _build_storage_key(campaign_id=campaign_id, original_filename=original_filename)
    stored_upload_metadata = asset_storage.store_upload(
        upload_file=upload_file,
        storage_key=storage_key,
        max_upload_bytes=max_upload_bytes,
    )

    created_asset = SourceAsset(
        campaign_id=campaign_id,
        session_id=asset_create.session_id,
        title=asset_create.title or Path(original_filename).stem,
        truth_status=asset_create.truth_status.value,
        media_type=media_type,
        original_filename=original_filename,
        file_size_bytes=stored_upload_metadata.file_size_bytes,
        checksum=stored_upload_metadata.checksum,
        storage_key=storage_key,
        parse_status=ParseStatus.PENDING.value,
        last_parsed_at=None,
    )
    db_session.add(created_asset)
    try:
        db_session.commit()
    except Exception:
        db_session.rollback()
        asset_storage.delete(storage_key=storage_key)
        raise
    db_session.refresh(created_asset)
    return created_asset


def list_assets(
    db_session: Session,
    *,
    campaign_id: UUID,
) -> list[SourceAsset]:
    ensure_campaign_exists(db_session, campaign_id)
    statement = (
        select(SourceAsset)
        .where(SourceAsset.campaign_id == campaign_id)
        .order_by(SourceAsset.created_at.desc(), SourceAsset.id)
    )
    return list(db_session.scalars(statement))


def get_asset(
    db_session: Session,
    *,
    campaign_id: UUID,
    asset_id: UUID,
) -> SourceAsset:
    stored_asset = db_session.scalar(
        select(SourceAsset).where(
            SourceAsset.id == asset_id,
            SourceAsset.campaign_id == campaign_id,
        )
    )
    if stored_asset is None:
        raise NotFoundError("Source asset not found.")
    return stored_asset


def update_asset(
    db_session: Session,
    *,
    campaign_id: UUID,
    asset_id: UUID,
    asset_update: AssetUpdate,
) -> SourceAsset:
    stored_asset = get_asset(
        db_session,
        campaign_id=campaign_id,
        asset_id=asset_id,
    )
    update_fields = asset_update.model_dump(exclude_unset=True)
    if "session_id" in update_fields:
        _validate_session_link(
            db_session,
            campaign_id=campaign_id,
            session_id=update_fields["session_id"],
        )
    if "metadata" in update_fields:
        stored_asset.metadata_ = update_fields.pop("metadata")
    if "truth_status" in update_fields:
        update_fields["truth_status"] = update_fields["truth_status"].value

    for field_name, field_value in update_fields.items():
        setattr(stored_asset, field_name, field_value)

    db_session.commit()
    db_session.refresh(stored_asset)
    return stored_asset


def delete_asset(
    db_session: Session,
    *,
    campaign_id: UUID,
    asset_id: UUID,
    asset_storage: AssetStorage,
) -> None:
    stored_asset = get_asset(
        db_session,
        campaign_id=campaign_id,
        asset_id=asset_id,
    )
    db_session.delete(stored_asset)
    try:
        db_session.commit()
    except IntegrityError as exc:
        db_session.rollback()
        raise ConflictError(
            "Source asset cannot be deleted while provenance-bearing records still reference it."
        ) from exc
    asset_storage.delete(storage_key=stored_asset.storage_key)


def _validate_session_link(
    db_session: Session,
    *,
    campaign_id: UUID,
    session_id: UUID | None,
) -> None:
    if session_id is None:
        return

    linked_session_id = db_session.scalar(
        select(CampaignSession.id).where(
            CampaignSession.id == session_id,
            CampaignSession.campaign_id == campaign_id,
        )
    )
    if linked_session_id is None:
        raise NotFoundError("Session not found.")


def _build_storage_key(*, campaign_id: UUID, original_filename: str) -> str:
    sanitized_filename = Path(original_filename).name
    return f"source-assets/{campaign_id}/{uuid4()}-{sanitized_filename}"
