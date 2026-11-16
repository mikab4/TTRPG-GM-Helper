from __future__ import annotations

from collections.abc import Iterator

import pytest
from sqlalchemy import Engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from app.models import Campaign, Entity, Owner, Relationship
from app.schemas import RelationshipCreate
from app.services import ConflictError, relationship_service


@pytest.fixture
def postgres_session(postgres_engine: Engine) -> Iterator[DBSession]:
    with DBSession(postgres_engine) as session:
        yield session


def _persist_mentor_and_student(postgres_session: DBSession) -> tuple[Campaign, Entity, Entity]:
    campaign = Campaign(owner=Owner(email="gm@example.com", display_name="Local GM"), name="Iron Vale")
    mentor_entity = Entity(campaign=campaign, type="person", name="Jo")
    student_entity = Entity(campaign=campaign, type="person", name="Mika")
    postgres_session.add_all([campaign, mentor_entity, student_entity])
    postgres_session.commit()
    return campaign, mentor_entity, student_entity


def test_create_relationship_maps_real_postgres_directed_duplicate_race_to_conflict_error(
    postgres_session: DBSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    campaign, mentor_entity, student_entity = _persist_mentor_and_student(postgres_session)
    campaign_id, mentor_entity_id, student_entity_id = campaign.id, mentor_entity.id, student_entity.id
    original_scalar = postgres_session.scalar
    competing_insert_count = 0

    def scalar_then_competing_insert(statement, *args, **kwargs):
        nonlocal competing_insert_count
        result = original_scalar(statement, *args, **kwargs)
        if competing_insert_count == 0 and statement.column_descriptions[0]["entity"] is Relationship:
            competing_insert_count += 1
            with DBSession(postgres_session.get_bind()) as competing_session:
                competing_session.add(
                    Relationship(
                        campaign_id=campaign_id,
                        source_entity_id=mentor_entity_id,
                        target_entity_id=student_entity_id,
                        relationship_type="mentor_of",
                    )
                )
                competing_session.commit()
        return result

    monkeypatch.setattr(postgres_session, "scalar", scalar_then_competing_insert)

    # Act / Assert
    with pytest.raises(ConflictError, match="^Relationship already exists for these entities.$"):
        relationship_service.create_relationship(
            postgres_session,
            campaign_id=campaign_id,
            relationship_create=RelationshipCreate(
                source_entity_id=mentor_entity_id,
                target_entity_id=student_entity_id,
                relationship_type="mentor_of",
                lifecycle_status="current",
                visibility_status="public",
                certainty_status="confirmed",
            ),
        )

    assert competing_insert_count == 1


def test_create_relationship_reraises_real_postgres_check_violation(
    postgres_session: DBSession,
) -> None:
    # Arrange
    campaign, mentor_entity, student_entity = _persist_mentor_and_student(postgres_session)
    out_of_range_confidence_create = RelationshipCreate.model_construct(
        source_entity_id=mentor_entity.id,
        target_entity_id=student_entity.id,
        relationship_type="mentor_of",
        lifecycle_status="current",
        visibility_status="public",
        certainty_status="confirmed",
        notes=None,
        confidence=2,
        source_asset_id=None,
        provenance_excerpt=None,
        provenance_data={},
    )

    # Act / Assert
    with pytest.raises(IntegrityError, match="ck_entity_relationships_confidence_between_0_and_1"):
        relationship_service.create_relationship(
            postgres_session,
            campaign_id=campaign.id,
            relationship_create=out_of_range_confidence_create,
        )
