from __future__ import annotations

import subprocess

import pytest

from tests import pg_test_support


def test_load_test_settings_uses_runtime_database_url() -> None:
    runtime_database_url = "postgresql+psycopg://postgres:postgres@127.0.0.1:55432/rpg_gm_helper"

    settings = pg_test_support.load_test_settings(runtime_database_url=runtime_database_url)

    assert settings.database_url == runtime_database_url


def test_ensure_postgres_test_container_returns_runtime_database_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recorded_commands: list[list[str]] = []

    def fake_run(
        command: list[str],
        *,
        check: bool,
        capture_output: bool,
        text: bool,
    ) -> subprocess.CompletedProcess[str]:
        del check, capture_output, text
        recorded_commands.append(command)
        if command[:2] == ["docker", "version"]:
            return subprocess.CompletedProcess(command, 0, stdout="26.1.0\n", stderr="")
        if command[:2] == ["docker", "run"]:
            return subprocess.CompletedProcess(command, 0, stdout="container-id\n", stderr="")
        if command[:2] == ["docker", "port"]:
            return subprocess.CompletedProcess(
                command,
                0,
                stdout="127.0.0.1:55432\n",
                stderr="",
            )
        raise AssertionError(f"Unexpected command: {command}")

    monkeypatch.setattr(pg_test_support.subprocess, "run", fake_run)
    monkeypatch.setattr(pg_test_support, "wait_for_postgres_ready", lambda database_url: None)

    runtime_container = pg_test_support.ensure_postgres_test_container()

    assert runtime_container.database_url == ("postgresql+psycopg://postgres:postgres@127.0.0.1:55432/rpg_gm_helper")
    assert runtime_container.container_name.startswith(pg_test_support.POSTGRES_TEST_CONTAINER_PREFIX)
    assert recorded_commands[1][-1] == pg_test_support.POSTGRES_TEST_IMAGE


def test_ensure_postgres_test_container_fails_when_docker_cli_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def missing_docker(
        command: list[str],
        *,
        check: bool,
        capture_output: bool,
        text: bool,
    ) -> subprocess.CompletedProcess[str]:
        del command, check, capture_output, text
        raise FileNotFoundError

    monkeypatch.setattr(pg_test_support.subprocess, "run", missing_docker)

    with pytest.raises(pg_test_support.PostgresTestHarnessError, match="Docker CLI is not installed"):
        pg_test_support.ensure_postgres_test_container()


def test_ensure_postgres_test_container_fails_when_docker_daemon_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:

    def unavailable_docker(
        command: list[str],
        *,
        check: bool,
        capture_output: bool,
        text: bool,
    ) -> subprocess.CompletedProcess[str]:
        del check, capture_output, text
        if command[:2] == ["docker", "version"]:
            raise subprocess.CalledProcessError(
                1,
                command,
                output="",
                stderr="Cannot connect to the Docker daemon at unix:///var/run/docker.sock",
            )
        raise AssertionError(f"Unexpected command: {command}")

    monkeypatch.setattr(pg_test_support.subprocess, "run", unavailable_docker)

    with pytest.raises(
        pg_test_support.PostgresTestHarnessError,
        match="Docker is installed but the daemon is unavailable",
    ):
        pg_test_support.ensure_postgres_test_container()
