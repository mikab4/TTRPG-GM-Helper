from __future__ import annotations

from collections.abc import Iterator

import pytest
from sqlalchemy import Engine, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from app.models import Campaign, Owner
from app.schemas import CampaignCreate, CampaignUpdate
from app.services import ConflictError, campaign_service


@pytest.fixture
def postgres_session(postgres_engine: Engine) -> Iterator[DBSession]:
    with DBSession(postgres_engine) as session:
        yield session


def _persist_owner(postgres_session: DBSession) -> Owner:
    owner = Owner(email="gm@example.com", display_name="Local GM")
    postgres_session.add(owner)
    postgres_session.commit()
    return owner


def _insert_competing_campaign_after_first_campaign_lookup(
    postgres_session: DBSession,
    monkeypatch: pytest.MonkeyPatch,
    *,
    owner_id,
    competing_campaign_name: str,
) -> list[int]:
    original_scalar = postgres_session.scalar
    competing_inserts: list[int] = []

    def scalar_then_competing_insert(statement, *args, **kwargs):
        result = original_scalar(statement, *args, **kwargs)
        if not competing_inserts and statement.column_descriptions[0]["entity"] is Campaign:
            competing_inserts.append(1)
            with DBSession(postgres_session.get_bind()) as competing_session:
                competing_session.add(Campaign(owner_id=owner_id, name=competing_campaign_name))
                competing_session.commit()
        return result

    monkeypatch.setattr(postgres_session, "scalar", scalar_then_competing_insert)
    return competing_inserts


def test_create_campaign_maps_real_postgres_duplicate_name_race_to_conflict_error(
    postgres_session: DBSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    owner_id = _persist_owner(postgres_session).id
    competing_inserts = _insert_competing_campaign_after_first_campaign_lookup(
        postgres_session,
        monkeypatch,
        owner_id=owner_id,
        competing_campaign_name="Iron Vale",
    )

    # Act / Assert
    with pytest.raises(ConflictError, match="^Campaign name already exists for this owner.$"):
        campaign_service.create_campaign(
            postgres_session,
            CampaignCreate(owner_id=owner_id, name="Iron Vale"),
        )

    assert len(competing_inserts) == 1


def test_update_campaign_maps_real_postgres_duplicate_name_race_to_conflict_error(
    postgres_session: DBSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    owner = _persist_owner(postgres_session)
    stored_campaign = Campaign(owner=owner, name="Iron Vale")
    postgres_session.add(stored_campaign)
    postgres_session.commit()
    owner_id, stored_campaign_id = owner.id, stored_campaign.id
    competing_inserts = _insert_competing_campaign_after_first_campaign_lookup(
        postgres_session,
        monkeypatch,
        owner_id=owner_id,
        competing_campaign_name="Starfall",
    )

    # Act / Assert
    with pytest.raises(ConflictError, match="^Campaign name already exists for this owner.$"):
        campaign_service.update_campaign(
            postgres_session,
            stored_campaign_id,
            CampaignUpdate(name="Starfall"),
        )

    assert len(competing_inserts) == 1


def test_create_campaign_reraises_real_postgres_owner_foreign_key_violation_and_rolls_back(
    postgres_session: DBSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    owner_id = _persist_owner(postgres_session).id
    original_get = postgres_session.get

    def get_then_competing_owner_delete(entity, primary_key, *args, **kwargs):
        result = original_get(entity, primary_key, *args, **kwargs)
        if entity is Owner:
            with DBSession(postgres_session.get_bind()) as competing_session:
                competing_session.delete(competing_session.get(Owner, primary_key))
                competing_session.commit()
        return result

    monkeypatch.setattr(postgres_session, "get", get_then_competing_owner_delete)

    # Act
    with pytest.raises(IntegrityError, match="campaigns_owner_id_fkey"):
        campaign_service.create_campaign(
            postgres_session,
            CampaignCreate(owner_id=owner_id, name="Iron Vale"),
        )

    # Assert
    assert postgres_session.scalar(select(func.count()).select_from(Campaign)) == 0
