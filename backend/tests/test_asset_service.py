from __future__ import annotations

import hashlib
from io import BytesIO
from pathlib import Path

import pytest
from fastapi import UploadFile
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from starlette.datastructures import Headers

from app.models import ExtractionJob
from app.schemas import AssetCreateFormData
from app.services import AssetUploadTooLargeError, ConflictError, NotFoundError, asset_service
from app.services.asset_storage import LocalAssetStorage, StoredUploadMetadata


class NoWholeFileReadsStream:
    def __init__(self, payload: bytes) -> None:
        self._buffer = BytesIO(payload)
        self.read_sizes: list[int] = []

    def read(self, size: int = -1) -> bytes:
        if size < 0:
            raise AssertionError("Asset upload should not read the whole file at once.")

        self.read_sizes.append(size)
        return self._buffer.read(size)


class ReadAfterOffsetStream:
    def __init__(self, payload: bytes, *, initial_offset: int) -> None:
        self._buffer = BytesIO(payload)
        self._buffer.seek(initial_offset)

    def read(self, size: int = -1) -> bytes:
        return self._buffer.read(size)

    def seek(self, offset: int, whence: int = 0) -> int:
        return self._buffer.seek(offset, whence)


class RecordingAssetStorage:
    def __init__(self, *, delegate_storage: LocalAssetStorage) -> None:
        self._delegate_storage = delegate_storage
        self.stored_keys: list[str] = []
        self.deleted_keys: list[str] = []

    def store_upload(
        self,
        *,
        upload_file: UploadFile,
        storage_key: str,
        max_upload_bytes: int,
    ) -> StoredUploadMetadata:
        self.stored_keys.append(storage_key)
        return self._delegate_storage.store_upload(
            upload_file=upload_file,
            storage_key=storage_key,
            max_upload_bytes=max_upload_bytes,
        )

    def delete(self, *, storage_key: str) -> None:
        self.deleted_keys.append(storage_key)
        self._delegate_storage.delete(storage_key=storage_key)


class DeleteFailingAssetStorage(RecordingAssetStorage):
    def delete(self, *, storage_key: str) -> None:
        self.deleted_keys.append(storage_key)
        raise OSError("storage delete failed")


def build_recording_asset_storage(*, storage_root: Path) -> RecordingAssetStorage:
    return RecordingAssetStorage(delegate_storage=LocalAssetStorage(storage_root=storage_root))


def build_delete_failing_asset_storage(*, storage_root: Path) -> DeleteFailingAssetStorage:
    return DeleteFailingAssetStorage(delegate_storage=LocalAssetStorage(storage_root=storage_root))


def build_upload_file(
    *,
    file_obj,
    filename: str,
    content_type: str = "text/plain",
) -> UploadFile:
    return UploadFile(
        file=file_obj,
        filename=filename,
        headers=Headers({"content-type": content_type}),
    )


def test_create_asset_reads_upload_stream_in_chunks_and_persists_metadata(
    db_session_factory,
    campaign_factory,
    tmp_path: Path,
) -> None:
    # Arrange
    asset_storage_root = tmp_path / "asset-storage"
    asset_storage = build_recording_asset_storage(storage_root=asset_storage_root)
    stored_campaign = campaign_factory()
    upload_payload = b"observatory-notes-" * 70000
    upload_stream = NoWholeFileReadsStream(upload_payload)
    upload_file = build_upload_file(
        file_obj=upload_stream,
        filename="observatory-notes.txt",
    )

    with db_session_factory() as db_session:
        # Act
        created_asset = asset_service.create_asset(
            db_session,
            campaign_id=stored_campaign.id,
            asset_create=AssetCreateFormData(),
            upload_file=upload_file,
            asset_storage=asset_storage,
        )

        # Assert
        assert asset_storage.stored_keys == [created_asset.storage_key]
        assert created_asset.file_size_bytes == len(upload_payload)
        assert created_asset.checksum == f"sha256:{hashlib.sha256(upload_payload).hexdigest()}"
        assert upload_stream.read_sizes
        assert all(read_size == asset_service.UPLOAD_READ_CHUNK_SIZE for read_size in upload_stream.read_sizes)
        stored_asset_path = asset_storage_root / created_asset.storage_key
        assert stored_asset_path.read_bytes() == upload_payload


def test_create_asset_deletes_stored_file_when_database_commit_fails(
    db_session_factory,
    campaign_factory,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    asset_storage_root = tmp_path / "asset-storage"
    asset_storage = build_recording_asset_storage(storage_root=asset_storage_root)
    stored_campaign = campaign_factory()
    upload_payload = b"ledger-entry"
    upload_file = build_upload_file(
        file_obj=BytesIO(upload_payload),
        filename="ledger-entry.txt",
    )

    with db_session_factory() as db_session:
        original_commit = db_session.commit

        def failing_commit() -> None:
            db_session.commit = original_commit
            raise SQLAlchemyError("database write failed")

        monkeypatch.setattr(db_session, "commit", failing_commit)

        # Act / Assert
        with pytest.raises(SQLAlchemyError):
            asset_service.create_asset(
                db_session,
                campaign_id=stored_campaign.id,
                asset_create=AssetCreateFormData(),
                upload_file=upload_file,
                asset_storage=asset_storage,
            )

        assert len(asset_storage.stored_keys) == 1
        assert asset_storage.deleted_keys == asset_storage.stored_keys
        remaining_files = [stored_path for stored_path in asset_storage_root.rglob("*") if stored_path.is_file()]
        assert remaining_files == []


def test_create_asset_rewinds_stream_before_storing_upload(
    db_session_factory,
    campaign_factory,
    tmp_path: Path,
) -> None:
    # Arrange
    asset_storage_root = tmp_path / "asset-storage"
    asset_storage = build_recording_asset_storage(storage_root=asset_storage_root)
    stored_campaign = campaign_factory()
    upload_payload = b"rewind-me"
    upload_file = build_upload_file(
        file_obj=ReadAfterOffsetStream(upload_payload, initial_offset=len(upload_payload)),
        filename="rewind.txt",
    )

    with db_session_factory() as db_session:
        # Act
        created_asset = asset_service.create_asset(
            db_session,
            campaign_id=stored_campaign.id,
            asset_create=AssetCreateFormData(),
            upload_file=upload_file,
            asset_storage=asset_storage,
        )

        # Assert
        stored_asset_path = asset_storage_root / created_asset.storage_key
        assert stored_asset_path.read_bytes() == upload_payload
        assert created_asset.file_size_bytes == len(upload_payload)


def test_create_asset_rejects_uploads_larger_than_max_bytes(
    campaign_factory,
    db_session_factory,
    tmp_path: Path,
) -> None:
    # Arrange
    asset_storage_root = tmp_path / "asset-storage"
    asset_storage = build_recording_asset_storage(storage_root=asset_storage_root)
    stored_campaign = campaign_factory()
    upload_payload = b"0123456789"
    upload_file = build_upload_file(
        file_obj=BytesIO(upload_payload),
        filename="too-large.txt",
    )

    with db_session_factory() as db_session:
        # Act / Assert
        with pytest.raises(AssetUploadTooLargeError):
            asset_service.create_asset(
                db_session,
                campaign_id=stored_campaign.id,
                asset_create=AssetCreateFormData(),
                upload_file=upload_file,
                asset_storage=asset_storage,
                max_upload_bytes=5,
            )

        remaining_files = [stored_path for stored_path in asset_storage_root.rglob("*") if stored_path.is_file()]
        assert remaining_files == []
        assert asset_service.list_assets(db_session, campaign_id=stored_campaign.id) == []


def test_delete_asset_removes_stored_file_and_database_row(
    db_session_factory,
    campaign_factory,
    tmp_path: Path,
) -> None:
    # Arrange
    asset_storage_root = tmp_path / "asset-storage"
    asset_storage = build_recording_asset_storage(storage_root=asset_storage_root)
    stored_campaign = campaign_factory()
    upload_payload = b"castle-map"
    upload_file = build_upload_file(
        file_obj=BytesIO(upload_payload),
        filename="castle-map.txt",
    )

    with db_session_factory() as db_session:
        created_asset = asset_service.create_asset(
            db_session,
            campaign_id=stored_campaign.id,
            asset_create=AssetCreateFormData(),
            upload_file=upload_file,
            asset_storage=asset_storage,
        )
        stored_asset_path = asset_storage_root / created_asset.storage_key
        assert stored_asset_path.is_file()

        # Act
        asset_service.delete_asset(
            db_session,
            campaign_id=stored_campaign.id,
            asset_id=created_asset.id,
            asset_storage=asset_storage,
        )

        # Assert
        assert asset_storage.deleted_keys == [created_asset.storage_key]
        assert not stored_asset_path.exists()
        with pytest.raises(NotFoundError):
            asset_service.get_asset(
                db_session,
                campaign_id=stored_campaign.id,
                asset_id=created_asset.id,
            )


def test_delete_asset_leaves_row_unchanged_when_storage_delete_fails(
    db_session_factory,
    campaign_factory,
    tmp_path: Path,
) -> None:
    # Arrange
    asset_storage_root = tmp_path / "asset-storage"
    create_storage = build_recording_asset_storage(storage_root=asset_storage_root)
    delete_storage = build_delete_failing_asset_storage(storage_root=asset_storage_root)
    stored_campaign = campaign_factory()
    upload_payload = b"broken-delete"
    upload_file = build_upload_file(
        file_obj=BytesIO(upload_payload),
        filename="broken-delete.txt",
    )

    with db_session_factory() as db_session:
        created_asset = asset_service.create_asset(
            db_session,
            campaign_id=stored_campaign.id,
            asset_create=AssetCreateFormData(),
            upload_file=upload_file,
            asset_storage=create_storage,
        )
        stored_asset_path = asset_storage_root / created_asset.storage_key

        # Act / Assert
        with pytest.raises(ConflictError, match="Source asset delete could not remove the backing file."):
            asset_service.delete_asset(
                db_session,
                campaign_id=stored_campaign.id,
                asset_id=created_asset.id,
                asset_storage=delete_storage,
            )

        reloaded_asset = asset_service.get_asset(
            db_session,
            campaign_id=stored_campaign.id,
            asset_id=created_asset.id,
        )
        assert reloaded_asset.lifecycle_status == "deleting"
        assert reloaded_asset.storage_status == "available"
        assert reloaded_asset.delete_started_at is not None
        assert reloaded_asset.delete_last_error_at is not None
        assert reloaded_asset.delete_last_error_message == "Source asset delete could not remove the backing file."
        assert stored_asset_path.is_file()


def test_delete_asset_rejects_existing_extraction_job_before_storage_delete(
    db_session_factory,
    campaign_factory,
    tmp_path: Path,
) -> None:
    # Arrange
    asset_storage_root = tmp_path / "asset-storage"
    asset_storage = build_recording_asset_storage(storage_root=asset_storage_root)
    stored_campaign = campaign_factory()
    upload_file = build_upload_file(
        file_obj=BytesIO(b"job-blocked-delete"),
        filename="job-blocked-delete.txt",
    )

    with db_session_factory() as db_session:
        created_asset = asset_service.create_asset(
            db_session,
            campaign_id=stored_campaign.id,
            asset_create=AssetCreateFormData(),
            upload_file=upload_file,
            asset_storage=asset_storage,
        )
        db_session.add(
            ExtractionJob(
                campaign_id=stored_campaign.id,
                source_asset_id=created_asset.id,
                status="pending",
                extractor_kind="rules",
            )
        )
        db_session.commit()
        stored_asset_path = asset_storage_root / created_asset.storage_key

        # Act / Assert
        with pytest.raises(
            ConflictError,
            match="Source asset cannot be deleted while dependent records still reference it.",
        ):
            asset_service.delete_asset(
                db_session,
                campaign_id=stored_campaign.id,
                asset_id=created_asset.id,
                asset_storage=asset_storage,
            )

        reloaded_asset = asset_service.get_asset(
            db_session,
            campaign_id=stored_campaign.id,
            asset_id=created_asset.id,
        )
        assert reloaded_asset.lifecycle_status == "active"
        assert asset_storage.deleted_keys == []
        assert stored_asset_path.is_file()


def test_delete_asset_marks_asset_missing_when_database_delete_fails_after_storage_delete(
    db_session_factory,
    campaign_factory,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    asset_storage_root = tmp_path / "asset-storage"
    asset_storage = build_recording_asset_storage(storage_root=asset_storage_root)
    stored_campaign = campaign_factory()
    upload_payload = b"repair-me"
    upload_file = build_upload_file(
        file_obj=BytesIO(upload_payload),
        filename="repair-me.txt",
    )

    with db_session_factory() as db_session:
        created_asset = asset_service.create_asset(
            db_session,
            campaign_id=stored_campaign.id,
            asset_create=AssetCreateFormData(),
            upload_file=upload_file,
            asset_storage=asset_storage,
        )
        stored_asset_path = asset_storage_root / created_asset.storage_key
        monkeypatch.setattr(
            asset_service,
            "_finalize_asset_delete",
            lambda *args, **kwargs: (_ for _ in ()).throw(SQLAlchemyError("database delete failed")),
        )

        # Act / Assert
        with pytest.raises(ConflictError, match="Asset file is unavailable."):
            asset_service.delete_asset(
                db_session,
                campaign_id=stored_campaign.id,
                asset_id=created_asset.id,
                asset_storage=asset_storage,
            )

        reloaded_asset = asset_service.get_asset(
            db_session,
            campaign_id=stored_campaign.id,
            asset_id=created_asset.id,
        )
        assert reloaded_asset.lifecycle_status == "deleting"
        assert reloaded_asset.storage_status == "missing"
        assert not stored_asset_path.exists()


def test_delete_asset_marks_asset_missing_when_database_integrity_error_happens_after_storage_delete(
    db_session_factory,
    campaign_factory,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    asset_storage_root = tmp_path / "asset-storage"
    asset_storage = build_recording_asset_storage(storage_root=asset_storage_root)
    stored_campaign = campaign_factory()
    upload_file = build_upload_file(
        file_obj=BytesIO(b"integrity-repair"),
        filename="integrity-repair.txt",
    )

    with db_session_factory() as db_session:
        created_asset = asset_service.create_asset(
            db_session,
            campaign_id=stored_campaign.id,
            asset_create=AssetCreateFormData(),
            upload_file=upload_file,
            asset_storage=asset_storage,
        )
        stored_asset_path = asset_storage_root / created_asset.storage_key
        monkeypatch.setattr(
            asset_service,
            "_finalize_asset_delete",
            lambda *args, **kwargs: (_ for _ in ()).throw(
                IntegrityError("DELETE FROM source_assets", params=None, orig=Exception("fk violation"))
            ),
        )

        # Act / Assert
        with pytest.raises(ConflictError, match="Asset file is unavailable."):
            asset_service.delete_asset(
                db_session,
                campaign_id=stored_campaign.id,
                asset_id=created_asset.id,
                asset_storage=asset_storage,
            )

        reloaded_asset = asset_service.get_asset(
            db_session,
            campaign_id=stored_campaign.id,
            asset_id=created_asset.id,
        )
        assert reloaded_asset.lifecycle_status == "deleting"
        assert reloaded_asset.storage_status == "missing"
        assert not stored_asset_path.exists()


def test_require_asset_file_available_rejects_missing_storage_state(
    campaign_factory,
    source_asset_factory,
    db_session_factory,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    stored_asset = source_asset_factory(
        campaign=stored_campaign,
        storage_status="missing",
    )

    with db_session_factory() as db_session:
        # Act / Assert
        with pytest.raises(ConflictError, match="Asset file is unavailable."):
            asset_service.require_asset_file_available(
                db_session,
                campaign_id=stored_campaign.id,
                asset_id=stored_asset.id,
            )


def test_delete_asset_returns_conflict_when_storage_delete_succeeds_but_repair_cannot_mark_asset(
    db_session_factory,
    campaign_factory,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    asset_storage_root = tmp_path / "asset-storage"
    asset_storage = build_recording_asset_storage(storage_root=asset_storage_root)
    stored_campaign = campaign_factory()
    upload_file = build_upload_file(
        file_obj=BytesIO(b"repair-fails"),
        filename="repair-fails.txt",
    )

    with db_session_factory() as db_session:
        created_asset = asset_service.create_asset(
            db_session,
            campaign_id=stored_campaign.id,
            asset_create=AssetCreateFormData(),
            upload_file=upload_file,
            asset_storage=asset_storage,
        )
        monkeypatch.setattr(
            asset_service,
            "_finalize_asset_delete",
            lambda *args, **kwargs: (_ for _ in ()).throw(SQLAlchemyError("database delete failed")),
        )
        monkeypatch.setattr(asset_service, "_mark_asset_delete_state", lambda *args, **kwargs: False)

        # Act / Assert
        with pytest.raises(
            ConflictError,
            match="Source asset delete removed the backing file but could not mark the asset for recovery.",
        ):
            asset_service.delete_asset(
                db_session,
                campaign_id=stored_campaign.id,
                asset_id=created_asset.id,
                asset_storage=asset_storage,
            )


def test_retry_deleting_assets_removes_asset_after_storage_delete_succeeds(
    db_session_factory,
    campaign_factory,
    tmp_path: Path,
) -> None:
    # Arrange
    asset_storage_root = tmp_path / "asset-storage"
    asset_storage = build_recording_asset_storage(storage_root=asset_storage_root)
    stored_campaign = campaign_factory()
    upload_file = build_upload_file(
        file_obj=BytesIO(b"retry-delete"),
        filename="retry-delete.txt",
    )

    with db_session_factory() as db_session:
        created_asset = asset_service.create_asset(
            db_session,
            campaign_id=stored_campaign.id,
            asset_create=AssetCreateFormData(),
            upload_file=upload_file,
            asset_storage=asset_storage,
        )
        stored_asset_path = asset_storage_root / created_asset.storage_key
        stored_asset = asset_service.get_asset(
            db_session,
            campaign_id=stored_campaign.id,
            asset_id=created_asset.id,
        )
        stored_asset.lifecycle_status = "deleting"
        stored_asset.delete_started_at = stored_asset.created_at
        db_session.commit()

        # Act
        deleted_asset_count = asset_service.retry_deleting_assets(
            db_session,
            asset_storage=asset_storage,
        )

        # Assert
        assert deleted_asset_count == 1
        assert not stored_asset_path.exists()
        with pytest.raises(NotFoundError):
            asset_service.get_asset(
                db_session,
                campaign_id=stored_campaign.id,
                asset_id=created_asset.id,
            )
