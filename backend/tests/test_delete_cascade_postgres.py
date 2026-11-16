from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session as DBSession

from app.config import Settings
from app.models import Campaign, Entity, Relationship
from app.services import campaign_service, entity_service
from app.services.asset_storage import LocalAssetStorage
from tests.factories import CampaignFactory, EntityFactory, OwnerFactory, RelationshipFactory
from tests.pg_test_support import upgraded_postgres_test_engine


@pytest.fixture
def postgres_engine(
    monkeypatch: pytest.MonkeyPatch,
    postgres_test_settings: Settings,
) -> Engine:
    with upgraded_postgres_test_engine(
        monkeypatch=monkeypatch,
        settings=postgres_test_settings,
    ) as engine:
        yield engine


def test_delete_entity_cascades_its_relationships_on_postgres(postgres_engine: Engine) -> None:
    # Arrange
    with DBSession(postgres_engine) as arrange_session:
        owner = OwnerFactory.create_in_session(arrange_session)
        campaign = CampaignFactory.create_in_session(arrange_session, owner=owner, name="Iron Vale")
        deleted_entity = EntityFactory.create_in_session(arrange_session, campaign_id=campaign.id, name="Mara")
        guild_entity = EntityFactory.create_in_session(arrange_session, campaign_id=campaign.id, name="Harbor Guild")
        watch_entity = EntityFactory.create_in_session(arrange_session, campaign_id=campaign.id, name="City Watch")
        outgoing_relationship = RelationshipFactory.create_in_session(
            arrange_session,
            campaign_id=campaign.id,
            source_entity_id=deleted_entity.id,
            target_entity_id=guild_entity.id,
        )
        incoming_relationship = RelationshipFactory.create_in_session(
            arrange_session,
            campaign_id=campaign.id,
            source_entity_id=watch_entity.id,
            target_entity_id=deleted_entity.id,
        )
        arrange_session.commit()
        campaign_id = campaign.id
        deleted_entity_id = deleted_entity.id
        remaining_entity_ids = {guild_entity.id, watch_entity.id}
        relationship_ids = {outgoing_relationship.id, incoming_relationship.id}

    # Act
    with DBSession(postgres_engine) as act_session:
        entity_service.delete_entity(
            act_session,
            campaign_id=campaign_id,
            entity_id=deleted_entity_id,
        )

    # Assert
    with DBSession(postgres_engine) as assert_session:
        assert assert_session.get(Entity, deleted_entity_id) is None
        assert assert_session.scalars(select(Relationship.id).where(Relationship.id.in_(relationship_ids))).all() == []
        assert set(assert_session.scalars(select(Entity.id).where(Entity.campaign_id == campaign_id))) == (
            remaining_entity_ids
        )


def test_delete_campaign_removes_its_entities_and_relationships_on_postgres(
    postgres_engine: Engine,
    tmp_path: Path,
) -> None:
    # Arrange
    with DBSession(postgres_engine) as arrange_session:
        owner = OwnerFactory.create_in_session(arrange_session)
        campaign = CampaignFactory.create_in_session(arrange_session, owner=owner, name="Iron Vale")
        source_entity = EntityFactory.create_in_session(arrange_session, campaign_id=campaign.id, name="Mara")
        target_entity = EntityFactory.create_in_session(arrange_session, campaign_id=campaign.id, name="Harbor Guild")
        RelationshipFactory.create_in_session(
            arrange_session,
            campaign_id=campaign.id,
            source_entity_id=source_entity.id,
            target_entity_id=target_entity.id,
        )
        arrange_session.commit()
        campaign_id = campaign.id

    # Act
    with DBSession(postgres_engine) as act_session:
        campaign_service.delete_campaign(
            act_session,
            campaign_id,
            asset_storage=LocalAssetStorage(storage_root=tmp_path / "asset-storage"),
        )

    # Assert
    with DBSession(postgres_engine) as assert_session:
        assert assert_session.get(Campaign, campaign_id) is None
        assert assert_session.scalars(select(Entity.id).where(Entity.campaign_id == campaign_id)).all() == []
        assert assert_session.scalars(select(Relationship.id).where(Relationship.campaign_id == campaign_id)).all() == []
