"""Race tests for the `enforce_active_source_asset_reference` trigger function.

The asset delete path locks the asset row `FOR UPDATE`, checks for references,
and then marks the asset `deleting`. A citing insert that starts while that
lock is held must not be accepted once the delete commits.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID

import pytest
from sqlalchemy import Engine, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from app.config import Settings
from app.models import Campaign, Entity, Owner, Relationship, SourceAsset
from app.schemas.relationships import RelationshipCreate
from app.services.errors import ConflictError
from app.services.relationship_service import create_relationship
from tests.pg_test_support import upgraded_postgres_test_engine, wait_for_backend_lock_wait

CITING_WRITE_TIMEOUT_SECONDS = 10.0


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


def _run_citing_write_during_asset_delete(
    engine: Engine,
    *,
    source_asset_id: UUID,
    citing_write: Callable[[DBSession], object],
) -> object:
    """Run `citing_write` while another transaction locks and deletes the asset.

    Returns the citing write's result, or re-raises the exception it raised.
    """
    deleting_connection = engine.connect()
    deleting_transaction = deleting_connection.begin()
    citing_session = DBSession(engine)
    executor = ThreadPoolExecutor(max_workers=1)
    try:
        # Step a: the delete transaction locks the asset row, as `_begin_asset_delete` does.
        deleting_connection.execute(
            text("SELECT id FROM source_assets WHERE id = :asset_id FOR UPDATE"),
            {"asset_id": source_asset_id},
        )

        # Step b: the citing transaction starts its write on another connection and blocks.
        citing_backend_pid = citing_session.connection().execute(text("SELECT pg_backend_pid()")).scalar_one()
        citing_future = executor.submit(citing_write, citing_session)
        wait_for_backend_lock_wait(engine, backend_pid=citing_backend_pid)

        # Step c: the delete transaction marks the asset deleting and commits.
        deleting_connection.execute(
            text("UPDATE source_assets SET lifecycle_status = 'deleting' WHERE id = :asset_id"),
            {"asset_id": source_asset_id},
        )
        deleting_transaction.commit()

        # Step d: the citing write unblocks.
        return citing_future.result(timeout=CITING_WRITE_TIMEOUT_SECONDS)
    finally:
        if deleting_transaction.is_active:
            deleting_transaction.rollback()
        deleting_connection.close()
        executor.shutdown(wait=True)
        citing_session.close()


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
        _run_citing_write_during_asset_delete(
            postgres_engine,
            source_asset_id=seeded_ids["source_asset_id"],
            citing_write=create_citing_relationship,
        )

    with DBSession(postgres_engine) as verify_session:
        citing_relationship_count = verify_session.scalar(
            select(func.count())
            .select_from(Relationship)
            .where(Relationship.source_asset_id == seeded_ids["source_asset_id"])
        )
    assert citing_relationship_count == 0


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
        _run_citing_write_during_asset_delete(
            postgres_engine,
            source_asset_id=seeded_ids["source_asset_id"],
            citing_write=insert_citing_entity,
        )

    with DBSession(postgres_engine) as verify_session:
        citing_entity_count = verify_session.scalar(
            select(func.count()).select_from(Entity).where(Entity.source_asset_id == seeded_ids["source_asset_id"])
        )
    assert citing_entity_count == 0
