from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Relationship
from app.models.relationship_type_definition import RelationshipTypeDefinition
from app.schemas import RelationshipTypeCreate, RelationshipTypeUpdate
from app.schemas.relationship_types import normalize_relationship_type_key
from app.services.campaign_lookup import ensure_campaign_exists
from app.services.errors import ConflictError, NotFoundError
from app.services.relationship_catalog import (
    BUILT_IN_RELATIONSHIP_TYPES,
    RelationshipTypeDescriptor,
    get_relationship_type_descriptor,
    list_relationship_type_descriptors,
)

_CAMPAIGN_KEY_UNIQUE_CONSTRAINT = "uq_relationship_type_definitions_campaign_key"


def list_relationship_types(
    db_session: Session,
    *,
    campaign_id: UUID | None = None,
) -> list[RelationshipTypeDescriptor]:
    if campaign_id is not None:
        ensure_campaign_exists(db_session, campaign_id)
    return list_relationship_type_descriptors(db_session, campaign_id=campaign_id)


def create_relationship_type(
    db_session: Session,
    *,
    campaign_id: UUID,
    relationship_type_create: RelationshipTypeCreate,
) -> RelationshipTypeDefinition:
    ensure_campaign_exists(db_session, campaign_id)

    normalized_type_key = normalize_relationship_type_key(relationship_type_create.label)
    if normalized_type_key in BUILT_IN_RELATIONSHIP_TYPES:
        raise ConflictError("Relationship type key conflicts with a built-in relationship type.")

    conflicting_type_definition = db_session.scalar(
        select(RelationshipTypeDefinition).where(
            RelationshipTypeDefinition.campaign_id == campaign_id,
            RelationshipTypeDefinition.key == normalized_type_key,
        )
    )
    if conflicting_type_definition is not None:
        raise ConflictError("Relationship type already exists for this campaign.")

    created_type_definition = RelationshipTypeDefinition(
        campaign_id=campaign_id,
        key=normalized_type_key,
        label=relationship_type_create.label,
        family=relationship_type_create.family,
        reverse_label=relationship_type_create.reverse_label,
        is_symmetric=relationship_type_create.is_symmetric,
        allowed_source_types=relationship_type_create.allowed_source_types,
        allowed_target_types=relationship_type_create.allowed_target_types,
    )
    db_session.add(created_type_definition)
    try:
        db_session.commit()
    except IntegrityError as exc:
        db_session.rollback()
        if _violates_campaign_key_uniqueness(exc):
            raise ConflictError("Relationship type already exists for this campaign.") from exc
        raise
    db_session.refresh(created_type_definition)
    return created_type_definition


def update_relationship_type(
    db_session: Session,
    *,
    campaign_id: UUID,
    relationship_type_key: str,
    relationship_type_update: RelationshipTypeUpdate,
) -> RelationshipTypeDefinition:
    stored_type_definition = _get_custom_relationship_type(
        db_session,
        campaign_id=campaign_id,
        relationship_type_key=relationship_type_key,
    )
    update_fields = relationship_type_update.model_dump(exclude_unset=True)
    semantic_fields = {"family", "is_symmetric", "allowed_source_types", "allowed_target_types"}

    if update_fields.keys() & semantic_fields and _relationship_type_is_in_use(
        db_session,
        campaign_id=campaign_id,
        relationship_type_key=stored_type_definition.key,
    ):
        raise ConflictError("Semantic fields cannot change after a type is in use.")

    effective_is_symmetric = update_fields.get("is_symmetric", stored_type_definition.is_symmetric)
    effective_reverse_label = update_fields.get(
        "reverse_label",
        stored_type_definition.reverse_label,
    )
    if effective_is_symmetric and effective_reverse_label is not None:
        raise ValueError("Symmetric relationship types cannot define a reverse label.")
    if not effective_is_symmetric and effective_reverse_label is None:
        raise ValueError("Asymmetric relationship types must define a reverse label.")

    for field_name, field_value in update_fields.items():
        setattr(stored_type_definition, field_name, field_value)

    db_session.commit()
    db_session.refresh(stored_type_definition)
    return stored_type_definition


def delete_relationship_type(
    db_session: Session,
    *,
    campaign_id: UUID,
    relationship_type_key: str,
) -> None:
    stored_type_definition = _get_custom_relationship_type(
        db_session,
        campaign_id=campaign_id,
        relationship_type_key=relationship_type_key,
    )
    if _relationship_type_is_in_use(
        db_session,
        campaign_id=campaign_id,
        relationship_type_key=stored_type_definition.key,
    ):
        raise ConflictError("Relationship type cannot be deleted while it is in use.")

    db_session.delete(stored_type_definition)
    db_session.commit()


def _get_custom_relationship_type(
    db_session: Session,
    *,
    campaign_id: UUID,
    relationship_type_key: str,
) -> RelationshipTypeDefinition:
    ensure_campaign_exists(db_session, campaign_id)

    relationship_type_descriptor = get_relationship_type_descriptor(
        db_session,
        relationship_type_key=relationship_type_key,
        campaign_id=campaign_id,
    )
    if relationship_type_descriptor is None or not relationship_type_descriptor.is_custom:
        raise NotFoundError("Relationship type not found.")

    stored_type_definition = db_session.scalar(
        select(RelationshipTypeDefinition).where(
            RelationshipTypeDefinition.campaign_id == campaign_id,
            RelationshipTypeDefinition.key == relationship_type_descriptor.key,
        )
    )
    if stored_type_definition is None:
        raise NotFoundError("Relationship type not found.")
    return stored_type_definition


def _relationship_type_is_in_use(
    db_session: Session,
    *,
    campaign_id: UUID,
    relationship_type_key: str,
) -> bool:
    used_relationship = db_session.scalar(
        select(Relationship.id).where(
            Relationship.campaign_id == campaign_id,
            Relationship.relationship_type == relationship_type_key,
        )
    )
    return used_relationship is not None


def _violates_campaign_key_uniqueness(integrity_error: IntegrityError) -> bool:
    driver_diagnostics = getattr(integrity_error.orig, "diag", None)
    violated_constraint_name = getattr(driver_diagnostics, "constraint_name", None)
    return violated_constraint_name == _CAMPAIGN_KEY_UNIQUE_CONSTRAINT
