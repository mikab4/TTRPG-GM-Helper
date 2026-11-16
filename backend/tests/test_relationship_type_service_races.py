from __future__ import annotations

from types import SimpleNamespace

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from app.config import Settings
from app.models import Campaign, Owner
from app.models.relationship_type_definition import RelationshipTypeDefinition
from app.schemas import RelationshipTypeCreate
from app.services import ConflictError, relationship_type_service
from tests.pg_test_support import upgraded_postgres_test_engine


class _FakeDriverError(Exception):
    def __init__(self, message: str, *, constraint_name: str | None) -> None:
        super().__init__(message)
        self.diag = SimpleNamespace(constraint_name=constraint_name)


def _install_failing_commit(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
    *,
    constraint_name: str,
) -> list[int]:
    rollback_calls: list[int] = []

    def failing_commit() -> None:
        raise IntegrityError(
            "INSERT INTO relationship_type_definitions",
            params=None,
            orig=_FakeDriverError(
                f'violates constraint "{constraint_name}"',
                constraint_name=constraint_name,
            ),
        )

    def recording_rollback() -> None:
        rollback_calls.append(1)

    monkeypatch.setattr(db_session, "commit", failing_commit)
    monkeypatch.setattr(db_session, "rollback", recording_rollback)
    return rollback_calls


def _sworn_rival_type_create() -> RelationshipTypeCreate:
    return RelationshipTypeCreate(
        label="Sworn Rival",
        family="social",
        reverse_label="Sworn Rival Of",
        is_symmetric=False,
        allowed_source_types=["person"],
        allowed_target_types=["person"],
    )


def test_create_relationship_type_translates_concurrent_duplicate_key_to_conflict_error(
    db_session_factory,
    campaign_factory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()

    with db_session_factory() as db_session:
        rollback_calls = _install_failing_commit(
            db_session,
            monkeypatch,
            constraint_name="uq_relationship_type_definitions_campaign_key",
        )

        # Act / Assert
        with pytest.raises(ConflictError, match="Relationship type already exists for this campaign."):
            relationship_type_service.create_relationship_type(
                db_session,
                campaign_id=stored_campaign.id,
                relationship_type_create=_sworn_rival_type_create(),
            )

    assert len(rollback_calls) == 1


def test_create_relationship_type_does_not_report_other_integrity_errors_as_duplicates(
    db_session_factory,
    campaign_factory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()

    with db_session_factory() as db_session:
        rollback_calls = _install_failing_commit(
            db_session,
            monkeypatch,
            constraint_name="ck_relationship_type_definitions_direction_labels",
        )

        # Act / Assert
        with pytest.raises(IntegrityError):
            relationship_type_service.create_relationship_type(
                db_session,
                campaign_id=stored_campaign.id,
                relationship_type_create=_sworn_rival_type_create(),
            )

    assert len(rollback_calls) == 1


@pytest.fixture
def postgres_session(
    monkeypatch: pytest.MonkeyPatch,
    postgres_test_settings: Settings,
):
    with upgraded_postgres_test_engine(
        monkeypatch=monkeypatch,
        settings=postgres_test_settings,
    ) as engine:
        with DBSession(engine) as session:
            yield session


def _persist_postgres_campaign(postgres_session: DBSession) -> Campaign:
    stored_campaign = Campaign(
        owner=Owner(email="gm@example.com", display_name="Local GM"),
        name="Iron Vale",
    )
    postgres_session.add(stored_campaign)
    postgres_session.commit()
    return stored_campaign


def test_create_relationship_type_maps_real_postgres_unique_race_to_conflict_error(
    postgres_session: DBSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    stored_campaign = _persist_postgres_campaign(postgres_session)
    campaign_id = stored_campaign.id
    original_scalar = postgres_session.scalar

    def scalar_then_competing_insert(statement, *args, **kwargs):
        result = original_scalar(statement, *args, **kwargs)
        if statement.column_descriptions[0]["entity"] is RelationshipTypeDefinition:
            with DBSession(postgres_session.get_bind()) as competing_session:
                competing_session.add(
                    RelationshipTypeDefinition(
                        campaign_id=campaign_id,
                        key="sworn_rival",
                        label="Sworn Rival",
                        family="social",
                        reverse_label="Sworn Rival Of",
                        is_symmetric=False,
                        allowed_source_types=["person"],
                        allowed_target_types=["person"],
                    )
                )
                competing_session.commit()
        return result

    monkeypatch.setattr(postgres_session, "scalar", scalar_then_competing_insert)

    # Act / Assert
    with pytest.raises(ConflictError, match="Relationship type already exists for this campaign."):
        relationship_type_service.create_relationship_type(
            postgres_session,
            campaign_id=campaign_id,
            relationship_type_create=_sworn_rival_type_create(),
        )


def test_create_relationship_type_reraises_real_postgres_check_violation(
    postgres_session: DBSession,
) -> None:
    # Arrange
    stored_campaign = _persist_postgres_campaign(postgres_session)
    invalid_direction_create = RelationshipTypeCreate.model_construct(
        label="Sworn Rival",
        family="social",
        reverse_label=None,
        is_symmetric=False,
        allowed_source_types=["person"],
        allowed_target_types=["person"],
    )

    # Act / Assert
    with pytest.raises(IntegrityError, match="ck_relationship_type_definitions_direction_labels"):
        relationship_type_service.create_relationship_type(
            postgres_session,
            campaign_id=stored_campaign.id,
            relationship_type_create=invalid_direction_create,
        )
