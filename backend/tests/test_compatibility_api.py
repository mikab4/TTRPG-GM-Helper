from __future__ import annotations


def test_entity_type_compatibility_report_groups_legacy_types(
    api_request,
    entity_factory,
    campaign_factory,
) -> None:
    stored_campaign = campaign_factory(name="Shadows of Glass")
    entity_factory(campaign_id=stored_campaign.id, type="npc", name="Rowan")
    entity_factory(campaign_id=stored_campaign.id, type="npc", name="Mira")
    entity_factory(campaign_id=stored_campaign.id, type="faction", name="Night Choir")
    entity_factory(campaign_id=stored_campaign.id, type="location", name="Blackharbor")

    response = api_request("GET", "/api/compatibility/entity-types")

    assert response.status_code == 200
    compatibility_report = response.json()
    issues_by_type = {issue["legacy_type"]: issue for issue in compatibility_report["issues"]}

    assert compatibility_report["has_issues"] is True
    assert compatibility_report["issue_count"] == 2
    assert set(issues_by_type) == {"faction", "npc"}
    assert issues_by_type["faction"]["count"] == 1
    assert issues_by_type["faction"]["raw_variants"] == ["faction"]
    assert {
        (
            entity["entity_name"],
            entity["campaign_name"],
        )
        for entity in issues_by_type["faction"]["example_entities"]
    } == {("Night Choir", "Shadows of Glass")}
    assert issues_by_type["npc"]["count"] == 2
    assert issues_by_type["npc"]["raw_variants"] == ["npc"]
    assert {entity["entity_name"] for entity in issues_by_type["npc"]["example_entities"]} == {"Mira", "Rowan"}


def test_entity_type_compatibility_report_merges_case_and_whitespace_variants(
    api_request,
    entity_factory,
    campaign_factory,
) -> None:
    stored_campaign = campaign_factory()
    entity_factory(campaign_id=stored_campaign.id, type="NPC", name="Rowan")
    entity_factory(campaign_id=stored_campaign.id, type=" npc ", name="Mira")
    entity_factory(campaign_id=stored_campaign.id, type="person", name="Ilya")

    response = api_request("GET", "/api/compatibility/entity-types")

    assert response.status_code == 200
    compatibility_report = response.json()
    issue = compatibility_report["issues"][0]

    assert compatibility_report["has_issues"] is True
    assert compatibility_report["issue_count"] == 1
    assert len(compatibility_report["issues"]) == 1
    assert issue["legacy_type"] == "npc"
    assert issue["raw_variants"] == [" npc ", "NPC"]
    assert issue["count"] == 2
    assert {entity["entity_name"] for entity in issue["example_entities"]} == {"Mira", "Rowan"}


def test_entity_type_compatibility_report_returns_clean_state_when_no_issues(
    api_request,
    entity_factory,
    campaign_factory,
) -> None:
    stored_campaign = campaign_factory()
    entity_factory(campaign_id=stored_campaign.id, type="person", name="Rowan")

    response = api_request("GET", "/api/compatibility/entity-types")

    assert response.status_code == 200
    assert response.json() == {"has_issues": False, "issue_count": 0, "issues": []}


def test_entity_type_compatibility_migration_applies_explicit_mapping(
    api_request,
    entity_factory,
    campaign_factory,
) -> None:
    stored_campaign = campaign_factory()
    entity_factory(campaign_id=stored_campaign.id, type="npc", name="Rowan")
    entity_factory(campaign_id=stored_campaign.id, type="faction", name="Night Choir")

    response = api_request(
        "POST",
        "/api/compatibility/entity-types/migrate",
        json={
            "mappings": [
                {"legacy_type": "npc", "target_type": "person"},
                {"legacy_type": "faction", "target_type": "organization"},
            ]
        },
    )

    assert response.status_code == 200
    migration_result = response.json()
    updated_types_by_legacy_type = {
        updated_type["legacy_type"]: updated_type for updated_type in migration_result["updated_types"]
    }

    assert migration_result["updated_count"] == 2
    assert updated_types_by_legacy_type == {
        "faction": {
            "legacy_type": "faction",
            "target_type": "organization",
            "updated_count": 1,
        },
        "npc": {
            "legacy_type": "npc",
            "target_type": "person",
            "updated_count": 1,
        },
    }

    list_response = api_request("GET", "/api/entities")
    assert list_response.status_code == 200
    assert {entity["type"] for entity in list_response.json()} == {"organization", "person"}


def test_entity_type_compatibility_migration_rejects_missing_legacy_mapping(
    api_request,
    entity_factory,
    campaign_factory,
) -> None:
    stored_campaign = campaign_factory()
    entity_factory(campaign_id=stored_campaign.id, type="npc", name="Rowan")
    entity_factory(campaign_id=stored_campaign.id, type="faction", name="Night Choir")

    response = api_request(
        "POST",
        "/api/compatibility/entity-types/migrate",
        json={"mappings": [{"legacy_type": "npc", "target_type": "person"}]},
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Missing mappings for legacy entity types: faction."}


def test_entity_type_compatibility_migration_applies_mapping_to_all_normalized_variants(
    api_request,
    entity_factory,
    campaign_factory,
) -> None:
    stored_campaign = campaign_factory()
    entity_factory(campaign_id=stored_campaign.id, type="NPC", name="Rowan")
    entity_factory(campaign_id=stored_campaign.id, type=" npc ", name="Mira")

    response = api_request(
        "POST",
        "/api/compatibility/entity-types/migrate",
        json={"mappings": [{"legacy_type": "npc", "target_type": "person"}]},
    )

    assert response.status_code == 200
    assert response.json() == {
        "updated_count": 2,
        "updated_types": [
            {"legacy_type": "npc", "target_type": "person", "updated_count": 2},
        ],
    }

    list_response = api_request("GET", "/api/entities")
    assert list_response.status_code == 200
    assert all(entity["type"] == "person" for entity in list_response.json())
