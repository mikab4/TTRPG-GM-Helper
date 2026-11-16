"""Lock the cited source asset row in the active-reference trigger."""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20261116_0004"
down_revision = "20260502_0003"
branch_labels = None
depends_on = None


KEY_SHARE_LOCKING_FUNCTION_SQL = """
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

UNLOCKED_FUNCTION_SQL_FROM_20260502_0003 = """
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
    op.execute(KEY_SHARE_LOCKING_FUNCTION_SQL)


def downgrade() -> None:
    op.execute(UNLOCKED_FUNCTION_SQL_FROM_20260502_0003)
