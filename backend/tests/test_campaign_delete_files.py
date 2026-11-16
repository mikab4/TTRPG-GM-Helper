from __future__ import annotations

from datetime import timedelta
from io import BytesIO
from pathlib import Path
from uuid import UUID

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.api.dependencies import get_asset_storage
from app.models import Campaign, Entity, Relationship, SourceAsset
from app.schemas import AssetCreateFormData
from app.services import ConflictError, asset_service, campaign_service
from app.services.asset_storage import LocalAssetStorage
from tests.asset_storage_doubles import (
    RecordingAssetStorage,
    build_delete_failing_asset_storage,
    build_recording_asset_storage,
    build_selective_delete_failing_asset_storage,
    build_upload_file,
)

CAMPAIGN_FILE_DELETE_FAILURE_MESSAGE = (
    "Campaign delete could not remove every asset file. Delete the campaign again to finish."
)
ASSET_FILE_DELETE_FAILURE_MESSAGE = "Source asset delete could not remove the backing file."


def _upload_asset(
    db_session: DBSession,
    *,
    campaign_id: UUID,
    filename: str,
    asset_storage: RecordingAssetStorage,
) -> SourceAsset:
    return asset_service.create_asset(
        db_session,
        campaign_id=campaign_id,
        asset_create=AssetCreateFormData(),
        upload_file=build_upload_file(file_obj=BytesIO(filename.encode()), filename=filename),
        asset_storage=asset_storage,
    )


def _count_campaign_assets(db_session: DBSession, campaign_id: UUID) -> int:
    return db_session.scalar(select(func.count()).select_from(SourceAsset).where(SourceAsset.campaign_id == campaign_id))


def _stored_files(asset_storage_root: Path) -> list[Path]:
    return [stored_path for stored_path in asset_storage_root.rglob("*") if stored_path.is_file()]


def test_delete_campaign_removes_asset_files_and_rows(
    db_session_factory,
    campaign_factory,
    tmp_path: Path,
) -> None:
    # Arrange
    asset_storage_root = tmp_path / "asset-storage"
    asset_storage = build_recording_asset_storage(storage_root=asset_storage_root)
    stored_campaign = campaign_factory(name="Iron Vale")

    with db_session_factory() as db_session:
        first_asset = _upload_asset(
            db_session, campaign_id=stored_campaign.id, filename="map.txt", asset_storage=asset_storage
        )
        second_asset = _upload_asset(
            db_session, campaign_id=stored_campaign.id, filename="notes.txt", asset_storage=asset_storage
        )
        stored_paths = [asset_storage_root / first_asset.storage_key, asset_storage_root / second_asset.storage_key]
        assert all(stored_path.is_file() for stored_path in stored_paths)

        # Act
        campaign_service.delete_campaign(db_session, stored_campaign.id, asset_storage=asset_storage)

    # Assert
    assert sorted(asset_storage.deleted_keys) == sorted([first_asset.storage_key, second_asset.storage_key])
    assert not any(stored_path.exists() for stored_path in stored_paths)
    with db_session_factory() as assert_session:
        assert assert_session.get(Campaign, stored_campaign.id) is None
        assert _count_campaign_assets(assert_session, stored_campaign.id) == 0


def test_delete_campaign_treats_missing_files_as_removed(
    db_session_factory,
    campaign_factory,
    source_asset_factory,
    tmp_path: Path,
) -> None:
    # Arrange
    asset_storage_root = tmp_path / "asset-storage"
    asset_storage = build_recording_asset_storage(storage_root=asset_storage_root)
    stored_campaign = campaign_factory(name="Iron Vale")
    legacy_asset = source_asset_factory(
        campaign=stored_campaign,
        storage_key="legacy-assets/old-notes.txt",
        storage_status="missing",
    )

    with db_session_factory() as db_session:
        vanished_asset = _upload_asset(
            db_session, campaign_id=stored_campaign.id, filename="vanished.txt", asset_storage=asset_storage
        )
        (asset_storage_root / vanished_asset.storage_key).unlink()

        # Act
        campaign_service.delete_campaign(db_session, stored_campaign.id, asset_storage=asset_storage)

    # Assert
    assert asset_storage.deleted_keys == [vanished_asset.storage_key]
    assert legacy_asset.storage_key not in asset_storage.deleted_keys
    with db_session_factory() as assert_session:
        assert assert_session.get(Campaign, stored_campaign.id) is None
        assert _count_campaign_assets(assert_session, stored_campaign.id) == 0


def test_delete_campaign_keeps_campaign_and_records_failure_when_file_removal_fails(
    db_session_factory,
    campaign_factory,
    tmp_path: Path,
) -> None:
    # Arrange
    asset_storage_root = tmp_path / "asset-storage"
    upload_storage = build_recording_asset_storage(storage_root=asset_storage_root)
    failing_storage = build_delete_failing_asset_storage(storage_root=asset_storage_root)
    stored_campaign = campaign_factory(name="Iron Vale")

    with db_session_factory() as db_session:
        stored_asset = _upload_asset(
            db_session, campaign_id=stored_campaign.id, filename="map.txt", asset_storage=upload_storage
        )
        stored_asset_path = asset_storage_root / stored_asset.storage_key

        # Act / Assert
        with pytest.raises(ConflictError, match=CAMPAIGN_FILE_DELETE_FAILURE_MESSAGE):
            campaign_service.delete_campaign(db_session, stored_campaign.id, asset_storage=failing_storage)

    # Assert
    assert failing_storage.deleted_keys == [stored_asset.storage_key]
    assert stored_asset_path.is_file()
    with db_session_factory() as assert_session:
        assert assert_session.get(Campaign, stored_campaign.id) is not None
        reloaded_asset = assert_session.get(SourceAsset, stored_asset.id)
        assert reloaded_asset.lifecycle_status == "deleting"
        assert reloaded_asset.storage_status == "available"
        assert reloaded_asset.delete_started_at is not None
        assert reloaded_asset.delete_last_error_at is not None
        assert reloaded_asset.delete_last_error_message == ASSET_FILE_DELETE_FAILURE_MESSAGE


def test_delete_campaign_marks_removed_files_missing_when_another_file_removal_fails(
    db_session_factory,
    campaign_factory,
    tmp_path: Path,
) -> None:
    # Arrange
    asset_storage_root = tmp_path / "asset-storage"
    upload_storage = build_recording_asset_storage(storage_root=asset_storage_root)
    stored_campaign = campaign_factory(name="Iron Vale")

    with db_session_factory() as db_session:
        removable_asset = _upload_asset(
            db_session, campaign_id=stored_campaign.id, filename="map.txt", asset_storage=upload_storage
        )
        stuck_asset = _upload_asset(
            db_session, campaign_id=stored_campaign.id, filename="stuck.txt", asset_storage=upload_storage
        )
        partly_failing_storage = build_selective_delete_failing_asset_storage(
            storage_root=asset_storage_root,
            failing_keys={stuck_asset.storage_key},
        )

        # Act / Assert
        with pytest.raises(ConflictError, match=CAMPAIGN_FILE_DELETE_FAILURE_MESSAGE):
            campaign_service.delete_campaign(db_session, stored_campaign.id, asset_storage=partly_failing_storage)

    # Assert
    assert sorted(partly_failing_storage.deleted_keys) == sorted([removable_asset.storage_key, stuck_asset.storage_key])
    assert not (asset_storage_root / removable_asset.storage_key).exists()
    assert (asset_storage_root / stuck_asset.storage_key).is_file()
    with db_session_factory() as assert_session:
        reloaded_removable_asset = assert_session.get(SourceAsset, removable_asset.id)
        assert reloaded_removable_asset.lifecycle_status == "deleting"
        assert reloaded_removable_asset.storage_status == "missing"
        assert reloaded_removable_asset.delete_last_error_message is None
        reloaded_stuck_asset = assert_session.get(SourceAsset, stuck_asset.id)
        assert reloaded_stuck_asset.lifecycle_status == "deleting"
        assert reloaded_stuck_asset.storage_status == "available"
        assert reloaded_stuck_asset.delete_last_error_message == ASSET_FILE_DELETE_FAILURE_MESSAGE


def test_delete_campaign_completes_when_repeated_after_storage_recovers(
    db_session_factory,
    campaign_factory,
    tmp_path: Path,
) -> None:
    # Arrange
    asset_storage_root = tmp_path / "asset-storage"
    upload_storage = build_recording_asset_storage(storage_root=asset_storage_root)
    stored_campaign = campaign_factory(name="Iron Vale")

    with db_session_factory() as db_session:
        removable_asset = _upload_asset(
            db_session, campaign_id=stored_campaign.id, filename="map.txt", asset_storage=upload_storage
        )
        stuck_asset = _upload_asset(
            db_session, campaign_id=stored_campaign.id, filename="stuck.txt", asset_storage=upload_storage
        )
        partly_failing_storage = build_selective_delete_failing_asset_storage(
            storage_root=asset_storage_root,
            failing_keys={stuck_asset.storage_key},
        )
        with pytest.raises(ConflictError):
            campaign_service.delete_campaign(db_session, stored_campaign.id, asset_storage=partly_failing_storage)
    recovered_storage = build_recording_asset_storage(storage_root=asset_storage_root)

    # Act
    with db_session_factory() as retry_session:
        campaign_service.delete_campaign(retry_session, stored_campaign.id, asset_storage=recovered_storage)

    # Assert
    assert recovered_storage.deleted_keys == [stuck_asset.storage_key]
    assert not (asset_storage_root / removable_asset.storage_key).exists()
    assert not (asset_storage_root / stuck_asset.storage_key).exists()
    with db_session_factory() as assert_session:
        assert assert_session.get(Campaign, stored_campaign.id) is None
        assert _count_campaign_assets(assert_session, stored_campaign.id) == 0


def test_delete_campaign_completes_when_repeated_after_retry_job_handled_failed_assets(
    db_session_factory,
    campaign_factory,
    entity_factory,
    tmp_path: Path,
) -> None:
    # Arrange
    asset_storage_root = tmp_path / "asset-storage"
    upload_storage = build_recording_asset_storage(storage_root=asset_storage_root)
    failing_storage = build_delete_failing_asset_storage(storage_root=asset_storage_root)
    stored_campaign = campaign_factory(name="Iron Vale")

    with db_session_factory() as db_session:
        uncited_asset = _upload_asset(
            db_session, campaign_id=stored_campaign.id, filename="uncited.txt", asset_storage=upload_storage
        )
        cited_asset = _upload_asset(
            db_session, campaign_id=stored_campaign.id, filename="cited.txt", asset_storage=upload_storage
        )
    entity_factory(
        campaign_id=stored_campaign.id,
        name="Mara",
        source_asset_id=cited_asset.id,
        provenance_excerpt="Mara runs the harbor watch.",
    )
    with db_session_factory() as failing_session:
        with pytest.raises(ConflictError):
            campaign_service.delete_campaign(failing_session, stored_campaign.id, asset_storage=failing_storage)
    with db_session_factory() as aging_session:
        for deleting_asset in aging_session.scalars(
            select(SourceAsset).where(SourceAsset.campaign_id == stored_campaign.id)
        ):
            deleting_asset.delete_started_at = (
                asset_service.utcnow() - asset_service.ASSET_DELETE_RETRY_GRACE_PERIOD - timedelta(seconds=1)
            )
        aging_session.commit()
    retry_storage = build_recording_asset_storage(storage_root=asset_storage_root)
    with db_session_factory() as retry_job_session:
        assert asset_service.retry_deleting_assets(retry_job_session, asset_storage=retry_storage) == 1
    with db_session_factory() as check_session:
        assert check_session.get(SourceAsset, uncited_asset.id) is None
        left_cited_asset = check_session.get(SourceAsset, cited_asset.id)
        assert left_cited_asset.lifecycle_status == "deleting"
        assert left_cited_asset.storage_status == "missing"
    repeat_storage = build_recording_asset_storage(storage_root=asset_storage_root)

    # Act
    with db_session_factory() as repeat_session:
        campaign_service.delete_campaign(repeat_session, stored_campaign.id, asset_storage=repeat_storage)

    # Assert
    assert repeat_storage.deleted_keys == []
    assert not (asset_storage_root / uncited_asset.storage_key).exists()
    assert not (asset_storage_root / cited_asset.storage_key).exists()
    with db_session_factory() as assert_session:
        assert assert_session.get(Campaign, stored_campaign.id) is None
        assert _count_campaign_assets(assert_session, stored_campaign.id) == 0
        assert (
            assert_session.scalar(select(func.count()).select_from(Entity).where(Entity.campaign_id == stored_campaign.id))
            == 0
        )


def test_delete_campaign_leaves_other_campaign_assets_and_files_untouched(
    db_session_factory,
    owner_factory,
    campaign_factory,
    tmp_path: Path,
) -> None:
    # Arrange
    asset_storage_root = tmp_path / "asset-storage"
    asset_storage = build_recording_asset_storage(storage_root=asset_storage_root)
    owner = owner_factory()
    deleted_campaign = campaign_factory(owner=owner, name="Iron Vale")
    kept_campaign = campaign_factory(owner=owner, name="Starfall")

    with db_session_factory() as db_session:
        deleted_asset = _upload_asset(
            db_session, campaign_id=deleted_campaign.id, filename="map.txt", asset_storage=asset_storage
        )
        kept_asset = _upload_asset(db_session, campaign_id=kept_campaign.id, filename="map.txt", asset_storage=asset_storage)

        # Act
        campaign_service.delete_campaign(db_session, deleted_campaign.id, asset_storage=asset_storage)

    # Assert
    assert asset_storage.deleted_keys == [deleted_asset.storage_key]
    assert (asset_storage_root / kept_asset.storage_key).is_file()
    with db_session_factory() as assert_session:
        assert assert_session.get(Campaign, kept_campaign.id) is not None
        reloaded_kept_asset = assert_session.get(SourceAsset, kept_asset.id)
        assert reloaded_kept_asset.lifecycle_status == "active"
        assert reloaded_kept_asset.storage_status == "available"
        assert reloaded_kept_asset.delete_started_at is None


def test_delete_campaign_removes_assets_cited_by_entity_and_relationship(
    db_session_factory,
    campaign_factory,
    entity_factory,
    relationship_factory,
    tmp_path: Path,
) -> None:
    # Arrange
    asset_storage_root = tmp_path / "asset-storage"
    asset_storage = build_recording_asset_storage(storage_root=asset_storage_root)
    stored_campaign = campaign_factory(name="Iron Vale")

    with db_session_factory() as db_session:
        entity_source_asset = _upload_asset(
            db_session, campaign_id=stored_campaign.id, filename="watch.txt", asset_storage=asset_storage
        )
        relationship_source_asset = _upload_asset(
            db_session, campaign_id=stored_campaign.id, filename="siege.txt", asset_storage=asset_storage
        )
    source_entity = entity_factory(
        campaign_id=stored_campaign.id,
        name="Mara",
        source_asset_id=entity_source_asset.id,
        provenance_excerpt="Mara runs the harbor watch.",
    )
    target_entity = entity_factory(campaign_id=stored_campaign.id, name="Tobin")
    relationship_factory(
        campaign_id=stored_campaign.id,
        source_entity=source_entity,
        target_entity=target_entity,
        source_asset_id=relationship_source_asset.id,
        provenance_excerpt="Mara has known Tobin since the siege.",
    )

    # Act
    with db_session_factory() as delete_session:
        campaign_service.delete_campaign(delete_session, stored_campaign.id, asset_storage=asset_storage)

    # Assert
    assert not (asset_storage_root / entity_source_asset.storage_key).exists()
    assert not (asset_storage_root / relationship_source_asset.storage_key).exists()
    with db_session_factory() as assert_session:
        assert assert_session.get(Campaign, stored_campaign.id) is None
        assert _count_campaign_assets(assert_session, stored_campaign.id) == 0
        assert (
            assert_session.scalar(select(func.count()).select_from(Entity).where(Entity.campaign_id == stored_campaign.id))
            == 0
        )
        assert (
            assert_session.scalar(
                select(func.count()).select_from(Relationship).where(Relationship.campaign_id == stored_campaign.id)
            )
            == 0
        )


def test_delete_campaign_keeps_campaign_when_asset_is_added_during_file_removal(
    db_session_factory,
    campaign_factory,
    source_asset_factory,
    tmp_path: Path,
) -> None:
    # Arrange
    asset_storage_root = tmp_path / "asset-storage"
    upload_storage = build_recording_asset_storage(storage_root=asset_storage_root)
    stored_campaign = campaign_factory(name="Iron Vale")
    added_asset_ids: list[UUID] = []

    class UploadDuringDeleteAssetStorage(RecordingAssetStorage):
        def delete(self, *, storage_key: str) -> None:
            super().delete(storage_key=storage_key)
            if not added_asset_ids:
                added_asset_ids.append(source_asset_factory(campaign=stored_campaign).id)

    racing_storage = UploadDuringDeleteAssetStorage(delegate_storage=LocalAssetStorage(storage_root=asset_storage_root))

    with db_session_factory() as db_session:
        _upload_asset(db_session, campaign_id=stored_campaign.id, filename="map.txt", asset_storage=upload_storage)

        # Act / Assert
        with pytest.raises(
            ConflictError,
            match="Assets were added while the campaign was being deleted. Delete the campaign again to finish.",
        ):
            campaign_service.delete_campaign(db_session, stored_campaign.id, asset_storage=racing_storage)

    # Assert
    with db_session_factory() as assert_session:
        assert assert_session.get(Campaign, stored_campaign.id) is not None
        assert assert_session.get(SourceAsset, added_asset_ids[0]).lifecycle_status == "active"


def test_delete_campaign_api_removes_uploaded_files(
    api_request,
    campaign_factory,
    test_app,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    create_response = api_request(
        "POST",
        f"/api/campaigns/{stored_campaign.id}/assets",
        files={"file": ("session-7.txt", b"The observatory is burning.", "text/plain")},
    )
    assert create_response.status_code == 201
    [stored_asset_path] = _stored_files(test_app.state.settings.asset_storage_root)
    assert stored_asset_path.is_file()

    # Act
    delete_response = api_request("DELETE", f"/api/campaigns/{stored_campaign.id}")

    # Assert
    assert delete_response.status_code == 204
    assert not stored_asset_path.exists()
    assert api_request("GET", f"/api/campaigns/{stored_campaign.id}").status_code == 404


def test_delete_campaign_api_returns_conflict_when_file_removal_fails(
    api_request,
    campaign_factory,
    test_app,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    create_response = api_request(
        "POST",
        f"/api/campaigns/{stored_campaign.id}/assets",
        files={"file": ("session-7.txt", b"The observatory is burning.", "text/plain")},
    )
    assert create_response.status_code == 201
    [stored_asset_path] = _stored_files(test_app.state.settings.asset_storage_root)
    test_app.dependency_overrides[get_asset_storage] = lambda: build_delete_failing_asset_storage(
        storage_root=test_app.state.settings.asset_storage_root
    )

    # Act
    delete_response = api_request("DELETE", f"/api/campaigns/{stored_campaign.id}")

    # Assert
    assert delete_response.status_code == 409
    assert delete_response.json() == {"detail": CAMPAIGN_FILE_DELETE_FAILURE_MESSAGE}
    assert stored_asset_path.is_file()
    assert api_request("GET", f"/api/campaigns/{stored_campaign.id}").status_code == 200
