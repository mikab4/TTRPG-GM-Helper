from __future__ import annotations

from pathlib import Path

from fastapi import UploadFile
from starlette.datastructures import Headers

from app.services.asset_storage import LocalAssetStorage, StoredUploadMetadata
from app.services.errors import AssetStorageNotFoundError


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


class DeleteMissingAssetStorage(RecordingAssetStorage):
    def delete(self, *, storage_key: str) -> None:
        self.deleted_keys.append(storage_key)
        raise AssetStorageNotFoundError("storage object missing")


def build_recording_asset_storage(*, storage_root: Path) -> RecordingAssetStorage:
    return RecordingAssetStorage(delegate_storage=LocalAssetStorage(storage_root=storage_root))


def build_delete_failing_asset_storage(*, storage_root: Path) -> DeleteFailingAssetStorage:
    return DeleteFailingAssetStorage(delegate_storage=LocalAssetStorage(storage_root=storage_root))


def build_delete_missing_asset_storage(*, storage_root: Path) -> DeleteMissingAssetStorage:
    return DeleteMissingAssetStorage(delegate_storage=LocalAssetStorage(storage_root=storage_root))


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
