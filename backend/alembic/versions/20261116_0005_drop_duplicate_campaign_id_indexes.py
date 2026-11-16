"""Drop campaign_id indexes duplicated by leading columns of unique constraints."""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20261116_0005"
down_revision = "20261116_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_sessions_campaign_id", table_name="sessions")
    op.drop_index(
        "ix_relationship_type_definitions_campaign_id",
        table_name="relationship_type_definitions",
    )


def downgrade() -> None:
    op.create_index(
        "ix_relationship_type_definitions_campaign_id",
        "relationship_type_definitions",
        ["campaign_id"],
        unique=False,
    )
    op.create_index("ix_sessions_campaign_id", "sessions", ["campaign_id"], unique=False)
