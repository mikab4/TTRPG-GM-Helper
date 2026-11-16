"""Lock the cited source asset row in the active-reference trigger.

`enforce_active_source_asset_reference` backs the triggers on `entities`,
`entity_relationships`, and `extraction_jobs`. It read
`source_assets.lifecycle_status` without a row lock, so a citing write could
pass the check while an asset delete held the row `FOR UPDATE` and then commit
after the asset became `deleting`.

The lookup now takes `FOR KEY SHARE`. That is enough because it conflicts with
the `FOR UPDATE` the delete path takes before it checks references and marks
the asset `deleting`, so a citing write waits for the delete and re-checks the
committed row. It does not conflict with ordinary non-key updates of the asset
row (`FOR NO KEY UPDATE`), so a transaction that cites an asset and then updates
that row, such as setting `parse_status`, does not deadlock against its twin.
`FOR SHARE` would.
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20261116_0004"
down_revision = "20260502_0003"
branch_labels = None
depends_on = None


LOCKING_FUNCTION_SQL = """
        CREATE OR REPLACE FUNCTION enforce_active_source_asset_reference()
        RETURNS trigger AS $$
        BEGIN
            IF NEW.source_asset_id IS NULL THEN
                RETURN NEW;
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM source_assets
                WHERE id = NEW.source_asset_id
                  AND campaign_id = NEW.campaign_id
                  AND lifecycle_status = 'active'
                FOR KEY SHARE
            ) THEN
                RAISE EXCEPTION
                    USING
                        ERRCODE = '23514',
                        MESSAGE = 'Source asset cannot accept new provenance references while deletion is in progress.';
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """

# Body created by revision 20260502_0003, restored verbatim on downgrade.
PREVIOUS_FUNCTION_SQL = """
        CREATE OR REPLACE FUNCTION enforce_active_source_asset_reference()
        RETURNS trigger AS $$
        BEGIN
            IF NEW.source_asset_id IS NULL THEN
                RETURN NEW;
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM source_assets
                WHERE id = NEW.source_asset_id
                  AND campaign_id = NEW.campaign_id
                  AND lifecycle_status = 'active'
            ) THEN
                RAISE EXCEPTION
                    USING
                        ERRCODE = '23514',
                        MESSAGE = 'Source asset cannot accept new provenance references while deletion is in progress.';
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """


def upgrade() -> None:
    op.execute(LOCKING_FUNCTION_SQL)


def downgrade() -> None:
    op.execute(PREVIOUS_FUNCTION_SQL)
