from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Protocol
from uuid import uuid4

from fastapi import UploadFile

from app.config import Settings
from app.enums import AssetStorageBackend
from app.services.errors import AssetStorageNotFoundError, AssetUploadTooLargeError

UPLOAD_READ_CHUNK_SIZE = 1024 * 1024


@dataclass(frozen=True)
class StoredUploadMetadata:
    file_size_bytes: int
    checksum: str


class AssetStorage(Protocol):
    def store_upload(
        self,
        *,
        upload_file: UploadFile,
        storage_key: str,
        max_upload_bytes: int,
    ) -> StoredUploadMetadata: ...

    def delete(self, *, storage_key: str) -> None: ...


class LocalAssetStorage:
    def __init__(self, *, storage_root: Path) -> None:
        self._storage_root = storage_root

    def store_upload(
        self,
        *,
        upload_file: UploadFile,
        storage_key: str,
        max_upload_bytes: int,
    ) -> StoredUploadMetadata:
        target_path = self._resolve_storage_path(storage_key)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = target_path.parent / f".tmp-{uuid4().hex}"
        payload_hasher = hashlib.sha256()
        file_size_bytes = 0

        try:
            if hasattr(upload_file.file, "seek"):
                upload_file.file.seek(0)
            with temporary_path.open("wb") as temporary_file:
                while True:
                    upload_chunk = upload_file.file.read(UPLOAD_READ_CHUNK_SIZE)
                    if not upload_chunk:
                        break

                    file_size_bytes += len(upload_chunk)
                    if file_size_bytes > max_upload_bytes:
                        raise AssetUploadTooLargeError("Uploaded asset exceeds the maximum allowed size.")

                    temporary_file.write(upload_chunk)
                    payload_hasher.update(upload_chunk)

            temporary_path.replace(target_path)
        except Exception:
            temporary_path.unlink(missing_ok=True)
            raise

        return StoredUploadMetadata(
            file_size_bytes=file_size_bytes,
            checksum=f"sha256:{payload_hasher.hexdigest()}",
        )

    def delete(self, *, storage_key: str) -> None:
        stored_asset_path = self._resolve_storage_path(storage_key)
        try:
            stored_asset_path.unlink()
        except FileNotFoundError as exc:
            raise AssetStorageNotFoundError(f"Stored asset not found for key: {storage_key}") from exc

    def _resolve_storage_path(self, storage_key: str) -> Path:
        key_path = PurePosixPath(storage_key)
        if key_path.is_absolute() or ".." in key_path.parts:
            raise ValueError("Storage key must be a safe relative path.")
        return self._storage_root / Path(*key_path.parts)


def build_asset_storage(settings: Settings) -> AssetStorage:
    if settings.asset_storage_backend is AssetStorageBackend.LOCAL:
        return LocalAssetStorage(storage_root=settings.asset_storage_root)

    raise ValueError(f"Unsupported asset storage backend: {settings.asset_storage_backend}")
