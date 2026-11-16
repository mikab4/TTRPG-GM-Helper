from __future__ import annotations

from io import BytesIO
from pathlib import Path
from uuid import UUID

import pytest
from sqlalchemy import Engine, event, func, select
from sqlalchemy.orm import Session as DBSession

from app.models import Campaign, Entity, Relationship, Session, SourceAsset
from app.schemas import AssetCreateFormData
from app.services import ConflictError, asset_service, campaign_service
from app.services.asset_storage import AssetStorage, LocalAssetStorage
from tests.asset_storage_doubles import (
    build_delete_failing_asset_storage,
    build_recording_asset_storage,
    build_upload_file,
)
from tests.factories import (
    CampaignFactory,
    EntityFactory,
    OwnerFactory,
    RelationshipFactory,
    SessionFactory,
    SourceAssetFactory,
)


def _count_campaign_rows(db_session: DBSession, model: type, campaign_id: UUID) -> int:
    return db_session.scalar(select(func.count()).select_from(model).where(model.campaign_id == campaign_id))


def test_delete_campaign_removes_session_and_session_linked_source_asset(postgres_engine: Engine, tmp_path: Path) -> None:
    # Arrange
    with DBSession(postgres_engine) as arrange_session:
        owner = OwnerFactory.create_in_session(arrange_session)
        deleted_campaign = CampaignFactory.create_in_session(arrange_session, owner=owner, name="Iron Vale")
        kept_campaign = CampaignFactory.create_in_session(arrange_session, owner=owner, name="Starfall")
        for campaign in (deleted_campaign, kept_campaign):
            play_session = SessionFactory.create_in_session(arrange_session, campaign_id=campaign.id, session_number=1)
            SourceAssetFactory.create_in_session(
                arrange_session,
                campaign_id=campaign.id,
                session_id=play_session.id,
            )
        arrange_session.commit()
        deleted_campaign_id = deleted_campaign.id
        kept_campaign_id = kept_campaign.id

    # Act
    with DBSession(postgres_engine) as delete_session:
        campaign_service.delete_campaign(
            delete_session,
            deleted_campaign_id,
            asset_storage=LocalAssetStorage(storage_root=tmp_path / "asset-storage"),
        )

    # Assert
    with DBSession(postgres_engine) as assert_session:
        assert assert_session.get(Campaign, deleted_campaign_id) is None
        assert _count_campaign_rows(assert_session, Session, deleted_campaign_id) == 0
        assert _count_campaign_rows(assert_session, SourceAsset, deleted_campaign_id) == 0

        assert assert_session.get(Campaign, kept_campaign_id) is not None
        assert _count_campaign_rows(assert_session, Session, kept_campaign_id) == 1
        kept_asset = assert_session.scalars(select(SourceAsset).where(SourceAsset.campaign_id == kept_campaign_id)).one()
        kept_play_session = assert_session.scalars(select(Session).where(Session.campaign_id == kept_campaign_id)).one()
        assert kept_asset.session_id == kept_play_session.id


def test_delete_campaign_removes_relationship_citing_source_asset(postgres_engine: Engine, tmp_path: Path) -> None:
    # Arrange
    with DBSession(postgres_engine) as arrange_session:
        owner = OwnerFactory.create_in_session(arrange_session)
        deleted_campaign = CampaignFactory.create_in_session(arrange_session, owner=owner, name="Iron Vale")
        kept_campaign = CampaignFactory.create_in_session(arrange_session, owner=owner, name="Starfall")
        for campaign in (deleted_campaign, kept_campaign):
            source_asset = SourceAssetFactory.create_in_session(arrange_session, campaign_id=campaign.id)
            source_entity = EntityFactory.create_in_session(arrange_session, campaign_id=campaign.id, name="Mara")
            target_entity = EntityFactory.create_in_session(arrange_session, campaign_id=campaign.id, name="Tobin")
            RelationshipFactory.create_in_session(
                arrange_session,
                campaign_id=campaign.id,
                source_entity_id=source_entity.id,
                target_entity_id=target_entity.id,
                source_asset_id=source_asset.id,
                provenance_excerpt="Mara has known Tobin since the siege.",
            )
        arrange_session.commit()
        deleted_campaign_id = deleted_campaign.id
        kept_campaign_id = kept_campaign.id

    # Act
    with DBSession(postgres_engine) as delete_session:
        campaign_service.delete_campaign(
            delete_session,
            deleted_campaign_id,
            asset_storage=LocalAssetStorage(storage_root=tmp_path / "asset-storage"),
        )

    # Assert
    with DBSession(postgres_engine) as assert_session:
        assert assert_session.get(Campaign, deleted_campaign_id) is None
        assert _count_campaign_rows(assert_session, Relationship, deleted_campaign_id) == 0
        assert _count_campaign_rows(assert_session, Entity, deleted_campaign_id) == 0
        assert _count_campaign_rows(assert_session, SourceAsset, deleted_campaign_id) == 0

        assert assert_session.get(Campaign, kept_campaign_id) is not None
        assert _count_campaign_rows(assert_session, Entity, kept_campaign_id) == 2
        kept_asset = assert_session.scalars(select(SourceAsset).where(SourceAsset.campaign_id == kept_campaign_id)).one()
        kept_relationship = assert_session.scalars(
            select(Relationship).where(Relationship.campaign_id == kept_campaign_id)
        ).one()
        assert kept_relationship.source_asset_id == kept_asset.id


def test_delete_campaign_removes_entity_citing_source_asset(postgres_engine: Engine, tmp_path: Path) -> None:
    # Arrange
    with DBSession(postgres_engine) as arrange_session:
        owner = OwnerFactory.create_in_session(arrange_session)
        deleted_campaign = CampaignFactory.create_in_session(arrange_session, owner=owner, name="Iron Vale")
        kept_campaign = CampaignFactory.create_in_session(arrange_session, owner=owner, name="Starfall")
        for campaign in (deleted_campaign, kept_campaign):
            source_asset = SourceAssetFactory.create_in_session(arrange_session, campaign_id=campaign.id)
            EntityFactory.create_in_session(
                arrange_session,
                campaign_id=campaign.id,
                name="Mara",
                source_asset_id=source_asset.id,
                provenance_excerpt="Mara runs the harbor watch.",
            )
        arrange_session.commit()
        deleted_campaign_id = deleted_campaign.id
        kept_campaign_id = kept_campaign.id

    # Act
    with DBSession(postgres_engine) as delete_session:
        campaign_service.delete_campaign(
            delete_session,
            deleted_campaign_id,
            asset_storage=LocalAssetStorage(storage_root=tmp_path / "asset-storage"),
        )

    # Assert
    with DBSession(postgres_engine) as assert_session:
        assert assert_session.get(Campaign, deleted_campaign_id) is None
        assert _count_campaign_rows(assert_session, Entity, deleted_campaign_id) == 0
        assert _count_campaign_rows(assert_session, SourceAsset, deleted_campaign_id) == 0

        assert assert_session.get(Campaign, kept_campaign_id) is not None
        kept_asset = assert_session.scalars(select(SourceAsset).where(SourceAsset.campaign_id == kept_campaign_id)).one()
        kept_entity = assert_session.scalars(select(Entity).where(Entity.campaign_id == kept_campaign_id)).one()
        assert kept_entity.source_asset_id == kept_asset.id


def _upload_asset(
    db_session: DBSession,
    *,
    campaign_id: UUID,
    filename: str,
    asset_storage: AssetStorage,
) -> SourceAsset:
    return asset_service.create_asset(
        db_session,
        campaign_id=campaign_id,
        asset_create=AssetCreateFormData(),
        upload_file=build_upload_file(file_obj=BytesIO(filename.encode()), filename=filename),
        asset_storage=asset_storage,
    )


def _arrange_campaign_with_cited_uploaded_assets(
    postgres_engine: Engine,
    *,
    asset_storage: AssetStorage,
    campaign_name: str,
) -> tuple[UUID, list[str]]:
    with DBSession(postgres_engine) as arrange_session:
        owner = OwnerFactory.create_in_session(arrange_session)
        campaign = CampaignFactory.create_in_session(arrange_session, owner=owner, name=campaign_name)
        arrange_session.commit()
        campaign_id = campaign.id
        entity_source_asset = _upload_asset(
            arrange_session, campaign_id=campaign_id, filename="watch.txt", asset_storage=asset_storage
        )
        relationship_source_asset = _upload_asset(
            arrange_session, campaign_id=campaign_id, filename="siege.txt", asset_storage=asset_storage
        )
        uncited_asset = _upload_asset(
            arrange_session, campaign_id=campaign_id, filename="rumors.txt", asset_storage=asset_storage
        )
        source_entity = EntityFactory.create_in_session(
            arrange_session,
            campaign_id=campaign_id,
            name="Mara",
            source_asset_id=entity_source_asset.id,
            provenance_excerpt="Mara runs the harbor watch.",
        )
        target_entity = EntityFactory.create_in_session(arrange_session, campaign_id=campaign_id, name="Tobin")
        RelationshipFactory.create_in_session(
            arrange_session,
            campaign_id=campaign_id,
            source_entity_id=source_entity.id,
            target_entity_id=target_entity.id,
            source_asset_id=relationship_source_asset.id,
            provenance_excerpt="Mara has known Tobin since the siege.",
        )
        stored_asset_keys = [
            entity_source_asset.storage_key,
            relationship_source_asset.storage_key,
            uncited_asset.storage_key,
        ]
        arrange_session.commit()
        return campaign_id, stored_asset_keys


def test_delete_campaign_removes_uploaded_files_of_cited_assets(postgres_engine: Engine, tmp_path: Path) -> None:
    # Arrange
    asset_storage_root = tmp_path / "asset-storage"
    asset_storage = build_recording_asset_storage(storage_root=asset_storage_root)
    deleted_campaign_id, deleted_asset_keys = _arrange_campaign_with_cited_uploaded_assets(
        postgres_engine, asset_storage=asset_storage, campaign_name="Iron Vale"
    )
    kept_campaign_id, kept_asset_keys = _arrange_campaign_with_cited_uploaded_assets(
        postgres_engine, asset_storage=asset_storage, campaign_name="Starfall"
    )

    # Act
    with DBSession(postgres_engine) as delete_session:
        campaign_service.delete_campaign(delete_session, deleted_campaign_id, asset_storage=asset_storage)

    # Assert
    assert sorted(asset_storage.deleted_keys) == sorted(deleted_asset_keys)
    assert not any((asset_storage_root / storage_key).exists() for storage_key in deleted_asset_keys)
    assert all((asset_storage_root / storage_key).is_file() for storage_key in kept_asset_keys)
    with DBSession(postgres_engine) as assert_session:
        assert assert_session.get(Campaign, deleted_campaign_id) is None
        for model in (SourceAsset, Entity, Relationship):
            assert _count_campaign_rows(assert_session, model, deleted_campaign_id) == 0
        assert assert_session.get(Campaign, kept_campaign_id) is not None
        kept_lifecycle_statuses = assert_session.scalars(
            select(SourceAsset.lifecycle_status).where(SourceAsset.campaign_id == kept_campaign_id)
        ).all()
        assert kept_lifecycle_statuses == ["active", "active", "active"]


def test_delete_campaign_completes_when_repeated_after_file_removal_failed(
    postgres_engine: Engine,
    tmp_path: Path,
) -> None:
    # Arrange
    asset_storage_root = tmp_path / "asset-storage"
    upload_storage = build_recording_asset_storage(storage_root=asset_storage_root)
    failing_storage = build_delete_failing_asset_storage(storage_root=asset_storage_root)
    campaign_id, campaign_asset_keys = _arrange_campaign_with_cited_uploaded_assets(
        postgres_engine, asset_storage=upload_storage, campaign_name="Iron Vale"
    )
    with DBSession(postgres_engine) as failing_session:
        with pytest.raises(ConflictError, match="Delete the campaign again to finish."):
            campaign_service.delete_campaign(failing_session, campaign_id, asset_storage=failing_storage)
    with DBSession(postgres_engine) as check_session:
        assert check_session.get(Campaign, campaign_id) is not None
        failed_asset_states = check_session.execute(
            select(SourceAsset.lifecycle_status, SourceAsset.delete_last_error_message).where(
                SourceAsset.campaign_id == campaign_id
            )
        ).all()
        assert set(failed_asset_states) == {("deleting", "Source asset delete could not remove the backing file.")}
    assert all((asset_storage_root / storage_key).is_file() for storage_key in campaign_asset_keys)
    recovered_storage = build_recording_asset_storage(storage_root=asset_storage_root)

    # Act
    with DBSession(postgres_engine) as repeat_session:
        campaign_service.delete_campaign(repeat_session, campaign_id, asset_storage=recovered_storage)

    # Assert
    assert not any((asset_storage_root / storage_key).exists() for storage_key in campaign_asset_keys)
    with DBSession(postgres_engine) as assert_session:
        assert assert_session.get(Campaign, campaign_id) is None
        for model in (SourceAsset, Entity, Relationship):
            assert _count_campaign_rows(assert_session, model, campaign_id) == 0


def test_delete_campaign_locks_asset_rows_before_marking_them_deleting(
    postgres_engine: Engine,
    tmp_path: Path,
) -> None:
    # Arrange
    asset_storage = build_recording_asset_storage(storage_root=tmp_path / "asset-storage")
    campaign_id, _ = _arrange_campaign_with_cited_uploaded_assets(
        postgres_engine, asset_storage=asset_storage, campaign_name="Iron Vale"
    )
    executed_statements: list[str] = []

    def record_statement(conn, cursor, statement, parameters, context, executemany) -> None:
        executed_statements.append(" ".join(statement.split()))

    event.listen(postgres_engine, "before_cursor_execute", record_statement)

    # Act
    try:
        with DBSession(postgres_engine) as delete_session:
            campaign_service.delete_campaign(delete_session, campaign_id, asset_storage=asset_storage)
    finally:
        event.remove(postgres_engine, "before_cursor_execute", record_statement)

    # Assert
    locking_select_index = next(
        index
        for index, statement in enumerate(executed_statements)
        if statement.startswith("SELECT") and "FROM source_assets" in statement and statement.endswith("FOR UPDATE")
    )
    marking_update_index = next(
        index
        for index, statement in enumerate(executed_statements)
        if statement.startswith("UPDATE source_assets SET lifecycle_status")
    )
    assert locking_select_index < marking_update_index
