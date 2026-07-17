from __future__ import annotations

from app.config import get_settings
from app.db import get_db_session_factory
from app.services.asset_service import retry_deleting_assets
from app.services.asset_storage import build_asset_storage


def main() -> None:
    settings = get_settings()
    asset_storage = build_asset_storage(settings)
    db_session_factory = get_db_session_factory(settings)

    with db_session_factory() as db_session:
        deleted_asset_count = retry_deleting_assets(
            db_session,
            asset_storage=asset_storage,
        )

    print(f"Retried deleting assets. Removed {deleted_asset_count} asset rows.")


if __name__ == "__main__":
    main()
