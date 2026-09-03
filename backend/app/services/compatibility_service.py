from __future__ import annotations

from collections import defaultdict

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.enums import EntityType
from app.models import Campaign, Entity
from app.schemas.compatibility import (
    EntityTypeCompatibilityReport,
    EntityTypeMigrationRequest,
    EntityTypeMigrationResult,
    EntityTypeMigrationResultItem,
    LegacyEntityTypeExample,
    LegacyEntityTypeIssue,
)
from app.services.errors import ConflictError

CANONICAL_ENTITY_TYPES = frozenset(entity_type.value for entity_type in EntityType)
EXAMPLE_LIMIT_PER_TYPE = 3


def normalize_legacy_entity_type(legacy_entity_type: str) -> str:
    return legacy_entity_type.strip().lower()


def build_entity_type_compatibility_report(db_session: Session) -> EntityTypeCompatibilityReport:
    legacy_type_rows = list(
        db_session.execute(
            select(Entity.type, func.count(Entity.id))
            .where(Entity.type.not_in(CANONICAL_ENTITY_TYPES))
            .group_by(Entity.type)
            .order_by(Entity.type)
        )
    )
    if not legacy_type_rows:
        return EntityTypeCompatibilityReport(has_issues=False, issue_count=0, issues=[])

    counts_by_normalized_type: dict[str, int] = defaultdict(int)
    raw_variants_by_normalized_type: dict[str, set[str]] = defaultdict(set)
    for raw_legacy_type, issue_count in legacy_type_rows:
        normalized_legacy_type = normalize_legacy_entity_type(raw_legacy_type)
        counts_by_normalized_type[normalized_legacy_type] += issue_count
        raw_variants_by_normalized_type[normalized_legacy_type].add(raw_legacy_type)

    example_rows = list(
        db_session.execute(
            select(Entity.type, Entity.id, Entity.name, Campaign.id, Campaign.name)
            .join(Campaign, Campaign.id == Entity.campaign_id)
            .where(Entity.type.not_in(CANONICAL_ENTITY_TYPES))
            .order_by(Entity.type, Entity.name, Entity.id)
        )
    )
    examples_by_type: dict[str, list[LegacyEntityTypeExample]] = defaultdict(list)
    for raw_legacy_type, entity_id, entity_name, campaign_id, campaign_name in example_rows:
        normalized_legacy_type = normalize_legacy_entity_type(raw_legacy_type)
        if len(examples_by_type[normalized_legacy_type]) >= EXAMPLE_LIMIT_PER_TYPE:
            continue

        examples_by_type[normalized_legacy_type].append(
            LegacyEntityTypeExample(
                entity_id=entity_id,
                entity_name=entity_name,
                campaign_id=campaign_id,
                campaign_name=campaign_name,
            )
        )

    issues = [
        LegacyEntityTypeIssue(
            legacy_type=normalized_legacy_type,
            raw_variants=sorted(raw_variants_by_normalized_type[normalized_legacy_type]),
            count=counts_by_normalized_type[normalized_legacy_type],
            example_entities=examples_by_type[normalized_legacy_type],
        )
        for normalized_legacy_type in sorted(counts_by_normalized_type)
    ]
    return EntityTypeCompatibilityReport(
        has_issues=True,
        issue_count=len(issues),
        issues=issues,
    )


def migrate_entity_types(
    db_session: Session,
    migration_request: EntityTypeMigrationRequest,
) -> EntityTypeMigrationResult:
    compatibility_report = build_entity_type_compatibility_report(db_session)
    unresolved_issues_by_legacy_type = {issue.legacy_type: issue for issue in compatibility_report.issues}
    unresolved_legacy_types = set(unresolved_issues_by_legacy_type)
    mappings_by_legacy_type = {
        normalize_legacy_entity_type(mapping.legacy_type): mapping.target_type.value
        for mapping in migration_request.mappings
    }

    missing_legacy_types = sorted(unresolved_legacy_types - set(mappings_by_legacy_type))
    if missing_legacy_types:
        raise ConflictError("Missing mappings for legacy entity types: " + ", ".join(missing_legacy_types) + ".")

    updated_types: list[EntityTypeMigrationResultItem] = []
    total_updated_count = 0
    for legacy_type in sorted(unresolved_legacy_types):
        target_type = mappings_by_legacy_type[legacy_type]
        raw_legacy_variants = unresolved_issues_by_legacy_type[legacy_type].raw_variants
        updated_count = 0
        for raw_legacy_variant in raw_legacy_variants:
            updated_count += (
                db_session.execute(update(Entity).where(Entity.type == raw_legacy_variant).values(type=target_type)).rowcount
                or 0
            )
        total_updated_count += updated_count
        updated_types.append(
            EntityTypeMigrationResultItem(
                legacy_type=legacy_type,
                target_type=target_type,
                updated_count=updated_count,
            )
        )

    db_session.commit()
    return EntityTypeMigrationResult(updated_count=total_updated_count, updated_types=updated_types)
