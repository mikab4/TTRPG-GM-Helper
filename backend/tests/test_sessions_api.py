from __future__ import annotations

from datetime import date
from uuid import uuid4


def test_create_session_returns_created_record(
    api_request,
    campaign_factory,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()

    # Act
    response = api_request(
        "POST",
        f"/api/campaigns/{stored_campaign.id}/sessions",
        json={
            "session_number": 7,
            "session_label": "The Observatory Burns",
            "played_on": "2026-04-17",
            "summary": "The party escaped with the star map.",
        },
    )

    # Assert
    assert response.status_code == 201
    session_data = response.json()
    assert session_data["campaign_id"] == str(stored_campaign.id)
    assert session_data["session_number"] == 7
    assert session_data["session_label"] == "The Observatory Burns"
    assert session_data["played_on"] == "2026-04-17"
    assert session_data["summary"] == "The party escaped with the star map."


def test_create_session_returns_not_found_for_unknown_campaign(api_request) -> None:
    # Act
    response = api_request(
        "POST",
        f"/api/campaigns/{uuid4()}/sessions",
        json={
            "session_number": 7,
        },
    )

    # Assert
    assert response.status_code == 404
    assert response.json() == {"detail": "Campaign not found."}


def test_create_session_returns_conflict_for_duplicate_session_number(
    api_request,
    campaign_factory,
    session_factory,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    session_factory(campaign=stored_campaign, session_number=7, session_label="Existing")

    # Act
    response = api_request(
        "POST",
        f"/api/campaigns/{stored_campaign.id}/sessions",
        json={
            "session_number": 7,
            "session_label": "Duplicate",
        },
    )

    # Assert
    assert response.status_code == 409
    assert response.json() == {"detail": "Session number already exists for this campaign."}


def test_list_sessions_returns_campaign_sessions_in_number_order(
    api_request,
    owner_factory,
    campaign_factory,
    session_factory,
) -> None:
    # Arrange
    owner = owner_factory()
    stored_campaign = campaign_factory(owner=owner)
    second_campaign = campaign_factory(owner=owner, name="Second Campaign")
    session_factory(campaign=stored_campaign, session_number=2, session_label="Second")
    session_factory(campaign=stored_campaign, session_number=1, session_label="First")
    session_factory(campaign=second_campaign, session_number=1, session_label="Other")

    # Act
    response = api_request("GET", f"/api/campaigns/{stored_campaign.id}/sessions")

    # Assert
    assert response.status_code == 200
    assert [listed_session["session_label"] for listed_session in response.json()] == [
        "First",
        "Second",
    ]


def test_get_session_returns_stored_record(
    api_request,
    campaign_factory,
    session_factory,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    stored_session = session_factory(
        campaign=stored_campaign,
        session_number=4,
        session_label="Ashes in the Harbor",
        played_on=date(2026, 4, 18),
    )

    # Act
    response = api_request(
        "GET",
        f"/api/campaigns/{stored_campaign.id}/sessions/{stored_session.id}",
    )

    # Assert
    assert response.status_code == 200
    assert response.json()["session_label"] == "Ashes in the Harbor"


def test_update_session_returns_updated_fields(
    api_request,
    campaign_factory,
    session_factory,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    stored_session = session_factory(
        campaign=stored_campaign,
        session_number=4,
        session_label="Before Update",
        summary="Before",
    )

    # Act
    response = api_request(
        "PATCH",
        f"/api/campaigns/{stored_campaign.id}/sessions/{stored_session.id}",
        json={
            "session_label": "After Update",
            "summary": "After",
        },
    )

    # Assert
    assert response.status_code == 200
    session_data = response.json()
    assert session_data["session_label"] == "After Update"
    assert session_data["summary"] == "After"


def test_update_session_allows_replacing_both_identity_fields(
    api_request,
    campaign_factory,
    session_factory,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    stored_session = session_factory(
        campaign=stored_campaign,
        session_number=4,
        session_label="Before Update",
    )

    # Act
    response = api_request(
        "PATCH",
        f"/api/campaigns/{stored_campaign.id}/sessions/{stored_session.id}",
        json={
            "session_number": 8,
            "session_label": "After Update",
        },
    )

    # Assert
    assert response.status_code == 200
    session_data = response.json()
    assert session_data["session_number"] == 8
    assert session_data["session_label"] == "After Update"


def test_update_session_returns_conflict_for_duplicate_session_number(
    api_request,
    campaign_factory,
    session_factory,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    first_session = session_factory(campaign=stored_campaign, session_number=4, session_label="First")
    second_session = session_factory(campaign=stored_campaign, session_number=8, session_label="Second")

    # Act
    response = api_request(
        "PATCH",
        f"/api/campaigns/{stored_campaign.id}/sessions/{second_session.id}",
        json={
            "session_number": first_session.session_number,
        },
    )

    # Assert
    assert response.status_code == 409
    assert response.json() == {"detail": "Session number already exists for this campaign."}


def test_update_session_rejects_clearing_the_last_identity_field(
    api_request,
    campaign_factory,
    session_factory,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    stored_session = session_factory(
        campaign=stored_campaign,
        session_number=4,
        session_label=None,
    )

    # Act
    response = api_request(
        "PATCH",
        f"/api/campaigns/{stored_campaign.id}/sessions/{stored_session.id}",
        json={
            "session_number": None,
        },
    )

    # Assert
    assert response.status_code == 422
    assert response.json() == {"detail": "Session number or session label must remain set."}


def test_delete_session_removes_session(
    api_request,
    campaign_factory,
    session_factory,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    stored_session = session_factory(campaign=stored_campaign, session_number=4)

    # Act
    delete_response = api_request(
        "DELETE",
        f"/api/campaigns/{stored_campaign.id}/sessions/{stored_session.id}",
    )

    # Assert
    assert delete_response.status_code == 204

    missing_response = api_request(
        "GET",
        f"/api/campaigns/{stored_campaign.id}/sessions/{stored_session.id}",
    )
    assert missing_response.status_code == 404


def test_delete_session_returns_conflict_when_source_assets_still_reference_it(
    api_request,
    campaign_factory,
    session_factory,
    source_asset_factory,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    stored_session = session_factory(campaign=stored_campaign, session_number=4)
    source_asset_factory(campaign=stored_campaign, session_id=stored_session.id)

    # Act
    response = api_request(
        "DELETE",
        f"/api/campaigns/{stored_campaign.id}/sessions/{stored_session.id}",
    )

    # Assert
    assert response.status_code == 409
    assert response.json() == {"detail": "Session cannot be deleted while source assets still reference it."}


def test_get_session_returns_not_found_for_campaign_mismatch(
    api_request,
    owner_factory,
    campaign_factory,
    session_factory,
) -> None:
    # Arrange
    owner = owner_factory()
    stored_campaign = campaign_factory(owner=owner)
    second_campaign = campaign_factory(owner=owner, name="Second Campaign")
    stored_session = session_factory(campaign=stored_campaign, session_number=4)

    # Act
    response = api_request(
        "GET",
        f"/api/campaigns/{second_campaign.id}/sessions/{stored_session.id}",
    )

    # Assert
    assert response.status_code == 404
    assert response.json() == {"detail": "Session not found."}
