from __future__ import annotations

from datetime import date
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.enums import (
    EntityType,
    RelationshipCertaintyStatus,
    RelationshipFamily,
    RelationshipLifecycleStatus,
    RelationshipVisibilityStatus,
)
from app.schemas import (
    CampaignCreate,
    CampaignUpdate,
    EntityCreate,
    EntityUpdate,
    RelationshipCreate,
    RelationshipTypeCreate,
    SessionCreate,
    SessionUpdate,
)


def test_campaign_create_forbids_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        CampaignCreate(
            owner_id=uuid4(),
            name="Iron Vale",
            rogue="x",
        )


def test_entity_create_forbids_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        EntityCreate(
            type="person",
            name="Magistrate Ilya",
            rogue="x",
        )


@pytest.mark.parametrize("blank_campaign_name", ["", "   "])
def test_campaign_create_rejects_blank_name(blank_campaign_name: str) -> None:
    with pytest.raises(ValidationError):
        CampaignCreate(owner_id=uuid4(), name=blank_campaign_name)


@pytest.mark.parametrize("blank_entity_type", ["", "   "])
def test_entity_create_rejects_blank_type(blank_entity_type: str) -> None:
    with pytest.raises(ValidationError):
        EntityCreate(type=blank_entity_type, name="Magistrate Ilya")


@pytest.mark.parametrize("blank_entity_name", ["", "   "])
def test_entity_create_rejects_blank_name(blank_entity_name: str) -> None:
    with pytest.raises(ValidationError):
        EntityCreate(type="person", name=blank_entity_name)


def test_request_models_trim_non_blank_strings() -> None:
    created_campaign = CampaignCreate(
        owner_id=uuid4(),
        name="  Iron Vale  ",
        description="  Frontier survival  ",
    )
    created_entity = EntityCreate(
        type="  person  ",
        name="  Magistrate Ilya  ",
        summary="  A city official with a hidden agenda.  ",
    )

    assert created_campaign.name == "Iron Vale"
    assert created_campaign.description == "Frontier survival"
    assert created_entity.type is EntityType.PERSON
    assert created_entity.name == "Magistrate Ilya"
    assert created_entity.summary == "A city official with a hidden agenda."


def test_relationship_request_models_use_str_enums() -> None:
    relationship_type_create = RelationshipTypeCreate(
        label="bodyguard of",
        family=" social ",
        reverse_label="guarded by",
        is_symmetric=False,
        allowed_source_types=[" person "],
        allowed_target_types=["person"],
    )
    relationship_create = RelationshipCreate(
        source_entity_id=uuid4(),
        target_entity_id=uuid4(),
        relationship_type=" spouse_of ",
        lifecycle_status=" current ",
        visibility_status=" secret ",
        certainty_status=" rumored ",
    )

    assert relationship_type_create.family is RelationshipFamily.SOCIAL
    assert relationship_type_create.allowed_source_types == [EntityType.PERSON]
    assert relationship_type_create.allowed_target_types == [EntityType.PERSON]
    assert relationship_create.lifecycle_status is RelationshipLifecycleStatus.CURRENT
    assert relationship_create.visibility_status is RelationshipVisibilityStatus.SECRET
    assert relationship_create.certainty_status is RelationshipCertaintyStatus.RUMORED


@pytest.mark.parametrize("blank_description", ["   "])
def test_campaign_create_rejects_blank_description(blank_description: str) -> None:
    with pytest.raises(ValidationError):
        CampaignCreate(
            owner_id=uuid4(),
            name="Iron Vale",
            description=blank_description,
        )


@pytest.mark.parametrize("blank_description", ["   "])
def test_campaign_update_rejects_blank_description(blank_description: str) -> None:
    with pytest.raises(ValidationError):
        CampaignUpdate(description=blank_description)


@pytest.mark.parametrize("blank_summary", ["   "])
def test_entity_create_rejects_blank_summary(blank_summary: str) -> None:
    with pytest.raises(ValidationError):
        EntityCreate(
            type="person",
            name="Magistrate Ilya",
            summary=blank_summary,
        )


@pytest.mark.parametrize("blank_summary", ["   "])
def test_entity_update_rejects_blank_summary(blank_summary: str) -> None:
    with pytest.raises(ValidationError):
        EntityUpdate(summary=blank_summary)


def test_optional_free_text_update_fields_allow_null_to_clear() -> None:
    campaign_update = CampaignUpdate(description=None)
    entity_update = EntityUpdate(summary=None)

    assert campaign_update.description is None
    assert entity_update.summary is None


def test_campaign_update_rejects_null_name() -> None:
    with pytest.raises(ValidationError):
        CampaignUpdate(name=None, description="Updated")


def test_entity_update_rejects_null_name() -> None:
    with pytest.raises(ValidationError):
        EntityUpdate(name=None, summary="Updated")


def test_entity_update_rejects_null_type() -> None:
    with pytest.raises(ValidationError):
        EntityUpdate(type=None, summary="Updated")


def test_entity_update_rejects_null_metadata() -> None:
    with pytest.raises(ValidationError):
        EntityUpdate(metadata=None, summary="Updated")


def test_campaign_update_rejects_empty_payload() -> None:
    with pytest.raises(ValidationError):
        CampaignUpdate()


def test_entity_update_rejects_empty_payload() -> None:
    with pytest.raises(ValidationError):
        EntityUpdate()


@pytest.mark.parametrize("invalid_entity_type", ["npc", "artifact", ""])
def test_entity_request_models_reject_unknown_entity_types(invalid_entity_type: str) -> None:
    with pytest.raises(ValidationError):
        EntityCreate(type=invalid_entity_type, name="Magistrate Ilya")

    with pytest.raises(ValidationError):
        EntityUpdate(type=invalid_entity_type, summary="Updated")


def test_session_create_requires_number_or_label() -> None:
    with pytest.raises(ValidationError):
        SessionCreate(
            played_on=date(2026, 4, 17),
            summary="The party reached the observatory.",
        )


def test_session_update_rejects_empty_payload() -> None:
    with pytest.raises(ValidationError):
        SessionUpdate()


def test_session_update_allows_identity_fields_to_be_cleared_in_payload() -> None:
    session_update = SessionUpdate(session_number=None)

    assert session_update.session_number is None
