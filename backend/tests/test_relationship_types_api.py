from __future__ import annotations

from uuid import uuid4

from app.models.relationship_type_definition import RelationshipTypeDefinition


def test_list_relationship_types_includes_built_in_and_custom_types(
    api_request,
    db_session_factory,
    campaign_factory,
) -> None:
    test_campaign = campaign_factory()

    with db_session_factory() as db_session:
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
        db_session.commit()

    response = api_request(
        "GET",
        "/api/relationship-types",
        params={"campaign_id": str(test_campaign.id)},
    )

    assert response.status_code == 200
    listed_types = response.json()
    listed_type_keys = {listed_type["key"] for listed_type in listed_types}
    custom_type_response = next(listed_type for listed_type in listed_types if listed_type["key"] == "bodyguard_of")

    assert "sibling_of" in listed_type_keys
    assert "bodyguard_of" in listed_type_keys
    assert custom_type_response["family_label"] == "Social"


def test_list_relationship_families_returns_backend_canonical_family_metadata(
    api_request,
) -> None:
    response = api_request("GET", "/api/relationship-families")

    assert response.status_code == 200
    relationship_families = response.json()
    assert {"label": "Family", "value": "family"} in relationship_families
    assert {"label": "Organization", "value": "organization"} in relationship_families
    assert {"label": "Influence", "value": "influence"} in relationship_families


def test_create_custom_relationship_type_returns_created_record(
    api_request,
    campaign_factory,
) -> None:
    test_campaign = campaign_factory()

    response = api_request(
        "POST",
        f"/api/campaigns/{test_campaign.id}/relationship-types",
        json={
            "label": "bodyguard of",
            "family": "social",
            "reverse_label": "guarded by",
            "is_symmetric": False,
            "allowed_source_types": ["person"],
            "allowed_target_types": ["person"],
        },
    )

    assert response.status_code == 201
    response_data = response.json()
    assert response_data["key"] == "bodyguard_of"
    assert response_data["label"] == "bodyguard of"
    assert response_data["family"] == "social"
    assert response_data["family_label"] == "Social"
    assert response_data["is_custom"] is True


def test_update_custom_relationship_type_rejects_semantic_changes_when_type_is_in_use(
    api_request,
    db_session_factory,
    campaign_factory,
    entity_factory,
    relationship_factory,
) -> None:
    test_campaign = campaign_factory()

    with db_session_factory() as db_session:
        entity_a = entity_factory(
            db_session=db_session,
            campaign_id=test_campaign.id,
            type="person",
            name="Martha",
        )
        entity_b = entity_factory(
            db_session=db_session,
            campaign_id=test_campaign.id,
            type="person",
            name="Rick",
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
            source_entity=entity_a,
            target_entity=entity_b,
            relationship_type="bodyguard_of",
            lifecycle_status="current",
            visibility_status="public",
            certainty_status="confirmed",
        )
        db_session.commit()

    response = api_request(
        "PATCH",
        f"/api/campaigns/{test_campaign.id}/relationship-types/bodyguard_of",
        json={"allowed_target_types": ["organization"]},
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Semantic fields cannot change after a type is in use."}


def test_update_custom_relationship_type_rejects_payload_with_symmetric_and_reverse_label(
    api_request,
    db_session_factory,
    campaign_factory,
) -> None:
    test_campaign = campaign_factory()

    with db_session_factory() as db_session:
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
        db_session.commit()

    response = api_request(
        "PATCH",
        f"/api/campaigns/{test_campaign.id}/relationship-types/bodyguard_of",
        json={"is_symmetric": True, "reverse_label": "guarded by"},
    )

    assert response.status_code == 422


def test_update_custom_relationship_type_rejects_reverse_label_for_existing_symmetric_type(
    api_request,
    db_session_factory,
    campaign_factory,
) -> None:
    test_campaign = campaign_factory()

    with db_session_factory() as db_session:
        db_session.add(
            RelationshipTypeDefinition(
                id=uuid4(),
                campaign_id=test_campaign.id,
                key="sibling_oath",
                label="sibling oath",
                family="social",
                reverse_label=None,
                is_symmetric=True,
                allowed_source_types=["person"],
                allowed_target_types=["person"],
            )
        )
        db_session.commit()

    response = api_request(
        "PATCH",
        f"/api/campaigns/{test_campaign.id}/relationship-types/sibling_oath",
        json={"reverse_label": "bound by oath"},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "Symmetric relationship types cannot define a reverse label."}


def test_delete_custom_relationship_type_rejects_used_type(
    api_request,
    db_session_factory,
    campaign_factory,
    entity_factory,
    relationship_factory,
) -> None:
    test_campaign = campaign_factory()

    with db_session_factory() as db_session:
        entity_a = entity_factory(
            db_session=db_session,
            campaign_id=test_campaign.id,
            type="person",
            name="Martha",
        )
        entity_b = entity_factory(
            db_session=db_session,
            campaign_id=test_campaign.id,
            type="person",
            name="Rick",
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
            source_entity=entity_a,
            target_entity=entity_b,
            relationship_type="bodyguard_of",
            lifecycle_status="current",
            visibility_status="public",
            certainty_status="confirmed",
        )
        db_session.commit()

    response = api_request(
        "DELETE",
        f"/api/campaigns/{test_campaign.id}/relationship-types/bodyguard_of",
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Relationship type cannot be deleted while it is in use."}
