from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError

from app.schemas import RelationshipCreate, RelationshipUpdate
from app.services import ConflictError, relationship_service


def test_create_relationship_translates_trigger_backstop_conflict_to_conflict_error(
    db_session_factory,
    campaign_factory,
    entity_factory,
    source_asset_factory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    source_entity = entity_factory(
        campaign_id=stored_campaign.id,
        type="person",
        name="Tarannon",
    )
    target_entity = entity_factory(
        campaign_id=stored_campaign.id,
        type="person",
        name="Civu",
    )
    source_asset = source_asset_factory(campaign=stored_campaign)

    with db_session_factory() as db_session:
        rollback_calls = 0

        def failing_commit() -> None:
            raise IntegrityError(
                "INSERT INTO entity_relationships",
                params=None,
                orig=Exception(
                    "Source asset cannot accept new provenance references while deletion is in progress."
                ),
            )

        def recording_rollback() -> None:
            nonlocal rollback_calls
            rollback_calls += 1

        monkeypatch.setattr(db_session, "commit", failing_commit)
        monkeypatch.setattr(db_session, "rollback", recording_rollback)

        # Act / Assert
        with pytest.raises(
            ConflictError,
            match="Source asset cannot accept new provenance references while deletion is in progress.",
        ):
            relationship_service.create_relationship(
                db_session,
                campaign_id=stored_campaign.id,
                relationship_create=RelationshipCreate(
                    source_entity_id=source_entity.id,
                    target_entity_id=target_entity.id,
                    relationship_type="spouse_of",
                    lifecycle_status="current",
                    visibility_status="public",
                    certainty_status="confirmed",
                    source_asset_id=source_asset.id,
                ),
            )

    assert rollback_calls == 1


def test_update_relationship_translates_trigger_backstop_conflict_to_conflict_error(
    db_session_factory,
    campaign_factory,
    entity_factory,
    relationship_factory,
    source_asset_factory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    source_entity = entity_factory(
        campaign_id=stored_campaign.id,
        type="person",
        name="Tarannon",
    )
    target_entity = entity_factory(
        campaign_id=stored_campaign.id,
        type="person",
        name="Civu",
    )
    original_asset = source_asset_factory(campaign=stored_campaign)
    replacement_asset = source_asset_factory(campaign=stored_campaign)
    stored_relationship = relationship_factory(
        campaign_id=stored_campaign.id,
        source_entity=source_entity,
        target_entity=target_entity,
        relationship_type="spouse_of",
        lifecycle_status="current",
        visibility_status="public",
        certainty_status="confirmed",
        source_asset_id=original_asset.id,
    )

    with db_session_factory() as db_session:
        rollback_calls = 0

        def failing_commit() -> None:
            raise IntegrityError(
                "UPDATE entity_relationships",
                params=None,
                orig=Exception(
                    "Source asset cannot accept new provenance references while deletion is in progress."
                ),
            )

        def recording_rollback() -> None:
            nonlocal rollback_calls
            rollback_calls += 1

        monkeypatch.setattr(db_session, "commit", failing_commit)
        monkeypatch.setattr(db_session, "rollback", recording_rollback)

        # Act / Assert
        with pytest.raises(
            ConflictError,
            match="Source asset cannot accept new provenance references while deletion is in progress.",
        ):
            relationship_service.update_relationship(
                db_session,
                campaign_id=stored_campaign.id,
                relationship_id=stored_relationship.id,
                relationship_update=RelationshipUpdate(
                    source_asset_id=replacement_asset.id,
                ),
            )

    assert rollback_calls == 1
