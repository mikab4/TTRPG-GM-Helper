from __future__ import annotations

from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.enums import EntityType, RelationshipFamily, normalize_str_enum_value
from app.models import Entity, Relationship
from app.schemas import RelationshipCreate, RelationshipUpdate
from app.services.asset_service import ensure_asset_accepts_provenance_reference
from app.services.campaign_lookup import ensure_campaign_exists
from app.services.errors import ConflictError, NotFoundError
from app.services.relationship_catalog import list_relationship_type_descriptors_by_family
from app.services.relationship_descriptor_resolver import get_descriptor_or_raise


def create_relationship(
    db_session: Session,
    *,
    campaign_id: UUID,
    relationship_create: RelationshipCreate,
) -> Relationship:
    ensure_campaign_exists(db_session, campaign_id)
    source_entity, target_entity = _get_relationship_endpoints(
        db_session,
        campaign_id=campaign_id,
        source_entity_id=relationship_create.source_entity_id,
        target_entity_id=relationship_create.target_entity_id,
    )
    _validate_source_asset(
        db_session,
        campaign_id=campaign_id,
        source_asset_id=relationship_create.source_asset_id,
    )
    prepared_relationship_type = _validate_and_resolve_relationship_type(
        db_session,
        campaign_id=campaign_id,
        relationship_type=relationship_create.relationship_type,
        source_entity=source_entity,
        target_entity=target_entity,
    )

    created_relationship = Relationship(
        campaign_id=campaign_id,
        source_entity_id=source_entity.id,
        target_entity_id=target_entity.id,
        relationship_type=prepared_relationship_type,
        lifecycle_status=relationship_create.lifecycle_status,
        visibility_status=relationship_create.visibility_status,
        certainty_status=relationship_create.certainty_status,
        notes=relationship_create.notes,
        confidence=relationship_create.confidence,
        source_asset_id=relationship_create.source_asset_id,
        provenance_excerpt=relationship_create.provenance_excerpt,
        provenance_data=relationship_create.provenance_data,
    )
    db_session.add(created_relationship)
    _commit_relationship_write(db_session)
    db_session.refresh(created_relationship)
    return created_relationship


def list_relationships(
    db_session: Session,
    *,
    campaign_id: UUID,
    relationship_type: str | None = None,
    relationship_family: str | None = None,
) -> list[Relationship]:
    ensure_campaign_exists(db_session, campaign_id)
    statement = _build_relationship_list_statement(
        db_session,
        campaign_id=campaign_id,
        relationship_type=relationship_type,
        relationship_family=relationship_family,
    )
    statement = statement.order_by(Relationship.created_at.desc(), Relationship.id)
    return list(db_session.scalars(statement))


def get_relationship(
    db_session: Session,
    *,
    campaign_id: UUID,
    relationship_id: UUID,
) -> Relationship:
    stored_relationship = db_session.scalar(
        select(Relationship).where(
            Relationship.id == relationship_id,
            Relationship.campaign_id == campaign_id,
        )
    )
    if stored_relationship is None:
        raise NotFoundError("Relationship not found.")
    return stored_relationship


def update_relationship(
    db_session: Session,
    *,
    campaign_id: UUID,
    relationship_id: UUID,
    relationship_update: RelationshipUpdate,
) -> Relationship:
    stored_relationship = get_relationship(
        db_session,
        campaign_id=campaign_id,
        relationship_id=relationship_id,
    )
    update_fields = relationship_update.model_dump(exclude_unset=True)
    if "source_asset_id" in update_fields:
        _validate_source_asset(
            db_session,
            campaign_id=campaign_id,
            source_asset_id=update_fields["source_asset_id"],
        )
    if "relationship_type" in update_fields:
        source_entity, target_entity = _get_relationship_endpoints(
            db_session,
            campaign_id=campaign_id,
            source_entity_id=stored_relationship.source_entity_id,
            target_entity_id=stored_relationship.target_entity_id,
        )
        update_fields["relationship_type"] = _validate_and_resolve_relationship_type(
            db_session,
            campaign_id=campaign_id,
            relationship_type=update_fields["relationship_type"],
            source_entity=source_entity,
            target_entity=target_entity,
            existing_relationship_id=stored_relationship.id,
        )

    for field_name, field_value in update_fields.items():
        setattr(stored_relationship, field_name, field_value)

    _commit_relationship_write(db_session)
    db_session.refresh(stored_relationship)
    return stored_relationship


def delete_relationship(
    db_session: Session,
    *,
    campaign_id: UUID,
    relationship_id: UUID,
) -> None:
    stored_relationship = get_relationship(
        db_session,
        campaign_id=campaign_id,
        relationship_id=relationship_id,
    )
    db_session.delete(stored_relationship)
    db_session.commit()


def _get_campaign_entity(
    db_session: Session,
    *,
    campaign_id: UUID,
    entity_id: UUID,
    not_found_message: str,
) -> Entity:
    stored_entity = db_session.scalar(
        select(Entity).where(
            Entity.id == entity_id,
            Entity.campaign_id == campaign_id,
        )
    )
    if stored_entity is None:
        raise NotFoundError(not_found_message)
    return stored_entity


def _build_relationship_list_statement(
    db_session: Session,
    *,
    campaign_id: UUID,
    relationship_type: str | None,
    relationship_family: str | None,
):
    statement = select(Relationship).where(Relationship.campaign_id == campaign_id)
    normalized_relationship_family = (
        normalize_str_enum_value(RelationshipFamily, relationship_family) if relationship_family is not None else None
    )
    if relationship_type is not None:
        relationship_descriptor = get_descriptor_or_raise(
            db_session,
            campaign_id=campaign_id,
            relationship_type=relationship_type,
        )
        if normalized_relationship_family is not None and relationship_descriptor.family != normalized_relationship_family:
            raise ValueError("Relationship type does not belong to the requested relationship family.")
        return statement.where(Relationship.relationship_type == relationship_descriptor.key)

    if normalized_relationship_family is not None:
        matching_relationship_type_keys = [
            descriptor.key
            for descriptor in list_relationship_type_descriptors_by_family(
                db_session,
                relationship_family=normalized_relationship_family,
                campaign_id=campaign_id,
            )
        ]
        statement = statement.where(Relationship.relationship_type.in_(matching_relationship_type_keys))

    return statement


def _get_relationship_endpoints(
    db_session: Session,
    *,
    campaign_id: UUID,
    source_entity_id: UUID,
    target_entity_id: UUID,
) -> tuple[Entity, Entity]:
    source_entity = _get_campaign_entity(
        db_session,
        campaign_id=campaign_id,
        entity_id=source_entity_id,
        not_found_message="Source entity not found.",
    )
    target_entity = _get_campaign_entity(
        db_session,
        campaign_id=campaign_id,
        entity_id=target_entity_id,
        not_found_message="Target entity not found.",
    )
    return source_entity, target_entity


def _validate_source_asset(
    db_session: Session,
    *,
    campaign_id: UUID,
    source_asset_id: UUID | None,
) -> None:
    ensure_asset_accepts_provenance_reference(
        db_session,
        campaign_id=campaign_id,
        source_asset_id=source_asset_id,
    )


def _commit_relationship_write(db_session: Session) -> None:
    try:
        db_session.commit()
    except IntegrityError as exc:
        db_session.rollback()
        if _is_source_asset_delete_conflict(exc):
            raise ConflictError(
                "Source asset cannot accept new provenance references while deletion is in progress."
            ) from exc
        raise


def _is_source_asset_delete_conflict(exc: IntegrityError) -> bool:
    return "Source asset cannot accept new provenance references while deletion is in progress." in str(exc)


def _validate_and_resolve_relationship_type(
    db_session: Session,
    *,
    campaign_id: UUID,
    relationship_type: str,
    source_entity: Entity,
    target_entity: Entity,
    existing_relationship_id: UUID | None = None,
) -> str:
    relationship_descriptor = get_descriptor_or_raise(
        db_session,
        campaign_id=campaign_id,
        relationship_type=relationship_type,
    )
    _validate_type_pair(
        source_entity_type=source_entity.type,
        target_entity_type=target_entity.type,
        relationship_descriptor=relationship_descriptor,
    )
    _validate_duplicates(
        db_session,
        campaign_id=campaign_id,
        relationship_type=relationship_descriptor.key,
        source_entity_id=source_entity.id,
        target_entity_id=target_entity.id,
        is_symmetric=relationship_descriptor.is_symmetric,
        existing_relationship_id=existing_relationship_id,
    )
    return relationship_descriptor.key


def _validate_type_pair(
    *,
    source_entity_type: str,
    target_entity_type: str,
    relationship_descriptor,
) -> None:
    normalized_source_entity_type = normalize_str_enum_value(EntityType, source_entity_type)
    normalized_target_entity_type = normalize_str_enum_value(EntityType, target_entity_type)
    if normalized_source_entity_type not in relationship_descriptor.allowed_source_types:
        raise ValueError("Relationship type is not valid for the source and target entity types.")
    if normalized_target_entity_type not in relationship_descriptor.allowed_target_types:
        raise ValueError("Relationship type is not valid for the source and target entity types.")


def _validate_duplicates(
    db_session: Session,
    *,
    campaign_id: UUID,
    relationship_type: str,
    source_entity_id: UUID,
    target_entity_id: UUID,
    is_symmetric: bool,
    existing_relationship_id: UUID | None = None,
) -> None:
    duplicate_conditions = [
        Relationship.campaign_id == campaign_id,
        Relationship.relationship_type == relationship_type,
    ]
    if existing_relationship_id is not None:
        duplicate_conditions.append(Relationship.id != existing_relationship_id)

    if is_symmetric:
        duplicate_statement = select(Relationship.id).where(
            *duplicate_conditions,
            or_(
                (Relationship.source_entity_id == source_entity_id) & (Relationship.target_entity_id == target_entity_id),
                (Relationship.source_entity_id == target_entity_id) & (Relationship.target_entity_id == source_entity_id),
            ),
        )
        if db_session.scalar(duplicate_statement) is not None:
            raise ConflictError("Symmetric relationship already exists for these entities.")
        return

    duplicate_statement = select(Relationship.id).where(
        *duplicate_conditions,
        Relationship.source_entity_id == source_entity_id,
        Relationship.target_entity_id == target_entity_id,
    )
    if db_session.scalar(duplicate_statement) is not None:
        raise ConflictError("Relationship already exists for these entities.")
