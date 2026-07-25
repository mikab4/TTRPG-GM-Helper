from __future__ import annotations

from uuid import uuid4


def test_create_entity_returns_created_record(
    api_request,
    campaign_factory,
) -> None:
    stored_campaign = campaign_factory()

    response = api_request(
        "POST",
        f"/api/campaigns/{stored_campaign.id}/entities",
        json={
            "type": "person",
            "name": "Magistrate Ilya",
            "summary": "A city official with a hidden agenda.",
            "metadata": {"faction": "City Watch"},
        },
    )

    assert response.status_code == 201
    entity_data = response.json()
    assert entity_data["campaign_id"] == str(stored_campaign.id)
    assert entity_data["type"] == "person"
    assert entity_data["name"] == "Magistrate Ilya"
    assert entity_data["metadata"] == {"faction": "City Watch"}


def test_create_entity_returns_not_found_for_unknown_campaign(api_request) -> None:
    response = api_request(
        "POST",
        f"/api/campaigns/{uuid4()}/entities",
        json={
            "type": "person",
            "name": "Magistrate Ilya",
        },
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Campaign not found."}


def test_create_entity_returns_422_for_blank_name(
    api_request,
    campaign_factory,
) -> None:
    stored_campaign = campaign_factory()

    response = api_request(
        "POST",
        f"/api/campaigns/{stored_campaign.id}/entities",
        json={
            "type": "person",
            "name": "   ",
        },
    )

    assert response.status_code == 422


def test_list_all_entities_returns_cross_campaign_results(
    api_request,
    owner_factory,
    campaign_factory,
    entity_factory,
) -> None:
    owner = owner_factory()
    stored_campaign = campaign_factory(owner=owner)
    second_campaign = campaign_factory(owner=owner, name="Second Campaign")

    entity_factory(campaign_id=stored_campaign.id, type="person", name="Magistrate Ilya")
    entity_factory(campaign_id=second_campaign.id, type="organization", name="Varkesh")

    response = api_request("GET", "/api/entities")

    assert response.status_code == 200
    assert {listed_entity["name"] for listed_entity in response.json()} == {"Magistrate Ilya", "Varkesh",}


def test_list_all_entities_tolerates_legacy_entity_types_in_persisted_rows(
    api_request,
    campaign_factory,
    entity_factory,
) -> None:
    stored_campaign = campaign_factory()
    entity_factory(campaign_id=stored_campaign.id, type="npc", name="Legacy Rowan")

    response = api_request("GET", "/api/entities")

    assert response.status_code == 200
    assert response.json()[0]["type"] == "npc"


def test_list_all_entities_supports_campaign_and_type_filters(
    api_request,
    owner_factory,
    campaign_factory,
    entity_factory,
) -> None:
    owner = owner_factory()
    stored_campaign = campaign_factory(owner=owner)
    second_campaign = campaign_factory(owner=owner, name="Second Campaign")

    entity_factory(campaign_id=stored_campaign.id, type="person", name="Magistrate Ilya")
    entity_factory(campaign_id=stored_campaign.id, type="location", name="Broken Observatory")
    entity_factory(campaign_id=second_campaign.id, type="person", name="Varkesh")

    response = api_request(
        "GET",
        "/api/entities",
        params={
            "campaign_id": str(stored_campaign.id),
            "type": "person",
        },
    )

    assert response.status_code == 200
    assert {listed_entity["name"] for listed_entity in response.json()} == {"Magistrate Ilya",}


def test_list_campaign_entities_supports_type_filter(
    api_request,
    campaign_factory,
    entity_factory,
) -> None:
    stored_campaign = campaign_factory()
    entity_factory(campaign_id=stored_campaign.id, type="person", name="Magistrate Ilya")
    entity_factory(campaign_id=stored_campaign.id, type="location", name="Broken Observatory")

    response = api_request(
        "GET",
        f"/api/campaigns/{stored_campaign.id}/entities",
        params={"type": "person"},
    )

    assert response.status_code == 200
    assert {listed_entity["name"] for listed_entity in response.json()} == {"Magistrate Ilya",}


def test_get_entity_returns_stored_record(
    api_request,
    campaign_factory,
    entity_factory,
) -> None:
    stored_campaign = campaign_factory()
    stored_entity = entity_factory(
        campaign_id=stored_campaign.id,
        type="person",
        name="Magistrate Ilya",
        summary="Before update",
    )

    get_response = api_request(
        "GET",
        f"/api/campaigns/{stored_campaign.id}/entities/{stored_entity.id}",
    )

    assert get_response.status_code == 200
    assert get_response.json()["summary"] == "Before update"


def test_update_entity_returns_updated_fields(
    api_request,
    campaign_factory,
    entity_factory,
) -> None:
    stored_campaign = campaign_factory()
    stored_entity = entity_factory(
        campaign_id=stored_campaign.id,
        type="person",
        name="Magistrate Ilya",
        summary="Before update",
    )

    response = api_request(
        "PATCH",
        f"/api/campaigns/{stored_campaign.id}/entities/{stored_entity.id}",
        json={
            "type": "organization",
            "name": "Ilya",
            "summary": "After update",
            "metadata": {"rank": "magistrate"},
        },
    )

    assert response.status_code == 200
    entity_data = response.json()
    assert entity_data["type"] == "organization"
    assert entity_data["name"] == "Ilya"
    assert entity_data["summary"] == "After update"
    assert entity_data["metadata"] == {"rank": "magistrate"}


def test_delete_entity_removes_entity(
    api_request,
    campaign_factory,
    entity_factory,
) -> None:
    stored_campaign = campaign_factory()
    stored_entity = entity_factory(
        campaign_id=stored_campaign.id,
        type="person",
        name="Magistrate Ilya",
    )

    delete_response = api_request(
        "DELETE",
        f"/api/campaigns/{stored_campaign.id}/entities/{stored_entity.id}",
    )
    assert delete_response.status_code == 204

    missing_response = api_request(
        "GET",
        f"/api/campaigns/{stored_campaign.id}/entities/{stored_entity.id}",
    )
    assert missing_response.status_code == 404


def test_delete_entity_cascades_its_relationships(
    api_request,
    campaign_factory,
    entity_factory,
    relationship_factory,
) -> None:
    stored_campaign = campaign_factory()
    source_entity = entity_factory(campaign_id=stored_campaign.id, name="Captain Ilya", type="person")
    target_entity = entity_factory(campaign_id=stored_campaign.id, name="Blackharbor", type="location")
    relationship_factory(
        campaign_id=stored_campaign.id,
        source_entity_id=source_entity.id,
        target_entity_id=target_entity.id,
    )

    delete_response = api_request(
        "DELETE",
        f"/api/campaigns/{stored_campaign.id}/entities/{source_entity.id}",
    )

    assert delete_response.status_code == 204


def test_get_entity_returns_not_found_for_campaign_mismatch(
    api_request,
    owner_factory,
    campaign_factory,
    entity_factory,
) -> None:
    owner = owner_factory()
    stored_campaign = campaign_factory(owner=owner)
    second_campaign = campaign_factory(owner=owner, name="Second Campaign")
    stored_entity = entity_factory(
        campaign_id=stored_campaign.id,
        type="person",
        name="Magistrate Ilya",
    )

    response = api_request(
        "GET",
        f"/api/campaigns/{second_campaign.id}/entities/{stored_entity.id}",
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Entity not found."}


def test_update_entity_returns_422_for_null_name(
    api_request,
    campaign_factory,
    entity_factory,
) -> None:
    stored_campaign = campaign_factory()
    stored_entity = entity_factory(
        campaign_id=stored_campaign.id,
        type="person",
        name="Magistrate Ilya",
    )

    response = api_request(
        "PATCH",
        f"/api/campaigns/{stored_campaign.id}/entities/{stored_entity.id}",
        json={
            "name": None,
            "summary": "Updated",
        },
    )

    assert response.status_code == 422
