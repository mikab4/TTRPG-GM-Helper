from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from app import services
from app.models.relationship_type_definition import RelationshipTypeDefinition


def test_create_relationship_returns_created_record_with_catalog_metadata(
    api_request,
    campaign_factory,
    entity_factory,
) -> None:
    test_campaign = campaign_factory()
    source_entity = entity_factory(
        campaign_id=test_campaign.id,
        type="person",
        name="Tarannon",
    )
    target_entity = entity_factory(
        campaign_id=test_campaign.id,
        type="person",
        name="Civu",
    )

    response = api_request(
        "POST",
        f"/api/campaigns/{test_campaign.id}/relationships",
        json={
            "source_entity_id": str(source_entity.id),
            "target_entity_id": str(target_entity.id),
            "relationship_type": "spouse_of",
            "lifecycle_status": "current",
            "visibility_status": "secret",
            "certainty_status": "confirmed",
            "notes": "They conceal the marriage from the court.",
        },
    )

    assert response.status_code == 201
    relationship_data = response.json()
    assert relationship_data["relationship_type"] == "spouse_of"
    assert relationship_data["relationship_family"] == "romance"
    assert relationship_data["relationship_family_label"] == "Romance"
    assert relationship_data["forward_label"] == "spouse of"
    assert relationship_data["reverse_label"] == "spouse of"
    assert relationship_data["visibility_status"] == "secret"


def test_build_relationship_response_payloads_reuses_descriptor_for_repeated_custom_type(
    db_session_factory,
    monkeypatch,
    campaign_factory,
    entity_factory,
    relationship_factory,
) -> None:
    test_campaign = campaign_factory()

    with db_session_factory() as db_session:
        source_entity = entity_factory(
            db_session=db_session,
            campaign_id=test_campaign.id,
            type="person",
            name="Tarannon",
        )
        target_entity = entity_factory(
            db_session=db_session,
            campaign_id=test_campaign.id,
            type="person",
            name="Civu",
        )
        third_entity = entity_factory(
            db_session=db_session,
            campaign_id=test_campaign.id,
            type="person",
            name="Ilya",
        )
        db_session.add(
            RelationshipTypeDefinition(
                id=uuid4(),
                campaign_id=test_campaign.id,
                key="bodyguard_of",
                label="bodyguard of",
                family="social",
                reverse_label="guarded by",
                is_symmetric=False,
                allowed_source_types=["person"],
                allowed_target_types=["person"],
            )
        )
        relationship_factory(
            db_session=db_session,
            campaign_id=test_campaign.id,
            source_entity=source_entity,
            target_entity=target_entity,
            relationship_type="bodyguard_of",
            lifecycle_status="current",
            visibility_status="public",
            certainty_status="confirmed",
        )
        relationship_factory(
            db_session=db_session,
            campaign_id=test_campaign.id,
            source_entity=third_entity,
            target_entity=target_entity,
            relationship_type="bodyguard_of",
            lifecycle_status="current",
            visibility_status="public",
            certainty_status="confirmed",
        )
        db_session.commit()

        descriptor_lookup_count = 0
        original_get_relationship_type_descriptor = (
            services.relationship_descriptor_resolver.get_relationship_type_descriptor
        )

        def counting_get_relationship_type_descriptor(*args, **kwargs):
            nonlocal descriptor_lookup_count
            descriptor_lookup_count += 1
            return original_get_relationship_type_descriptor(*args, **kwargs)

        monkeypatch.setattr(
            services.relationship_descriptor_resolver,
            "get_relationship_type_descriptor",
            counting_get_relationship_type_descriptor,
        )

        listed_relationships = services.relationship_service.list_relationships(
            db_session,
            campaign_id=test_campaign.id,
        )

        payloads = services.relationship_mapper.build_relationship_response_payloads(
            db_session,
            relationships=listed_relationships,
        )

    assert [payload["relationship_type"] for payload in payloads] == [
        "bodyguard_of",
        "bodyguard_of",
    ]
    assert descriptor_lookup_count == 1


def test_create_relationship_rejects_cross_campaign_target_entity(
    api_request,
    owner_factory,
    campaign_factory,
    entity_factory,
) -> None:
    test_owner = owner_factory()
    test_campaign = campaign_factory(owner=test_owner)
    second_campaign = campaign_factory(owner=test_owner, name="Second Campaign")
    source_entity = entity_factory(
        campaign_id=test_campaign.id,
        type="person",
        name="Tarannon",
    )
    foreign_target_entity = entity_factory(
        campaign_id=second_campaign.id,
        type="person",
        name="Civu",
    )

    response = api_request(
        "POST",
        f"/api/campaigns/{test_campaign.id}/relationships",
        json={
            "source_entity_id": str(source_entity.id),
            "target_entity_id": str(foreign_target_entity.id),
            "relationship_type": "spouse_of",
            "lifecycle_status": "current",
            "visibility_status": "public",
            "certainty_status": "confirmed",
        },
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Target entity not found."}


def test_create_relationship_rejects_invalid_type_pair(
    api_request,
    campaign_factory,
    entity_factory,
) -> None:
    test_campaign = campaign_factory()
    source_entity = entity_factory(
        campaign_id=test_campaign.id,
        type="organization",
        name="The Choir",
    )
    target_entity = entity_factory(
        campaign_id=test_campaign.id,
        type="location",
        name="Gawo",
    )

    response = api_request(
        "POST",
        f"/api/campaigns/{test_campaign.id}/relationships",
        json={
            "source_entity_id": str(source_entity.id),
            "target_entity_id": str(target_entity.id),
            "relationship_type": "spouse_of",
            "lifecycle_status": "current",
            "visibility_status": "public",
            "certainty_status": "confirmed",
        },
    )

    assert response.status_code == 422
    assert (
        response.json()["detail"]
        == "Relationship type is not valid for the source and target entity types."
    )


def test_create_relationship_rejects_source_asset_when_asset_delete_is_in_progress(
    api_request,
    campaign_factory,
    entity_factory,
    source_asset_factory,
) -> None:
    test_campaign = campaign_factory()
    source_entity = entity_factory(
        campaign_id=test_campaign.id,
        type="person",
        name="Tarannon",
    )
    target_entity = entity_factory(
        campaign_id=test_campaign.id,
        type="person",
        name="Civu",
    )
    deleting_asset = source_asset_factory(
        campaign=test_campaign,
        lifecycle_status="deleting",
    )

    response = api_request(
        "POST",
        f"/api/campaigns/{test_campaign.id}/relationships",
        json={
            "source_entity_id": str(source_entity.id),
            "target_entity_id": str(target_entity.id),
            "relationship_type": "spouse_of",
            "lifecycle_status": "current",
            "visibility_status": "public",
            "certainty_status": "confirmed",
            "source_asset_id": str(deleting_asset.id),
        },
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Source asset cannot accept new provenance references while deletion is in progress."
    }


def test_create_relationship_returns_conflict_when_trigger_backstop_rejects_asset_reference(
    api_request,
    campaign_factory,
    entity_factory,
    source_asset_factory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    test_campaign = campaign_factory()
    source_entity = entity_factory(
        campaign_id=test_campaign.id,
        type="person",
        name="Tarannon",
    )
    target_entity = entity_factory(
        campaign_id=test_campaign.id,
        type="person",
        name="Civu",
    )
    source_asset = source_asset_factory(campaign=test_campaign)

    def failing_commit(self) -> None:
        raise IntegrityError(
            "INSERT INTO entity_relationships",
            params=None,
            orig=Exception(
                "Source asset cannot accept new provenance references while deletion is in progress."
            ),
        )

    monkeypatch.setattr("app.services.relationship_service.Session.commit", failing_commit)

    response = api_request(
        "POST",
        f"/api/campaigns/{test_campaign.id}/relationships",
        json={
            "source_entity_id": str(source_entity.id),
            "target_entity_id": str(target_entity.id),
            "relationship_type": "spouse_of",
            "lifecycle_status": "current",
            "visibility_status": "public",
            "certainty_status": "confirmed",
            "source_asset_id": str(source_asset.id),
        },
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Source asset cannot accept new provenance references while deletion is in progress."
    }


def test_create_relationship_rejects_inverse_duplicate_for_symmetric_type(
    api_request,
    campaign_factory,
    entity_factory,
    relationship_factory,
) -> None:
    test_campaign = campaign_factory()
    first_entity = entity_factory(
        campaign_id=test_campaign.id,
        type="person",
        name="Jo",
    )
    second_entity = entity_factory(
        campaign_id=test_campaign.id,
        type="person",
        name="Mika",
    )
    relationship_factory(
        campaign_id=test_campaign.id,
        source_entity=first_entity,
        target_entity=second_entity,
        relationship_type="sibling_of",
        lifecycle_status="current",
        visibility_status="public",
        certainty_status="confirmed",
    )

    response = api_request(
        "POST",
        f"/api/campaigns/{test_campaign.id}/relationships",
        json={
            "source_entity_id": str(second_entity.id),
            "target_entity_id": str(first_entity.id),
            "relationship_type": "sibling_of",
            "lifecycle_status": "current",
            "visibility_status": "public",
            "certainty_status": "confirmed",
        },
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Symmetric relationship already exists for these entities."
    }


def test_list_relationships_supports_type_and_family_filters(
    api_request,
    campaign_factory,
    entity_factory,
    relationship_factory,
) -> None:
    test_campaign = campaign_factory()
    tarannon = entity_factory(
        campaign_id=test_campaign.id,
        type="person",
        name="Tarannon",
    )
    civu = entity_factory(
        campaign_id=test_campaign.id,
        type="person",
        name="Civu",
    )
    underground = entity_factory(
        campaign_id=test_campaign.id,
        type="organization",
        name="Underground",
    )
    relationship_factory(
        campaign_id=test_campaign.id,
        source_entity=tarannon,
        target_entity=civu,
        relationship_type="spouse_of",
        lifecycle_status="current",
        visibility_status="public",
        certainty_status="confirmed",
    )
    relationship_factory(
        campaign_id=test_campaign.id,
        source_entity=civu,
        target_entity=underground,
        relationship_type="works_for",
        lifecycle_status="current",
        visibility_status="secret",
        certainty_status="rumored",
    )

    response = api_request(
        "GET",
        f"/api/campaigns/{test_campaign.id}/relationships",
        params={"type": "spouse_of", "family": "romance"},
    )

    assert response.status_code == 200
    assert [
        listed_relationship["relationship_type"] for listed_relationship in response.json()
    ] == ["spouse_of"]


def test_list_relationships_supports_family_only_filter(
    api_request,
    campaign_factory,
    entity_factory,
    relationship_factory,
) -> None:
    test_campaign = campaign_factory()
    tarannon = entity_factory(
        campaign_id=test_campaign.id,
        type="person",
        name="Tarannon",
    )
    civu = entity_factory(
        campaign_id=test_campaign.id,
        type="person",
        name="Civu",
    )
    underground = entity_factory(
        campaign_id=test_campaign.id,
        type="organization",
        name="Underground",
    )
    relationship_factory(
        campaign_id=test_campaign.id,
        source_entity=tarannon,
        target_entity=civu,
        relationship_type="spouse_of",
        lifecycle_status="current",
        visibility_status="public",
        certainty_status="confirmed",
    )
    relationship_factory(
        campaign_id=test_campaign.id,
        source_entity=civu,
        target_entity=underground,
        relationship_type="works_for",
        lifecycle_status="current",
        visibility_status="secret",
        certainty_status="rumored",
    )

    response = api_request(
        "GET",
        f"/api/campaigns/{test_campaign.id}/relationships",
        params={"family": "romance"},
    )

    assert response.status_code == 200
    assert [
        listed_relationship["relationship_type"] for listed_relationship in response.json()
    ] == ["spouse_of"]


def test_list_relationships_rejects_mismatched_type_and_family_filters(
    api_request,
    campaign_factory,
    entity_factory,
    relationship_factory,
) -> None:
    test_campaign = campaign_factory()
    source_entity = entity_factory(
        campaign_id=test_campaign.id,
        type="person",
        name="Tarannon",
    )
    target_entity = entity_factory(
        campaign_id=test_campaign.id,
        type="person",
        name="Civu",
    )
    relationship_factory(
        campaign_id=test_campaign.id,
        source_entity=source_entity,
        target_entity=target_entity,
        relationship_type="spouse_of",
        lifecycle_status="current",
        visibility_status="public",
        certainty_status="confirmed",
    )

    response = api_request(
        "GET",
        f"/api/campaigns/{test_campaign.id}/relationships",
        params={"type": "spouse_of", "family": "social"},
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": "Relationship type does not belong to the requested relationship family."
    }


def test_get_relationship_returns_stored_record(
    api_request,
    campaign_factory,
    entity_factory,
    relationship_factory,
) -> None:
    test_campaign = campaign_factory()
    source_entity = entity_factory(
        campaign_id=test_campaign.id,
        type="person",
        name="Tarannon",
    )
    target_entity = entity_factory(
        campaign_id=test_campaign.id,
        type="location",
        name="Gawo",
    )
    stored_relationship = relationship_factory(
        campaign_id=test_campaign.id,
        source_entity=source_entity,
        target_entity=target_entity,
        relationship_type="lives_in",
        lifecycle_status="current",
        visibility_status="public",
        certainty_status="confirmed",
        notes="Original note",
    )

    get_response = api_request(
        "GET",
        f"/api/campaigns/{test_campaign.id}/relationships/{stored_relationship.id}",
    )

    assert get_response.status_code == 200
    relationship_data = get_response.json()
    assert relationship_data["notes"] == "Original note"
    assert relationship_data["relationship_family"] == "location"


def test_update_relationship_returns_updated_fields(
    api_request,
    campaign_factory,
    entity_factory,
    relationship_factory,
) -> None:
    test_campaign = campaign_factory()
    source_entity = entity_factory(
        campaign_id=test_campaign.id,
        type="person",
        name="Tarannon",
    )
    target_entity = entity_factory(
        campaign_id=test_campaign.id,
        type="location",
        name="Gawo",
    )
    stored_relationship = relationship_factory(
        campaign_id=test_campaign.id,
        source_entity=source_entity,
        target_entity=target_entity,
        relationship_type="lives_in",
        lifecycle_status="current",
        visibility_status="public",
        certainty_status="confirmed",
        notes="Original note",
    )

    response = api_request(
        "PATCH",
        f"/api/campaigns/{test_campaign.id}/relationships/{stored_relationship.id}",
        json={
            "lifecycle_status": "former",
            "visibility_status": "secret",
            "certainty_status": "rumored",
            "notes": "Updated note",
        },
    )

    assert response.status_code == 200
    relationship_data = response.json()
    assert relationship_data["lifecycle_status"] == "former"
    assert relationship_data["visibility_status"] == "secret"
    assert relationship_data["certainty_status"] == "rumored"
    assert relationship_data["notes"] == "Updated note"


def test_delete_relationship_removes_relationship(
    api_request,
    campaign_factory,
    entity_factory,
    relationship_factory,
) -> None:
    test_campaign = campaign_factory()
    source_entity = entity_factory(
        campaign_id=test_campaign.id,
        type="person",
        name="Tarannon",
    )
    target_entity = entity_factory(
        campaign_id=test_campaign.id,
        type="location",
        name="Gawo",
    )
    stored_relationship = relationship_factory(
        campaign_id=test_campaign.id,
        source_entity=source_entity,
        target_entity=target_entity,
        relationship_type="lives_in",
        lifecycle_status="current",
        visibility_status="public",
        certainty_status="confirmed",
    )

    delete_response = api_request(
        "DELETE",
        f"/api/campaigns/{test_campaign.id}/relationships/{stored_relationship.id}",
    )

    assert delete_response.status_code == 204

    missing_response = api_request(
        "GET",
        f"/api/campaigns/{test_campaign.id}/relationships/{stored_relationship.id}",
    )
    assert missing_response.status_code == 404


def test_update_relationship_rejects_invalid_type_pair(
    api_request,
    campaign_factory,
    entity_factory,
    relationship_factory,
) -> None:
    test_campaign = campaign_factory()
    source_entity = entity_factory(
        campaign_id=test_campaign.id,
        type="organization",
        name="The Choir",
    )
    target_entity = entity_factory(
        campaign_id=test_campaign.id,
        type="location",
        name="Gawo",
    )
    stored_relationship = relationship_factory(
        campaign_id=test_campaign.id,
        source_entity=source_entity,
        target_entity=target_entity,
        relationship_type="located_in",
        lifecycle_status="current",
        visibility_status="public",
        certainty_status="confirmed",
    )

    response = api_request(
        "PATCH",
        f"/api/campaigns/{test_campaign.id}/relationships/{stored_relationship.id}",
        json={"relationship_type": "spouse_of"},
    )

    assert response.status_code == 422
    assert (
        response.json()["detail"]
        == "Relationship type is not valid for the source and target entity types."
    )
