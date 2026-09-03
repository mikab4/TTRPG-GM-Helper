from __future__ import annotations

import subprocess
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from alembic.config import Config
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.pool import NullPool

from alembic import command
from app.config import Settings, get_settings

POSTGRES_TEST_IMAGE = "postgres:16-alpine"
POSTGRES_TEST_CONTAINER_PREFIX = "rpg-gm-helper-test-postgres"
POSTGRES_TEST_CONTAINER_PORT = 5432
POSTGRES_TEST_DATABASE = "rpg_gm_helper"
POSTGRES_TEST_USER = "postgres"
POSTGRES_TEST_PASSWORD = "postgres"


class PostgresTestHarnessError(RuntimeError):
    pass


@dataclass(frozen=True)
class PostgresTestContainer:
    container_name: str
    host: str
    port: int
    database_url: str


def load_test_settings(*, runtime_database_url: str) -> Settings:
    return Settings(_env_file=None, database_url=runtime_database_url)


def build_alembic_config() -> Config:
    return Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))


def _run_subprocess(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=True, capture_output=True, text=True)


def _command_error_output(error: subprocess.CalledProcessError) -> str:
    return (error.stderr or error.output or "").strip()


def ensure_docker_available() -> None:
    try:
        _run_subprocess(["docker", "version"])
    except FileNotFoundError as exc:
        raise PostgresTestHarnessError("Docker CLI is not installed. Install Docker and rerun `uv run pytest`.") from exc
    except subprocess.CalledProcessError as exc:
        docker_error_output = _command_error_output(exc)
        if "WSL integration" in docker_error_output:
            raise PostgresTestHarnessError(
                "Docker is installed but unavailable in this WSL environment. "
                "Enable Docker Desktop WSL integration and rerun `uv run pytest`."
            ) from exc
        raise PostgresTestHarnessError(
            "Docker is installed but the daemon is unavailable. Start Docker and rerun "
            f"`uv run pytest`. Docker said: {docker_error_output}"
        ) from exc


def build_runtime_database_url(*, host: str, port: int) -> str:
    return f"postgresql+psycopg://{POSTGRES_TEST_USER}:{POSTGRES_TEST_PASSWORD}@{host}:{port}/{POSTGRES_TEST_DATABASE}"


def start_postgres_test_container() -> str:
    container_name = f"{POSTGRES_TEST_CONTAINER_PREFIX}-{uuid4().hex[:8]}"
    _run_subprocess(
        [
            "docker",
            "run",
            "--detach",
            "--rm",
            "--name",
            container_name,
            "--env",
            f"POSTGRES_DB={POSTGRES_TEST_DATABASE}",
            "--env",
            f"POSTGRES_USER={POSTGRES_TEST_USER}",
            "--env",
            f"POSTGRES_PASSWORD={POSTGRES_TEST_PASSWORD}",
            "--publish",
            f"127.0.0.1::{POSTGRES_TEST_CONTAINER_PORT}",
            POSTGRES_TEST_IMAGE,
        ]
    )
    return container_name


def get_postgres_test_container_port(container_name: str) -> int:
    port_output = _run_subprocess(["docker", "port", container_name, f"{POSTGRES_TEST_CONTAINER_PORT}/tcp"]).stdout.strip()
    host, _, port_text = port_output.rpartition(":")
    if not host or not port_text.isdigit():
        raise PostgresTestHarnessError(f"Could not determine mapped Postgres port for container {container_name!r}.")
    return int(port_text)


def wait_for_postgres_ready(database_url: str, *, timeout_seconds: float = 20.0) -> None:
    engine = create_engine(database_url, future=True, poolclass=NullPool)
    deadline = time.monotonic() + timeout_seconds

    try:
        while True:
            try:
                with engine.connect() as connection:
                    connection.execute(text("SELECT 1"))
                    return
            except OperationalError:
                if time.monotonic() >= deadline:
                    raise PostgresTestHarnessError(
                        "Timed out while waiting for the Dockerized Postgres test container to accept connections."
                    )
                time.sleep(0.5)
    finally:
        engine.dispose()


def ensure_postgres_test_container() -> PostgresTestContainer:
    ensure_docker_available()
    container_name = start_postgres_test_container()
    host = "127.0.0.1"
    port = get_postgres_test_container_port(container_name)
    database_url = build_runtime_database_url(host=host, port=port)

    try:
        wait_for_postgres_ready(database_url)
    except Exception:
        remove_postgres_test_container(container_name)
        raise

    return PostgresTestContainer(
        container_name=container_name,
        host=host,
        port=port,
        database_url=database_url,
    )


def remove_postgres_test_container(container_name: str) -> None:
    try:
        _run_subprocess(["docker", "rm", "--force", container_name])
    except FileNotFoundError, subprocess.CalledProcessError:
        return


def create_test_engine(settings: Settings) -> Engine:
    engine = create_engine(settings.database_url, future=True, poolclass=NullPool)

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except OperationalError:
        engine.dispose()
        raise PostgresTestHarnessError("Postgres test database is unavailable even though the runtime settings were loaded.")

    return engine


def reset_public_schema(engine: Engine) -> None:
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))


@contextmanager
def upgraded_postgres_test_engine(
    *,
    monkeypatch,
    settings: Settings,
) -> Iterator[Engine]:
    engine = create_test_engine(settings)
    alembic_config = build_alembic_config()
    upgraded = False

    reset_public_schema(engine)
    monkeypatch.setenv("DATABASE_URL", settings.database_url)
    get_settings.cache_clear()

    try:
        command.upgrade(alembic_config, "head")
        upgraded = True
        yield engine
    finally:
        if upgraded:
            command.downgrade(alembic_config, "base")
        monkeypatch.delenv("DATABASE_URL", raising=False)
        get_settings.cache_clear()
        engine.dispose()
