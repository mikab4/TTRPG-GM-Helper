import importlib
import sys
from unittest.mock import Mock

import pytest
from sqlalchemy import create_engine

from app.config import Settings


def test_importing_db_module_does_not_require_database_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    sys.modules.pop("app.db", None)

    module = importlib.import_module("app.db")

    assert hasattr(module, "get_engine")


def test_session_factory_binds_the_supplied_engine() -> None:
    # Arrange
    from app.db import get_db_session_factory

    supplied_engine = create_engine("sqlite+pysqlite:///:memory:", future=True)

    try:
        # Act
        db_session_factory = get_db_session_factory(supplied_engine)

        # Assert
        assert db_session_factory.kw["bind"] is supplied_engine
    finally:
        supplied_engine.dispose()


@pytest.mark.anyio
async def test_app_reuses_one_session_factory_and_disposes_its_engine_on_shutdown(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    from app.main import create_app

    app_settings = Settings(
        _env_file=None,
        database_url="postgresql+psycopg://test:test@localhost:5432/test_db",
    )
    shared_engine = Mock()
    shared_session_factory = Mock()
    get_db_session_factory = Mock(return_value=shared_session_factory)
    monkeypatch.setattr("app.main.get_engine", lambda settings: shared_engine)
    monkeypatch.setattr("app.main.get_db_session_factory", get_db_session_factory)

    # Act
    app = create_app(app_settings)
    async with app.router.lifespan_context(app):
        pass

    # Assert
    assert app.state.db_engine is shared_engine
    assert app.state.db_session_factory is shared_session_factory
    get_db_session_factory.assert_called_once_with(shared_engine)
    shared_engine.dispose.assert_called_once_with()
