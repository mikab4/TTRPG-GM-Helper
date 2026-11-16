from __future__ import annotations

from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID

import pytest
from sqlalchemy import Connection, Engine, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from app.config import Settings
from app.models import Campaign, Entity, ExtractionJob, Owner, Relationship, SourceAsset
from app.schemas.relationships import RelationshipCreate
from app.services.asset_service import _begin_asset_delete
from app.services.errors import ConflictError
from app.services.relationship_service import create_relationship
from tests.pg_test_support import upgraded_postgres_test_engine, wait_for_backend_lock_wait

CONCURRENT_WRITE_TIMEOUT_SECONDS = 10.0


@pytest.fixture
def postgres_engine(
    monkeypatch: pytest.MonkeyPatch,
    postgres_test_settings: Settings,
) -> Iterator[Engine]:
    with upgraded_postgres_test_engine(
        monkeypatch=monkeypatch,
        settings=postgres_test_settings,
    ) as engine:
        yield engine


def _seed_campaign_with_active_asset(engine: Engine) -> dict[str, UUID]:
    with DBSession(engine) as seed_session:
        owner = Owner(email="gm@example.com", display_name="Local GM")
        campaign = Campaign(owner=owner, name="Iron Vale")
        source_asset = SourceAsset(
            campaign=campaign,
            title="GM recap",
            media_type="text/plain",
            original_filename="gm-recap.txt",
            file_size_bytes=12,
            checksum="sha256:gm-recap",
            storage_key="assets/gm-recap.txt",
            lifecycle_status="active",
            storage_status="available",
            parse_status="pending",
            truth_status="canonical",
        )
        source_entity = Entity(campaign=campaign, type="person", name="Aria")
        target_entity = Entity(campaign=campaign, type="person", name="Bren")
        seed_session.add_all([owner, campaign, source_asset, source_entity, target_entity])
        seed_session.commit()
        return {
            "campaign_id": campaign.id,
            "source_asset_id": source_asset.id,
            "source_entity_id": source_entity.id,
            "target_entity_id": target_entity.id,
        }


def _backend_pid(db_session: DBSession) -> int:
    return db_session.connection().execute(text("SELECT pg_backend_pid()")).scalar_one()


def _lock_asset_row_for_delete(connection: Connection, *, source_asset_id: UUID) -> None:
    connection.execute(
        text("SELECT id FROM source_assets WHERE id = :asset_id FOR UPDATE"),
        {"asset_id": source_asset_id},
    )


def _mark_asset_deleting(connection: Connection, *, source_asset_id: UUID) -> None:
    connection.execute(
        text("UPDATE source_assets SET lifecycle_status = 'deleting' WHERE id = :asset_id"),
        {"asset_id": source_asset_id},
    )


def _run_citing_write_while_asset_delete_holds_row_lock(
    engine: Engine,
    *,
    source_asset_id: UUID,
    citing_write: Callable[[DBSession], object],
) -> object:
    with engine.connect() as deleting_connection, DBSession(engine) as citing_session:
        with ThreadPoolExecutor(max_workers=1) as executor:
            with deleting_connection.begin():
                _lock_asset_row_for_delete(deleting_connection, source_asset_id=source_asset_id)
                citing_backend_pid = _backend_pid(citing_session)
                blocked_citing_write = executor.submit(citing_write, citing_session)
                wait_for_backend_lock_wait(engine, backend_pid=citing_backend_pid)
                _mark_asset_deleting(deleting_connection, source_asset_id=source_asset_id)
            return blocked_citing_write.result(timeout=CONCURRENT_WRITE_TIMEOUT_SECONDS)


def _count_rows_citing_asset(engine: Engine, model, *, source_asset_id: UUID) -> int:
    with DBSession(engine) as verify_session:
        return verify_session.scalar(select(func.count()).select_from(model).where(model.source_asset_id == source_asset_id))


def _asset_column(engine: Engine, column, *, source_asset_id: UUID) -> str:
    with DBSession(engine) as verify_session:
        return verify_session.scalar(select(column).where(SourceAsset.id == source_asset_id))


def test_create_relationship_rejects_asset_whose_delete_commits_while_insert_waits(
    postgres_engine: Engine,
) -> None:
    # Arrange
    seeded_ids = _seed_campaign_with_active_asset(postgres_engine)

    def create_citing_relationship(citing_session: DBSession) -> Relationship:
        return create_relationship(
            citing_session,
            campaign_id=seeded_ids["campaign_id"],
            relationship_create=RelationshipCreate(
                source_entity_id=seeded_ids["source_entity_id"],
                target_entity_id=seeded_ids["target_entity_id"],
                relationship_type="spouse_of",
                lifecycle_status="current",
                visibility_status="public",
                certainty_status="confirmed",
                source_asset_id=seeded_ids["source_asset_id"],
            ),
        )

    # Act / Assert
    with pytest.raises(ConflictError, match="deletion is in progress"):
        _run_citing_write_while_asset_delete_holds_row_lock(
            postgres_engine,
            source_asset_id=seeded_ids["source_asset_id"],
            citing_write=create_citing_relationship,
        )

    assert _count_rows_citing_asset(postgres_engine, Relationship, source_asset_id=seeded_ids["source_asset_id"]) == 0


def test_entity_insert_rejects_asset_whose_delete_commits_while_insert_waits(
    postgres_engine: Engine,
) -> None:
    # Arrange
    seeded_ids = _seed_campaign_with_active_asset(postgres_engine)

    def insert_citing_entity(citing_session: DBSession) -> None:
        citing_session.add(
            Entity(
                campaign_id=seeded_ids["campaign_id"],
                type="location",
                name="Broken Observatory",
                source_asset_id=seeded_ids["source_asset_id"],
            )
        )
        citing_session.commit()

    # Act / Assert
    with pytest.raises(IntegrityError, match="deletion is in progress"):
        _run_citing_write_while_asset_delete_holds_row_lock(
            postgres_engine,
            source_asset_id=seeded_ids["source_asset_id"],
            citing_write=insert_citing_entity,
        )

    assert _count_rows_citing_asset(postgres_engine, Entity, source_asset_id=seeded_ids["source_asset_id"]) == 0


def test_begin_asset_delete_waits_for_uncommitted_citing_insert_and_then_rejects_delete(
    postgres_engine: Engine,
) -> None:
    # Arrange
    seeded_ids = _seed_campaign_with_active_asset(postgres_engine)
    source_asset_id = seeded_ids["source_asset_id"]

    with DBSession(postgres_engine) as citing_session, DBSession(postgres_engine) as deleting_session:
        with ThreadPoolExecutor(max_workers=1) as executor:
            citing_session.add(
                Entity(
                    campaign_id=seeded_ids["campaign_id"],
                    type="location",
                    name="Broken Observatory",
                    source_asset_id=source_asset_id,
                )
            )
            citing_session.flush()
            deleting_backend_pid = _backend_pid(deleting_session)

            # Act
            asset_delete = executor.submit(
                _begin_asset_delete,
                deleting_session,
                campaign_id=seeded_ids["campaign_id"],
                asset_id=source_asset_id,
            )
            wait_for_backend_lock_wait(postgres_engine, backend_pid=deleting_backend_pid, stop_waiting=asset_delete.done)
            citing_session.commit()

            # Assert
            with pytest.raises(ConflictError):
                asset_delete.result(timeout=CONCURRENT_WRITE_TIMEOUT_SECONDS)

    assert _asset_column(postgres_engine, SourceAsset.lifecycle_status, source_asset_id=source_asset_id) == "active"
    assert _count_rows_citing_asset(postgres_engine, Entity, source_asset_id=source_asset_id) == 1


def test_twin_transactions_that_cite_an_asset_and_then_update_it_both_commit(
    postgres_engine: Engine,
) -> None:
    # Arrange
    seeded_ids = _seed_campaign_with_active_asset(postgres_engine)
    source_asset_id = seeded_ids["source_asset_id"]

    def update_asset_parse_status(citing_session: DBSession) -> None:
        citing_session.execute(
            text("UPDATE source_assets SET parse_status = 'running' WHERE id = :asset_id"),
            {"asset_id": source_asset_id},
        )

    with DBSession(postgres_engine) as first_session, DBSession(postgres_engine) as second_session:
        with ThreadPoolExecutor(max_workers=2) as executor:
            for citing_session in (first_session, second_session):
                citing_session.add(
                    ExtractionJob(
                        campaign_id=seeded_ids["campaign_id"],
                        source_asset_id=source_asset_id,
                        status="pending",
                        extractor_kind="rules",
                    )
                )
                citing_session.flush()
            first_backend_pid = _backend_pid(first_session)
            second_backend_pid = _backend_pid(second_session)

            # Act
            first_update = executor.submit(update_asset_parse_status, first_session)
            wait_for_backend_lock_wait(postgres_engine, backend_pid=first_backend_pid, stop_waiting=first_update.done)
            second_update = executor.submit(update_asset_parse_status, second_session)
            wait_for_backend_lock_wait(postgres_engine, backend_pid=second_backend_pid, stop_waiting=second_update.done)

            first_update.result(timeout=CONCURRENT_WRITE_TIMEOUT_SECONDS)
            first_session.commit()
            second_update.result(timeout=CONCURRENT_WRITE_TIMEOUT_SECONDS)
            second_session.commit()

    # Assert
    assert _count_rows_citing_asset(postgres_engine, ExtractionJob, source_asset_id=source_asset_id) == 2
    assert _asset_column(postgres_engine, SourceAsset.parse_status, source_asset_id=source_asset_id) == "running"
