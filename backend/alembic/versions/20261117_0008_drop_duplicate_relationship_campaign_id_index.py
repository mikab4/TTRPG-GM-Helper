"""Drop the relationship campaign_id index duplicated by the directed relationship unique constraint."""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20261117_0008"
down_revision = "20261116_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_entity_relationships_campaign_id", table_name="entity_relationships")


def downgrade() -> None:
    op.create_index(
        "ix_entity_relationships_campaign_id",
        "entity_relationships",
        ["campaign_id"],
        unique=False,
    )
