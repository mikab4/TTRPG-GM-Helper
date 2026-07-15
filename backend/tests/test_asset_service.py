from __future__ import annotations

import hashlib
from io import BytesIO
from pathlib import Path

import pytest
from fastapi import UploadFile
from sqlalchemy.exc import SQLAlchemyError
from starlette.datastructures import Headers

from app.schemas import AssetCreateFormData
from app.services import AssetUploadTooLargeError, NotFoundError, asset_service
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


def build_recording_asset_storage(*, storage_root: Path) -> RecordingAssetStorage:
    return RecordingAssetStorage(delegate_storage=LocalAssetStorage(storage_root=storage_root))


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
