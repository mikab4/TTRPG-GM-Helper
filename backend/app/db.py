from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

from app.config import Settings, get_settings
from app.models.base import Base

__all__ = ["Base", "get_engine", "get_db_session_factory"]


def get_engine(settings: Settings | None = None):
    settings = settings or get_settings()
    return create_engine(settings.database_url, future=True)


def get_db_session_factory(engine_or_settings: Engine | Settings | None = None):
    if isinstance(engine_or_settings, Engine):
        db_engine = engine_or_settings
    else:
        db_engine = get_engine(engine_or_settings)

    return sessionmaker(
        bind=db_engine,
        autoflush=False,
        autocommit=False,
        future=True,
    )
