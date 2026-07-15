from pathlib import Path

from app.config import Settings
from app.services.asset_storage import LocalAssetStorage, build_asset_storage


def test_build_asset_storage_returns_local_storage_for_local_backend(tmp_path: Path) -> None:
    settings = Settings(
        _env_file=None,
        database_url="sqlite+pysqlite:///unused-for-tests.db",
        asset_storage_root=tmp_path / "asset-storage",
        asset_storage_backend="local",
    )

    asset_storage = build_asset_storage(settings)

    assert isinstance(asset_storage, LocalAssetStorage)
