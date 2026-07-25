from contextlib import contextmanager
from unittest.mock import MagicMock, Mock

import pytest


def test_retry_asset_deletions_uses_its_owned_engine_and_disposes_it_on_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    from app.maintenance import retry_asset_deletions

    settings = Mock()
    owned_engine = Mock()
    asset_storage = Mock()
    db_session = Mock()

    @contextmanager
    def create_db_session():
        yield db_session

    db_session_factory = Mock(return_value=create_db_session)
    retry_deleting_assets = Mock(return_value=2)
    monkeypatch.setattr(retry_asset_deletions, "get_settings", lambda: settings)
    monkeypatch.setattr(retry_asset_deletions, "get_engine", lambda value: owned_engine)
    monkeypatch.setattr(retry_asset_deletions, "build_asset_storage", lambda value: asset_storage)
    monkeypatch.setattr(retry_asset_deletions, "get_db_session_factory", db_session_factory)
    monkeypatch.setattr(retry_asset_deletions, "retry_deleting_assets", retry_deleting_assets)

    # Act
    retry_asset_deletions.main()

    # Assert
    db_session_factory.assert_called_once_with(owned_engine)
    retry_deleting_assets.assert_called_once_with(db_session, asset_storage=asset_storage)
    owned_engine.dispose.assert_called_once_with()


def test_retry_asset_deletions_disposes_its_engine_when_session_factory_creation_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    from app.maintenance import retry_asset_deletions

    settings = Mock()
    owned_engine = Mock()
    db_session_factory = Mock(side_effect=RuntimeError("session unavailable"))
    monkeypatch.setattr(retry_asset_deletions, "get_settings", lambda: settings)
    monkeypatch.setattr(retry_asset_deletions, "get_engine", lambda value: owned_engine)
    monkeypatch.setattr(retry_asset_deletions, "build_asset_storage", Mock())
    monkeypatch.setattr(retry_asset_deletions, "get_db_session_factory", db_session_factory)

    # Act / Assert
    with pytest.raises(RuntimeError, match="session unavailable"):
        retry_asset_deletions.main()

    owned_engine.dispose.assert_called_once_with()


def test_retry_asset_deletions_disposes_its_engine_when_retry_processing_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    from app.maintenance import retry_asset_deletions

    settings = Mock()
    owned_engine = Mock()
    db_session_context = MagicMock()
    db_session_factory = Mock(return_value=db_session_context)
    monkeypatch.setattr(retry_asset_deletions, "get_settings", lambda: settings)
    monkeypatch.setattr(retry_asset_deletions, "get_engine", lambda value: owned_engine)
    monkeypatch.setattr(retry_asset_deletions, "build_asset_storage", Mock())
    monkeypatch.setattr(retry_asset_deletions, "get_db_session_factory", db_session_factory)
    monkeypatch.setattr(
        retry_asset_deletions,
        "retry_deleting_assets",
        Mock(side_effect=RuntimeError("retry failed")),
    )

    # Act / Assert
    with pytest.raises(RuntimeError, match="retry failed"):
        retry_asset_deletions.main()

    owned_engine.dispose.assert_called_once_with()
