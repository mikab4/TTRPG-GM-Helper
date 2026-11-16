from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError

from app.schemas import CampaignCreate, CampaignUpdate
from app.services import ConflictError, campaign_service


def _install_failing_commit(db_session, monkeypatch: pytest.MonkeyPatch) -> list[int]:
    rollback_calls: list[int] = []

    def failing_commit() -> None:
        raise IntegrityError(
            "INSERT INTO campaigns",
            params=None,
            orig=Exception('duplicate key value violates unique constraint "uq_campaign_owner_name"'),
        )

    def recording_rollback() -> None:
        rollback_calls.append(1)

    monkeypatch.setattr(db_session, "commit", failing_commit)
    monkeypatch.setattr(db_session, "rollback", recording_rollback)
    return rollback_calls


def test_create_campaign_translates_concurrent_duplicate_name_to_conflict_error(
    db_session_factory,
    owner_factory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    owner = owner_factory(email="gm@example.com", display_name="Local GM")

    with db_session_factory() as db_session:
        rollback_calls = _install_failing_commit(db_session, monkeypatch)

        # Act / Assert
        with pytest.raises(ConflictError, match="Campaign name already exists for this owner."):
            campaign_service.create_campaign(
                db_session,
                CampaignCreate(owner_id=owner.id, name="Iron Vale"),
            )

    assert len(rollback_calls) == 1


def test_update_campaign_translates_concurrent_duplicate_name_to_conflict_error(
    db_session_factory,
    owner_factory,
    campaign_factory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    owner = owner_factory(email="gm@example.com", display_name="Local GM")
    stored_campaign = campaign_factory(owner=owner, name="Iron Vale")

    with db_session_factory() as db_session:
        rollback_calls = _install_failing_commit(db_session, monkeypatch)

        # Act / Assert
        with pytest.raises(ConflictError, match="Campaign name already exists for this owner."):
            campaign_service.update_campaign(
                db_session,
                stored_campaign.id,
                CampaignUpdate(name="Starfall"),
            )

    assert len(rollback_calls) == 1
