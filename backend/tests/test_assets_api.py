from __future__ import annotations

from uuid import uuid4

import pytest

from app.api.dependencies import get_asset_storage
from app.config import get_settings
from app.models import ExtractionJob
from app.services import ConflictError, asset_service


class DeleteFailingAssetStorage:
    def delete(self, *, storage_key: str) -> None:
        raise OSError(f"failed to delete {storage_key}")


def test_create_asset_upload_returns_created_record(
    api_request,
    campaign_factory,
    session_factory,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    stored_session = session_factory(campaign=stored_campaign, session_number=7)

    # Act
    response = api_request(
        "POST",
        f"/api/campaigns/{stored_campaign.id}/assets",
        data={
            "title": "Session 7 Recap",
            "truth_status": "subjective",
            "session_id": str(stored_session.id),
        },
        files={
            "file": ("session-7.txt", b"The observatory is burning.", "text/plain"),
        },
    )

    # Assert
    assert response.status_code == 201
    asset_data = response.json()
    assert asset_data["campaign_id"] == str(stored_campaign.id)
    assert asset_data["session_id"] == str(stored_session.id)
    assert asset_data["title"] == "Session 7 Recap"
    assert asset_data["truth_status"] == "subjective"
    assert asset_data["media_type"] == "text/plain"
    assert asset_data["original_filename"] == "session-7.txt"
    assert asset_data["file_size_bytes"] == 27
    assert asset_data["lifecycle_status"] == "active"
    assert asset_data["storage_status"] == "available"
    assert asset_data["parse_status"] == "pending"
    assert asset_data["last_parsed_at"] is None


def test_create_asset_upload_returns_not_found_for_unknown_campaign(api_request) -> None:
    # Act
    response = api_request(
        "POST",
        f"/api/campaigns/{uuid4()}/assets",
        files={
            "file": ("session-7.txt", b"The observatory is burning.", "text/plain"),
        },
    )

    # Assert
    assert response.status_code == 404
    assert response.json() == {"detail": "Campaign not found."}


def test_create_asset_upload_rejects_cross_campaign_session_link(
    api_request,
    owner_factory,
    campaign_factory,
    session_factory,
) -> None:
    # Arrange
    owner = owner_factory()
    stored_campaign = campaign_factory(owner=owner)
    second_campaign = campaign_factory(owner=owner, name="Second Campaign")
    second_campaign_session = session_factory(campaign=second_campaign, session_number=9)

    # Act
    response = api_request(
        "POST",
        f"/api/campaigns/{stored_campaign.id}/assets",
        data={
            "session_id": str(second_campaign_session.id),
        },
        files={
            "file": ("session-7.txt", b"The observatory is burning.", "text/plain"),
        },
    )

    # Assert
    assert response.status_code == 404
    assert response.json() == {"detail": "Session not found."}


def test_create_asset_upload_rejects_unsupported_media_type(
    api_request,
    campaign_factory,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()

    # Act
    response = api_request(
        "POST",
        f"/api/campaigns/{stored_campaign.id}/assets",
        files={
            "file": ("battle.mp4", b"fake-video", "video/mp4"),
        },
    )

    # Assert
    assert response.status_code == 415
    assert response.json() == {"detail": "Unsupported asset media type."}


def test_create_asset_upload_returns_payload_too_large_when_upload_exceeds_limit(
    api_request,
    campaign_factory,
    test_app,
) -> None:
    # Arrange
    test_settings = test_app.state.settings.model_copy(update={"asset_upload_max_bytes": 5})
    test_app.dependency_overrides[get_settings] = lambda: test_settings
    stored_campaign = campaign_factory()

    # Act
    response = api_request(
        "POST",
        f"/api/campaigns/{stored_campaign.id}/assets",
        files={
            "file": ("session-7.txt", b"too-large", "text/plain"),
        },
    )

    # Assert
    assert response.status_code == 413
    assert response.json() == {"detail": "Uploaded asset exceeds the maximum allowed size."}


@pytest.mark.parametrize(
    ("asset_form_data", "expected_error_type", "expected_error_location"),
    [
        (
            {"truth_status": "legendary"},
            "value_error",
            ["body", "truth_status"],
        ),
        (
            {"title": "   "},
            "string_too_short",
            ["body", "title"],
        ),
    ],
)
def test_create_asset_upload_returns_422_for_invalid_form_fields(
    api_request,
    campaign_factory,
    asset_form_data,
    expected_error_type,
    expected_error_location,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()

    # Act
    response = api_request(
        "POST",
        f"/api/campaigns/{stored_campaign.id}/assets",
        data=asset_form_data,
        files={
            "file": ("session-7.txt", b"The observatory is burning.", "text/plain"),
        },
    )

    # Assert
    assert response.status_code == 422
    error_details = response.json()["detail"]
    assert len(error_details) == 1
    assert error_details[0]["type"] == expected_error_type
    assert error_details[0]["loc"] == expected_error_location


def test_list_assets_returns_campaign_assets_without_triggering_parse(
    api_request,
    owner_factory,
    campaign_factory,
    source_asset_factory,
) -> None:
    # Arrange
    owner = owner_factory()
    stored_campaign = campaign_factory(owner=owner)
    second_campaign = campaign_factory(owner=owner, name="Second Campaign")
    source_asset_factory(
        campaign=stored_campaign,
        title="First Asset",
        parse_status="pending",
        last_parsed_at=None,
    )
    source_asset_factory(
        campaign=second_campaign,
        title="Other Asset",
        parse_status="pending",
        last_parsed_at=None,
    )

    # Act
    response = api_request("GET", f"/api/campaigns/{stored_campaign.id}/assets")

    # Assert
    assert response.status_code == 200
    assert response.json() == [
        {
            "id": response.json()[0]["id"],
            "campaign_id": str(stored_campaign.id),
            "session_id": None,
            "title": "First Asset",
            "truth_status": "uncertain",
            "media_type": "text/plain",
            "original_filename": response.json()[0]["original_filename"],
            "file_size_bytes": 12,
            "lifecycle_status": "active",
            "storage_status": "available",
            "parse_status": "pending",
            "last_parsed_at": None,
            "metadata": {},
            "created_at": response.json()[0]["created_at"],
            "updated_at": response.json()[0]["updated_at"],
        }
    ]


def test_get_asset_returns_stored_record_without_triggering_parse(
    api_request,
    campaign_factory,
    source_asset_factory,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    stored_source_asset = source_asset_factory(
        campaign=stored_campaign,
        title="Harbor Recap",
        parse_status="pending",
        last_parsed_at=None,
    )

    # Act
    response = api_request(
        "GET",
        f"/api/campaigns/{stored_campaign.id}/assets/{stored_source_asset.id}",
    )

    # Assert
    assert response.status_code == 200
    asset_data = response.json()
    assert asset_data["title"] == "Harbor Recap"
    assert asset_data["lifecycle_status"] == "active"
    assert asset_data["storage_status"] == "available"
    assert asset_data["parse_status"] == "pending"
    assert asset_data["last_parsed_at"] is None


def test_update_asset_returns_updated_fields(
    api_request,
    campaign_factory,
    session_factory,
    source_asset_factory,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    stored_session = session_factory(campaign=stored_campaign, session_number=3)
    stored_source_asset = source_asset_factory(
        campaign=stored_campaign,
        title="Before Update",
        truth_status="uncertain",
    )

    # Act
    response = api_request(
        "PATCH",
        f"/api/campaigns/{stored_campaign.id}/assets/{stored_source_asset.id}",
        json={
            "title": "After Update",
            "truth_status": "canonical",
            "session_id": str(stored_session.id),
            "metadata": {"source": "gm"},
        },
    )

    # Assert
    assert response.status_code == 200
    asset_data = response.json()
    assert asset_data["title"] == "After Update"
    assert asset_data["truth_status"] == "canonical"
    assert asset_data["session_id"] == str(stored_session.id)
    assert asset_data["metadata"] == {"source": "gm"}
    assert asset_data["lifecycle_status"] == "active"
    assert asset_data["storage_status"] == "available"


def test_delete_asset_removes_asset(
    api_request,
    campaign_factory,
    source_asset_factory,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    stored_source_asset = source_asset_factory(campaign=stored_campaign)

    # Act
    delete_response = api_request(
        "DELETE",
        f"/api/campaigns/{stored_campaign.id}/assets/{stored_source_asset.id}",
    )

    # Assert
    assert delete_response.status_code == 204

    missing_response = api_request(
        "GET",
        f"/api/campaigns/{stored_campaign.id}/assets/{stored_source_asset.id}",
    )
    assert missing_response.status_code == 404


def test_delete_asset_returns_conflict_when_entity_provenance_still_references_it(
    api_request,
    campaign_factory,
    source_asset_factory,
    entity_factory,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    stored_source_asset = source_asset_factory(campaign=stored_campaign)
    entity_factory(
        campaign_id=stored_campaign.id,
        type="person",
        name="Magistrate Ilya",
        source_asset_id=stored_source_asset.id,
    )

    # Act
    response = api_request(
        "DELETE",
        f"/api/campaigns/{stored_campaign.id}/assets/{stored_source_asset.id}",
    )

    # Assert
    assert response.status_code == 409
    assert response.json() == {
        "detail": "Source asset cannot be deleted while dependent records still reference it."
    }


def test_delete_asset_returns_conflict_when_relationship_provenance_still_references_it(
    api_request,
    campaign_factory,
    source_asset_factory,
    entity_factory,
    relationship_factory,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    stored_source_asset = source_asset_factory(campaign=stored_campaign)
    source_entity = entity_factory(campaign_id=stored_campaign.id, type="person", name="Martha")
    target_entity = entity_factory(campaign_id=stored_campaign.id, type="person", name="Rick")
    relationship_factory(
        campaign_id=stored_campaign.id,
        source_entity=source_entity,
        target_entity=target_entity,
        source_asset_id=stored_source_asset.id,
    )

    # Act
    response = api_request(
        "DELETE",
        f"/api/campaigns/{stored_campaign.id}/assets/{stored_source_asset.id}",
    )

    # Assert
    assert response.status_code == 409
    assert response.json() == {
        "detail": "Source asset cannot be deleted while dependent records still reference it."
    }


def test_delete_asset_returns_conflict_when_extraction_job_still_references_it(
    api_request,
    db_session_factory,
    campaign_factory,
    source_asset_factory,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    stored_source_asset = source_asset_factory(campaign=stored_campaign)

    with db_session_factory() as db_session:
        db_session.add(
            ExtractionJob(
                campaign_id=stored_campaign.id,
                source_asset_id=stored_source_asset.id,
                status="pending",
                extractor_kind="rules",
            )
        )
        db_session.commit()

    # Act
    response = api_request(
        "DELETE",
        f"/api/campaigns/{stored_campaign.id}/assets/{stored_source_asset.id}",
    )

    # Assert
    assert response.status_code == 409
    assert response.json() == {
        "detail": "Source asset cannot be deleted while dependent records still reference it."
    }


def test_delete_asset_returns_conflict_when_storage_delete_fails(
    api_request,
    campaign_factory,
    source_asset_factory,
    test_app,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    stored_source_asset = source_asset_factory(campaign=stored_campaign)
    test_app.dependency_overrides[get_asset_storage] = lambda: DeleteFailingAssetStorage()

    # Act
    response = api_request(
        "DELETE",
        f"/api/campaigns/{stored_campaign.id}/assets/{stored_source_asset.id}",
    )

    # Assert
    assert response.status_code == 409
    assert response.json() == {"detail": "Source asset delete could not remove the backing file."}


def test_delete_asset_returns_conflict_when_asset_file_is_unavailable(
    api_request,
    campaign_factory,
    source_asset_factory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    stored_source_asset = source_asset_factory(campaign=stored_campaign)

    def unavailable_delete(*args, **kwargs) -> None:
        raise ConflictError("Asset file is unavailable.")

    monkeypatch.setattr(asset_service, "delete_asset", unavailable_delete)

    # Act
    response = api_request(
        "DELETE",
        f"/api/campaigns/{stored_campaign.id}/assets/{stored_source_asset.id}",
    )

    # Assert
    assert response.status_code == 409
    assert response.json() == {"detail": "Asset file is unavailable."}
