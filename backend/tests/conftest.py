from __future__ import annotations

import asyncio
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import anyio.to_thread
import fastapi.concurrency
import fastapi.dependencies.utils
import fastapi.routing
import httpx
import pytest
import starlette.concurrency
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.dependencies import get_db_session
from app.config import Settings
from app.models import Base
from tests.factories import (
    CampaignFactory,
    EntityFactory,
    OwnerFactory,
    RelationshipFactory,
    SessionFactory,
)
from tests.pg_test_support import (
    PostgresTestContainer,
    ensure_postgres_test_container,
    load_test_settings,
    remove_postgres_test_container,
)


@pytest.fixture
def sync_api_test_runtime_shim(
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[None]:
    # In this sandbox, the normal AnyIO-backed threadpool path hangs for sync
    # FastAPI handlers under in-process ASGI tests. Inline execution keeps the
    # HTTP request/response stack, dependency injection, and validation paths in
    # process without changing production code.
    async def inline_run_in_threadpool(func, *args, **kwargs):
        return func(*args, **kwargs)

    async def inline_run_sync(
        func,
        *args,
        abandon_on_cancel: bool = False,
        cancellable=None,
        limiter=None,
    ):
        del abandon_on_cancel, cancellable, limiter
        return func(*args)

    monkeypatch.setattr(starlette.concurrency, "run_in_threadpool", inline_run_in_threadpool)
    monkeypatch.setattr(fastapi.routing, "run_in_threadpool", inline_run_in_threadpool)
    monkeypatch.setattr(
        fastapi.dependencies.utils,
        "run_in_threadpool",
        inline_run_in_threadpool,
    )
    monkeypatch.setattr(fastapi.concurrency, "run_in_threadpool", inline_run_in_threadpool)
    monkeypatch.setattr(anyio.to_thread, "run_sync", inline_run_sync)
    yield


@contextmanager
def patched_jsonb_defaults() -> Iterator[None]:
    patched_columns: list[tuple[Any, Any]] = []
    jsonb_defaults = {"'{}'::jsonb", "'[]'::jsonb"}
    for metadata_table in Base.metadata.tables.values():
        for table_column in metadata_table.columns:
            column_server_default = table_column.server_default
            if column_server_default is None:
                continue
            if getattr(column_server_default.arg, "text", None) not in jsonb_defaults:
                continue
            patched_columns.append((table_column, column_server_default))
            table_column.server_default = None

    try:
        yield
    finally:
        for table_column, column_server_default in patched_columns:
            table_column.server_default = column_server_default


@pytest.fixture
def sqlite_engine(tmp_path: Path) -> Iterator[Engine]:
    with patched_jsonb_defaults():
        database_path = tmp_path / "test.db"
        sqlite_db_engine = create_engine(
            f"sqlite+pysqlite:///{database_path}",
            future=True,
            connect_args={"check_same_thread": False},
        )

        @event.listens_for(sqlite_db_engine, "connect")
        def _set_sqlite_pragma(dbapi_connection: Any, _connection_record: Any) -> None:
            dbapi_connection.execute("PRAGMA foreign_keys=ON")

        Base.metadata.create_all(sqlite_db_engine)

        try:
            yield sqlite_db_engine
        finally:
            Base.metadata.drop_all(sqlite_db_engine)
            sqlite_db_engine.dispose()


@pytest.fixture
def db_session_factory(sqlite_engine: Engine):
    return sessionmaker(bind=sqlite_engine, expire_on_commit=False, future=True)


@pytest.fixture
def owner_factory(db_session_factory):
    def create_owner(**kwargs):
        existing_session = kwargs.pop("db_session", None)
        if existing_session is not None:
            return OwnerFactory.create_in_session(existing_session, **kwargs)

        with db_session_factory() as db_session:
            stored_owner = OwnerFactory.create_in_session(db_session, **kwargs)
            db_session.commit()
            db_session.refresh(stored_owner)
            db_session.expunge(stored_owner)
            return stored_owner

    return create_owner


@pytest.fixture
def campaign_factory(db_session_factory):
    def create_campaign(**kwargs):
        existing_session = kwargs.pop("db_session", None)
        if existing_session is not None:
            return CampaignFactory.create_in_session(existing_session, **kwargs)

        with db_session_factory() as db_session:
            stored_campaign = CampaignFactory.create_in_session(db_session, **kwargs)
            db_session.commit()
            db_session.refresh(stored_campaign)
            db_session.expunge(stored_campaign)
            return stored_campaign

    return create_campaign


@pytest.fixture
def entity_factory(db_session_factory):
    def create_entity(**kwargs):
        campaign = kwargs.get("campaign")
        if campaign is not None and "campaign_id" not in kwargs:
            kwargs["campaign_id"] = campaign.id

        existing_session = kwargs.pop("db_session", None)
        if existing_session is not None:
            return EntityFactory.create_in_session(existing_session, **kwargs)

        with db_session_factory() as db_session:
            stored_entity = EntityFactory.create_in_session(db_session, **kwargs)
            db_session.commit()
            db_session.refresh(stored_entity)
            db_session.expunge(stored_entity)
            return stored_entity

    return create_entity


@pytest.fixture
def relationship_factory(db_session_factory):
    def create_relationship(**kwargs):
        campaign = kwargs.get("campaign")
        source_entity = kwargs.get("source_entity")
        target_entity = kwargs.get("target_entity")

        if campaign is not None and "campaign_id" not in kwargs:
            kwargs["campaign_id"] = campaign.id
        if source_entity is not None and "source_entity_id" not in kwargs:
            kwargs["source_entity_id"] = source_entity.id
        if target_entity is not None and "target_entity_id" not in kwargs:
            kwargs["target_entity_id"] = target_entity.id

        existing_session = kwargs.pop("db_session", None)
        if existing_session is not None:
            return RelationshipFactory.create_in_session(existing_session, **kwargs)

        with db_session_factory() as db_session:
            stored_relationship = RelationshipFactory.create_in_session(db_session, **kwargs)
            db_session.commit()
            db_session.refresh(stored_relationship)
            db_session.expunge(stored_relationship)
            return stored_relationship

    return create_relationship


@pytest.fixture
def session_factory(db_session_factory):
    def create_session(**kwargs):
        campaign = kwargs.get("campaign")
        if campaign is not None and "campaign_id" not in kwargs:
            kwargs["campaign_id"] = campaign.id

        existing_session = kwargs.pop("db_session", None)
        if existing_session is not None:
            return SessionFactory.create_in_session(existing_session, **kwargs)

        with db_session_factory() as db_session:
            stored_session = SessionFactory.create_in_session(db_session, **kwargs)
            db_session.commit()
            db_session.refresh(stored_session)
            db_session.expunge(stored_session)
            return stored_session

    return create_session


@pytest.fixture
def test_app(sqlite_engine: Engine, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite+pysqlite:///unused-for-tests.db")

    from app.main import create_app

    app = create_app(
        settings=None,
    )

    def override_get_db_session():
        with Session(sqlite_engine, expire_on_commit=False) as db_session:
            yield db_session

    app.dependency_overrides[get_db_session] = override_get_db_session

    try:
        yield app
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def api_request(test_app, sync_api_test_runtime_shim):
    def issue_api_request(method: str, path: str, **kwargs):
        async def send_request():
            transport = httpx.ASGITransport(app=test_app)
            async with httpx.AsyncClient(
                transport=transport,
                base_url="http://testserver",
                timeout=5.0,
            ) as api_client:
                return await api_client.request(method, path, **kwargs)

        return asyncio.run(send_request())

    return issue_api_request


@pytest.fixture(scope="session")
def postgres_test_container() -> Iterator[PostgresTestContainer]:
    runtime_container = ensure_postgres_test_container()

    try:
        yield runtime_container
    finally:
        remove_postgres_test_container(runtime_container.container_name)


@pytest.fixture(scope="session")
def postgres_test_settings(postgres_test_container: PostgresTestContainer) -> Settings:
    return load_test_settings(runtime_database_url=postgres_test_container.database_url)
