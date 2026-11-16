"""Add a unique constraint on directed relationships after refusing existing duplicates."""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "20261116_0006"
down_revision = "20261116_0005"
branch_labels = None
depends_on = None


DIRECTED_RELATIONSHIP_UNIQUE_CONSTRAINT = "uq_entity_relationships_campaign_type_source_target"
DIRECTED_RELATIONSHIP_COLUMNS = ["campaign_id", "relationship_type", "source_entity_id", "target_entity_id"]

DUPLICATE_DIRECTED_RELATIONSHIPS_SQL = """
    SELECT
        campaign_id,
        relationship_type,
        source_entity_id,
        target_entity_id,
        array_agg(id::text ORDER BY id) AS relationship_ids
    FROM entity_relationships
    GROUP BY campaign_id, relationship_type, source_entity_id, target_entity_id
    HAVING count(*) > 1
    ORDER BY campaign_id, relationship_type, source_entity_id, target_entity_id
    """


def describe_duplicate_group(duplicate_group: sa.Row) -> str:
    return (
        f"campaign_id={duplicate_group.campaign_id} relationship_type={duplicate_group.relationship_type} "
        f"source_entity_id={duplicate_group.source_entity_id} target_entity_id={duplicate_group.target_entity_id} "
        f"relationship_ids={', '.join(duplicate_group.relationship_ids)}"
    )


def refuse_existing_duplicate_directed_relationships() -> None:
    duplicate_groups = op.get_bind().execute(sa.text(DUPLICATE_DIRECTED_RELATIONSHIPS_SQL)).all()
    if not duplicate_groups:
        return
    raise RuntimeError(
        "\n".join(
            [
                f"Cannot add {DIRECTED_RELATIONSHIP_UNIQUE_CONSTRAINT}: "
                "entity_relationships has duplicate directed relationships. "
                "Resolve them and rerun the migration. Nothing was changed.",
                *(describe_duplicate_group(duplicate_group) for duplicate_group in duplicate_groups),
            ]
        )
    )


def upgrade() -> None:
    refuse_existing_duplicate_directed_relationships()
    op.create_unique_constraint(
        DIRECTED_RELATIONSHIP_UNIQUE_CONSTRAINT,
        "entity_relationships",
        DIRECTED_RELATIONSHIP_COLUMNS,
    )


def downgrade() -> None:
    op.drop_constraint(DIRECTED_RELATIONSHIP_UNIQUE_CONSTRAINT, "entity_relationships", type_="unique")
