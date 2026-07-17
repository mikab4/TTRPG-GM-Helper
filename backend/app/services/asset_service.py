from __future__ import annotations

from pathlib import Path
from uuid import UUID, uuid4

from fastapi import UploadFile
from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.enums import ParseStatus, SourceAssetLifecycleStatus, SourceAssetStorageStatus
from app.models import Entity, ExtractionJob, Relationship, SourceAsset
from app.models import Session as CampaignSession
from app.models.base import utcnow
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
        lifecycle_status=SourceAssetLifecycleStatus.ACTIVE.value,
        storage_status=SourceAssetStorageStatus.AVAILABLE.value,
        delete_started_at=None,
        delete_last_error_at=None,
        delete_last_error_message=None,
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
    deleting_asset = _begin_asset_delete(
        db_session,
        campaign_id=campaign_id,
        asset_id=asset_id,
    )
    try:
        asset_storage.delete(storage_key=deleting_asset.storage_key)
    except Exception as exc:
        _record_delete_failure(
            db_session,
            campaign_id=campaign_id,
            asset_id=asset_id,
            storage_status=SourceAssetStorageStatus.AVAILABLE,
            error_message="Source asset delete could not remove the backing file.",
        )
        raise ConflictError("Source asset delete could not remove the backing file.") from exc

    try:
        _finalize_asset_delete(
            db_session,
            campaign_id=campaign_id,
            asset_id=asset_id,
        )
    except Exception as exc:
        _raise_delete_recovery_conflict(
            db_session,
            campaign_id=campaign_id,
            asset_id=asset_id,
            cause=exc,
        )


def retry_deleting_assets(
    db_session: Session,
    *,
    asset_storage: AssetStorage,
) -> int:
    deleting_asset_ids = [
        deleting_asset_id
        for deleting_asset_id in db_session.scalars(
            select(SourceAsset.id)
            .where(SourceAsset.lifecycle_status == SourceAssetLifecycleStatus.DELETING.value)
            .order_by(SourceAsset.delete_started_at.asc().nullsfirst(), SourceAsset.id)
        )
    ]
    deleted_asset_count = 0

    for deleting_asset_id in deleting_asset_ids:
        deleting_asset = get_asset(
            db_session,
            campaign_id=_get_asset_campaign_id(db_session, asset_id=deleting_asset_id),
            asset_id=deleting_asset_id,
        )
        try:
            asset_storage.delete(storage_key=deleting_asset.storage_key)
        except Exception:
            _record_delete_failure(
                db_session,
                campaign_id=deleting_asset.campaign_id,
                asset_id=deleting_asset.id,
                storage_status=SourceAssetStorageStatus.AVAILABLE,
                error_message="Source asset delete could not remove the backing file.",
            )
            continue

        try:
            _finalize_asset_delete(
                db_session,
                campaign_id=deleting_asset.campaign_id,
                asset_id=deleting_asset.id,
            )
        except Exception:
            _record_delete_failure(
                db_session,
                campaign_id=deleting_asset.campaign_id,
                asset_id=deleting_asset.id,
                storage_status=SourceAssetStorageStatus.MISSING,
                error_message="Asset file is unavailable.",
            )
            continue

        deleted_asset_count += 1

    return deleted_asset_count


def require_asset_file_available(
    db_session: Session,
    *,
    campaign_id: UUID,
    asset_id: UUID,
) -> SourceAsset:
    stored_asset = get_asset(
        db_session,
        campaign_id=campaign_id,
        asset_id=asset_id,
    )
    if stored_asset.storage_status == SourceAssetStorageStatus.MISSING.value:
        raise ConflictError("Asset file is unavailable.")
    return stored_asset


def ensure_asset_accepts_provenance_reference(
    db_session: Session,
    *,
    campaign_id: UUID,
    source_asset_id: UUID | None,
) -> None:
    if source_asset_id is None:
        return

    stored_asset = db_session.scalar(
        select(SourceAsset).where(
            SourceAsset.id == source_asset_id,
            SourceAsset.campaign_id == campaign_id,
        )
    )
    if stored_asset is None:
        raise NotFoundError("Source asset not found.")
    if stored_asset.lifecycle_status != SourceAssetLifecycleStatus.ACTIVE.value:
        raise ConflictError("Source asset cannot accept new provenance references while deletion is in progress.")


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


def _begin_asset_delete(
    db_session: Session,
    *,
    campaign_id: UUID,
    asset_id: UUID,
) -> SourceAsset:
    stored_asset = db_session.scalar(
        select(SourceAsset)
        .where(
            SourceAsset.id == asset_id,
            SourceAsset.campaign_id == campaign_id,
        )
        .with_for_update()
    )
    if stored_asset is None:
        raise NotFoundError("Source asset not found.")
    if stored_asset.lifecycle_status != SourceAssetLifecycleStatus.ACTIVE.value:
        raise ConflictError("Source asset delete is already in progress.")

    _ensure_asset_delete_has_no_blocking_references(
        db_session,
        campaign_id=campaign_id,
        asset_id=asset_id,
    )

    stored_asset.lifecycle_status = SourceAssetLifecycleStatus.DELETING.value
    stored_asset.delete_started_at = utcnow()
    stored_asset.delete_last_error_at = None
    stored_asset.delete_last_error_message = None
    db_session.commit()
    db_session.refresh(stored_asset)
    return stored_asset


def _ensure_asset_delete_has_no_blocking_references(
    db_session: Session,
    *,
    campaign_id: UUID,
    asset_id: UUID,
) -> None:
    entity_reference_exists = db_session.scalar(
        select(exists().where(
            Entity.campaign_id == campaign_id,
            Entity.source_asset_id == asset_id,
        ))
    )
    relationship_reference_exists = db_session.scalar(
        select(exists().where(
            Relationship.campaign_id == campaign_id,
            Relationship.source_asset_id == asset_id,
        ))
    )
    extraction_job_reference_exists = db_session.scalar(
        select(exists().where(
            ExtractionJob.campaign_id == campaign_id,
            ExtractionJob.source_asset_id == asset_id,
        ))
    )
    if entity_reference_exists or relationship_reference_exists or extraction_job_reference_exists:
        raise ConflictError(
            "Source asset cannot be deleted while dependent records still reference it."
        )


def _finalize_asset_delete(
    db_session: Session,
    *,
    campaign_id: UUID,
    asset_id: UUID,
) -> None:
    finalize_session = Session(bind=db_session.get_bind(), expire_on_commit=False)
    try:
        stored_asset = finalize_session.scalar(
            select(SourceAsset).where(
                SourceAsset.id == asset_id,
                SourceAsset.campaign_id == campaign_id,
            )
        )
        if stored_asset is None:
            finalize_session.rollback()
            return

        finalize_session.delete(stored_asset)
        finalize_session.commit()
    finally:
        finalize_session.close()


def _mark_asset_delete_state(
    db_session: Session,
    *,
    campaign_id: UUID,
    asset_id: UUID,
    storage_status: SourceAssetStorageStatus,
    error_message: str,
) -> bool:
    repair_session = Session(bind=db_session.get_bind(), expire_on_commit=False)
    try:
        stored_asset = repair_session.scalar(
            select(SourceAsset).where(
                SourceAsset.id == asset_id,
                SourceAsset.campaign_id == campaign_id,
            )
        )
        if stored_asset is None:
            repair_session.rollback()
            return False

        stored_asset.lifecycle_status = SourceAssetLifecycleStatus.DELETING.value
        stored_asset.storage_status = storage_status.value
        stored_asset.delete_last_error_at = utcnow()
        stored_asset.delete_last_error_message = error_message
        if stored_asset.delete_started_at is None:
            stored_asset.delete_started_at = utcnow()
        repair_session.commit()
        return True
    finally:
        repair_session.close()


def _record_delete_failure(
    db_session: Session,
    *,
    campaign_id: UUID,
    asset_id: UUID,
    storage_status: SourceAssetStorageStatus,
    error_message: str,
) -> None:
    stored_asset = get_asset(
        db_session,
        campaign_id=campaign_id,
        asset_id=asset_id,
    )
    stored_asset.lifecycle_status = SourceAssetLifecycleStatus.DELETING.value
    stored_asset.storage_status = storage_status.value
    stored_asset.delete_last_error_at = utcnow()
    stored_asset.delete_last_error_message = error_message
    if stored_asset.delete_started_at is None:
        stored_asset.delete_started_at = utcnow()
    db_session.commit()


def _raise_delete_recovery_conflict(
    db_session: Session,
    *,
    campaign_id: UUID,
    asset_id: UUID,
    cause: Exception,
) -> None:
    marked_delete_failure = _mark_asset_delete_state(
        db_session,
        campaign_id=campaign_id,
        asset_id=asset_id,
        storage_status=SourceAssetStorageStatus.MISSING,
        error_message="Asset file is unavailable.",
    )
    if not marked_delete_failure:
        raise ConflictError(
            "Source asset delete removed the backing file but could not mark the asset for recovery."
        ) from cause
    db_session.expire_all()
    raise ConflictError("Asset file is unavailable.") from cause


def _get_asset_campaign_id(db_session: Session, *, asset_id: UUID) -> UUID:
    campaign_id = db_session.scalar(
        select(SourceAsset.campaign_id).where(SourceAsset.id == asset_id)
    )
    if campaign_id is None:
        raise NotFoundError("Source asset not found.")
    return campaign_id
