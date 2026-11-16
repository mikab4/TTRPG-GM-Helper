from __future__ import annotations

from collections.abc import Iterator
from uuid import UUID

import pytest
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session as DBSession

from app.config import Settings
from app.models import Campaign, Entity, Relationship, Session, SourceAsset
from app.services import campaign_service
from tests.factories import (
    CampaignFactory,
    EntityFactory,
    OwnerFactory,
    RelationshipFactory,
    SessionFactory,
    SourceAssetFactory,
)
from tests.pg_test_support import upgraded_postgres_test_engine

# These tests create source asset rows without stored files, so they cover the
# database cascade only. Removing uploaded files on campaign delete is not covered here.


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


def _count_campaign_rows(db_session: DBSession, model: type, campaign_id: UUID) -> int:
    return db_session.scalar(select(func.count()).select_from(model).where(model.campaign_id == campaign_id))


def test_delete_campaign_removes_session_and_session_linked_source_asset(postgres_engine: Engine) -> None:
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
        campaign_service.delete_campaign(delete_session, deleted_campaign_id)

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


def test_delete_campaign_removes_relationship_citing_source_asset(postgres_engine: Engine) -> None:
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
        campaign_service.delete_campaign(delete_session, deleted_campaign_id)

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


def test_delete_campaign_removes_entity_citing_source_asset(postgres_engine: Engine) -> None:
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
        campaign_service.delete_campaign(delete_session, deleted_campaign_id)

    # Assert
    with DBSession(postgres_engine) as assert_session:
        assert assert_session.get(Campaign, deleted_campaign_id) is None
        assert _count_campaign_rows(assert_session, Entity, deleted_campaign_id) == 0
        assert _count_campaign_rows(assert_session, SourceAsset, deleted_campaign_id) == 0

        assert assert_session.get(Campaign, kept_campaign_id) is not None
        kept_asset = assert_session.scalars(select(SourceAsset).where(SourceAsset.campaign_id == kept_campaign_id)).one()
        kept_entity = assert_session.scalars(select(Entity).where(Entity.campaign_id == kept_campaign_id)).one()
        assert kept_entity.source_asset_id == kept_asset.id
