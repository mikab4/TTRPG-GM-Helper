from pathlib import Path

import pytest
from pydantic import ValidationError

from app import config as config_module
from app.config import Settings, get_settings, load_settings


def test_settings_do_not_load_env_file_implicitly(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("BACKEND_CORS_ALLOWED_ORIGINS", raising=False)

    with pytest.raises(ValidationError):
        Settings()


def test_load_settings_can_read_explicit_env_file_from_backend(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("BACKEND_CORS_ALLOWED_ORIGINS", raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text(
        "DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/rpg_gm_helper\n",
        encoding="utf-8",
    )

    settings = load_settings(env_file=env_file)

    assert settings.database_url == ("postgresql+psycopg://postgres:postgres@localhost:5432/rpg_gm_helper")


def test_get_settings_uses_default_env_file_when_present(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/rpg_gm_helper\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(config_module, "DEFAULT_ENV_FILE", env_file)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("BACKEND_CORS_ALLOWED_ORIGINS", raising=False)
    get_settings.cache_clear()

    settings = get_settings()

    assert settings.database_url == ("postgresql+psycopg://postgres:postgres@localhost:5432/rpg_gm_helper")
    get_settings.cache_clear()


def test_settings_require_database_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("BACKEND_CORS_ALLOWED_ORIGINS", raising=False)

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_settings_default_cors_origins_to_empty_list(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://test:test@localhost:5432/test_db")
    monkeypatch.delenv("BACKEND_CORS_ALLOWED_ORIGINS", raising=False)

    settings = Settings(_env_file=None)

    assert settings.backend_cors_allowed_origins == []


def test_settings_parse_cors_origins_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://test:test@localhost:5432/test_db")
    monkeypatch.setenv(
        "BACKEND_CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )
    get_settings.cache_clear()

    settings = get_settings()

    assert settings.backend_cors_allowed_origins == [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    get_settings.cache_clear()


def test_settings_default_auto_apply_migrations_to_false(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://test:test@localhost:5432/test_db")
    monkeypatch.delenv("AUTO_APPLY_MIGRATIONS", raising=False)

    settings = Settings(_env_file=None)

    assert settings.auto_apply_migrations is False


def test_settings_parse_auto_apply_migrations_from_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://test:test@localhost:5432/test_db")
    monkeypatch.setenv("AUTO_APPLY_MIGRATIONS", "true")

    settings = Settings(_env_file=None)

    assert settings.auto_apply_migrations is True


def test_settings_default_asset_storage_root_to_backend_data_assets(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://test:test@localhost:5432/test_db")

    settings = Settings(_env_file=None)

    assert settings.asset_storage_root == config_module.DEFAULT_ENV_FILE.parent / ".data" / "assets"


def test_settings_default_asset_upload_max_bytes_to_25_megabytes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://test:test@localhost:5432/test_db")

    settings = Settings(_env_file=None)

    assert settings.asset_upload_max_bytes == 25 * 1024 * 1024


def test_settings_default_asset_storage_backend_to_local(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://test:test@localhost:5432/test_db")

    settings = Settings(_env_file=None)

    assert settings.asset_storage_backend == "local"
