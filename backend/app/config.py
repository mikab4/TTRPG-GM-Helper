from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from app.enums import AssetStorageBackend

DEFAULT_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    app_env: str = "development"
    app_name: str = "RPG GM Helper API"
    api_prefix: str = "/api"
    database_url: str
    backend_cors_allowed_origins: Annotated[list[str], NoDecode] = []
    auto_apply_migrations: bool = False
    asset_storage_backend: AssetStorageBackend = AssetStorageBackend.LOCAL
    asset_storage_root: Path = DEFAULT_ENV_FILE.parent / ".data" / "assets"
    asset_upload_max_bytes: int = 25 * 1024 * 1024

    model_config = SettingsConfigDict(env_file_encoding="utf-8")

    @field_validator("backend_cors_allowed_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return load_settings(env_file=DEFAULT_ENV_FILE if DEFAULT_ENV_FILE.is_file() else None)


def load_settings(*, env_file: Path | None = None) -> Settings:
    return Settings(_env_file=env_file)
