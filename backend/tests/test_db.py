import importlib
import sys
from unittest.mock import Mock

import pytest

from app.config import Settings


def test_importing_db_module_does_not_require_database_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    sys.modules.pop("app.db", None)

    module = importlib.import_module("app.db")

    assert hasattr(module, "get_engine")


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
    monkeypatch.setattr("app.main.get_engine", lambda settings: shared_engine)
    monkeypatch.setattr(
        "app.main.get_db_session_factory",
        lambda engine: shared_session_factory,
    )

    # Act
    app = create_app(app_settings)
    async with app.router.lifespan_context(app):
        pass

    # Assert
    assert app.state.db_engine is shared_engine
    assert app.state.db_session_factory is shared_session_factory
    shared_engine.dispose.assert_called_once_with()
