from __future__ import annotations

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db_session_factory
from app.services.asset_storage import AssetStorage, build_asset_storage


def get_db_session() -> Iterator[Session]:
    db_session_factory = get_db_session_factory()
    with db_session_factory() as db_session:
        yield db_session


AppSettings = Annotated[Settings, Depends(get_settings)]


def get_asset_storage(settings: AppSettings) -> AssetStorage:
    return build_asset_storage(settings)
