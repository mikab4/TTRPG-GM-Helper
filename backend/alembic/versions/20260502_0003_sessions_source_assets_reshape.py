"""Reshape session notes and source documents into sessions and source assets."""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260502_0003"
down_revision = "20260410_0002"
branch_labels = None
depends_on = None

UUID = sa.Uuid()
JSONB = postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.rename_table("session_notes", "sessions")
    op.execute("ALTER TABLE sessions RENAME CONSTRAINT uq_session_note_campaign_number TO uq_sessions_campaign_number")
    op.execute("ALTER TABLE sessions RENAME CONSTRAINT uq_session_note_id_campaign TO uq_sessions_id_campaign")
    op.execute("ALTER TABLE sessions RENAME CONSTRAINT ck_session_notes_number_or_label TO ck_sessions_number_or_label")
    op.execute("ALTER INDEX ix_session_notes_campaign_id RENAME TO ix_sessions_campaign_id")

    op.rename_table("source_documents", "source_assets")
    op.alter_column("source_assets", "session_note_id", new_column_name="session_id")
    op.execute("ALTER TABLE source_assets RENAME CONSTRAINT uq_source_document_id_campaign TO uq_source_assets_id_campaign")
    op.execute(
        "ALTER TABLE source_assets RENAME CONSTRAINT "
        "fk_source_documents_session_note_campaign TO "
        "fk_source_assets_session_campaign"
    )
    op.execute("ALTER INDEX ix_source_documents_campaign_id RENAME TO ix_source_assets_campaign_id")
    op.execute(
        "ALTER INDEX ix_source_documents_session_note_id_campaign_id RENAME TO ix_source_assets_session_id_campaign_id"
    )

    op.alter_column("entities", "source_document_id", new_column_name="source_asset_id")
    op.execute(
        "ALTER TABLE entities RENAME CONSTRAINT fk_entities_source_document_campaign TO fk_entities_source_asset_campaign"
    )
    op.execute("ALTER INDEX ix_entities_source_document_id_campaign_id RENAME TO ix_entities_source_asset_id_campaign_id")

    op.alter_column("entity_relationships", "source_document_id", new_column_name="source_asset_id")
    op.execute(
        "ALTER TABLE entity_relationships RENAME CONSTRAINT "
        "fk_entity_relationships_source_document_campaign TO "
        "fk_entity_relationships_source_asset_campaign"
    )
    op.execute(
        "ALTER INDEX ix_entity_relationships_source_document_id_campaign_id "
        "RENAME TO ix_entity_relationships_source_asset_id_campaign_id"
    )

    op.alter_column("extraction_jobs", "source_document_id", new_column_name="source_asset_id")
    op.execute(
        "ALTER TABLE extraction_jobs RENAME CONSTRAINT "
        "fk_extraction_jobs_source_document_campaign TO "
        "fk_extraction_jobs_source_asset_campaign"
    )
    op.execute(
        "ALTER INDEX ix_extraction_jobs_source_document_id_campaign_id "
        "RENAME TO ix_extraction_jobs_source_asset_id_campaign_id"
    )

    op.add_column("source_assets", sa.Column("media_type", sa.Text(), nullable=True))
    op.add_column("source_assets", sa.Column("original_filename", sa.Text(), nullable=True))
    op.add_column("source_assets", sa.Column("file_size_bytes", sa.BigInteger(), nullable=True))
    op.add_column("source_assets", sa.Column("checksum", sa.Text(), nullable=True))
    op.add_column("source_assets", sa.Column("storage_key", sa.Text(), nullable=True))
    op.add_column("source_assets", sa.Column("lifecycle_status", sa.Text(), nullable=True))
    op.add_column("source_assets", sa.Column("storage_status", sa.Text(), nullable=True))
    op.add_column("source_assets", sa.Column("delete_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("source_assets", sa.Column("delete_last_error_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("source_assets", sa.Column("delete_last_error_message", sa.Text(), nullable=True))
    op.add_column("source_assets", sa.Column("parse_status", sa.Text(), nullable=True))
    op.add_column("source_assets", sa.Column("last_parsed_at", sa.DateTime(timezone=True), nullable=True))

    op.execute(
        """
        UPDATE source_assets
        SET
            media_type = 'text/plain',
            original_filename = concat(
                trim(
                    both '-'
                    FROM regexp_replace(
                        lower(coalesce(nullif(title, ''), id::text)),
                        '[^a-z0-9]+',
                        '-',
                        'g'
                    )
                ),
                '.txt'
            ),
            file_size_bytes = octet_length(raw_text),
            checksum = concat(
                'sha256:',
                encode(digest(convert_to(coalesce(raw_text, ''), 'UTF8'), 'sha256'), 'hex')
            ),
            storage_key = concat('legacy-assets/', id::text, '.txt'),
            lifecycle_status = 'active',
            storage_status = 'missing',
            parse_status = 'succeeded',
            last_parsed_at = updated_at
        """
    )

    op.alter_column("source_assets", "media_type", nullable=False)
    op.alter_column("source_assets", "original_filename", nullable=False)
    op.alter_column("source_assets", "file_size_bytes", nullable=False)
    op.alter_column("source_assets", "checksum", nullable=False)
    op.alter_column("source_assets", "storage_key", nullable=False)
    op.alter_column("source_assets", "lifecycle_status", nullable=False)
    op.alter_column("source_assets", "storage_status", nullable=False)
    op.alter_column("source_assets", "parse_status", nullable=False)

    op.execute(
        """
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
    )
    op.execute(
        """
        CREATE TRIGGER tr_entities_require_active_source_asset
        BEFORE INSERT OR UPDATE OF source_asset_id ON entities
        FOR EACH ROW
        EXECUTE FUNCTION enforce_active_source_asset_reference();
        """
    )
    op.execute(
        """
        CREATE TRIGGER tr_entity_relationships_require_active_source_asset
        BEFORE INSERT OR UPDATE OF source_asset_id ON entity_relationships
        FOR EACH ROW
        EXECUTE FUNCTION enforce_active_source_asset_reference();
        """
    )
    op.execute(
        """
        CREATE TRIGGER tr_extraction_jobs_require_active_source_asset
        BEFORE INSERT OR UPDATE OF source_asset_id ON extraction_jobs
        FOR EACH ROW
        EXECUTE FUNCTION enforce_active_source_asset_reference();
        """
    )

    op.create_table(
        "asset_parse_results",
        sa.Column("id", UUID, nullable=False),
        sa.Column("asset_id", UUID, nullable=False),
        sa.Column("parser_kind", sa.Text(), nullable=False),
        sa.Column("parser_version", sa.Text(), nullable=False),
        sa.Column("source_checksum", sa.Text(), nullable=False),
        sa.Column("parse_status", sa.Text(), nullable=False),
        sa.Column("inline_raw_text", sa.Text(), nullable=True),
        sa.Column("inline_structured_content", JSONB, nullable=True),
        sa.Column("artifact_storage_key", sa.Text(), nullable=True),
        sa.Column("artifact_size_bytes", sa.BigInteger(), nullable=True),
        sa.Column(
            "warnings",
            JSONB,
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "error_message",
            sa.Text(),
            nullable=True,
        ),
        sa.Column(
            "parsed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["asset_id"],
            ["source_assets.id"],
            name="fk_asset_parse_results_asset_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "asset_id",
            "parser_kind",
            "parser_version",
            "source_checksum",
            name="uq_asset_parse_results_asset_parser_checksum",
        ),
    )
    op.create_index(
        "ix_asset_parse_results_asset_id",
        "asset_parse_results",
        ["asset_id"],
        unique=False,
    )

    op.execute(
        """
        INSERT INTO asset_parse_results (
            id,
            asset_id,
            parser_kind,
            parser_version,
            source_checksum,
            parse_status,
            inline_raw_text,
            warnings,
            parsed_at
        )
        SELECT
            gen_random_uuid(),
            id,
            'text',
            'legacy_raw_text_v1',
            checksum,
            'succeeded',
            raw_text,
            '[]'::jsonb,
            coalesce(last_parsed_at, updated_at, created_at)
        FROM source_assets
        """
    )

    op.drop_column("source_assets", "raw_text")


def downgrade() -> None:
    op.add_column("source_assets", sa.Column("raw_text", sa.Text(), nullable=True))
    op.execute(
        """
        UPDATE source_assets AS asset
        SET raw_text = coalesce(parse_result.inline_raw_text, '')
        FROM (
            SELECT DISTINCT ON (asset_id)
                asset_id,
                inline_raw_text
            FROM asset_parse_results
            ORDER BY asset_id, parsed_at DESC, id DESC
        ) AS parse_result
        WHERE asset.id = parse_result.asset_id
        """
    )
    op.execute("UPDATE source_assets SET raw_text = '' WHERE raw_text IS NULL")
    op.alter_column("source_assets", "raw_text", nullable=False)

    op.drop_index("ix_asset_parse_results_asset_id", table_name="asset_parse_results")
    op.drop_table("asset_parse_results")

    op.execute("DROP TRIGGER IF EXISTS tr_extraction_jobs_require_active_source_asset ON extraction_jobs")
    op.execute("DROP TRIGGER IF EXISTS tr_entity_relationships_require_active_source_asset ON entity_relationships")
    op.execute("DROP TRIGGER IF EXISTS tr_entities_require_active_source_asset ON entities")
    op.execute("DROP FUNCTION IF EXISTS enforce_active_source_asset_reference()")

    op.drop_column("source_assets", "last_parsed_at")
    op.drop_column("source_assets", "parse_status")
    op.drop_column("source_assets", "delete_last_error_message")
    op.drop_column("source_assets", "delete_last_error_at")
    op.drop_column("source_assets", "delete_started_at")
    op.drop_column("source_assets", "storage_status")
    op.drop_column("source_assets", "lifecycle_status")
    op.drop_column("source_assets", "storage_key")
    op.drop_column("source_assets", "checksum")
    op.drop_column("source_assets", "file_size_bytes")
    op.drop_column("source_assets", "original_filename")
    op.drop_column("source_assets", "media_type")

    op.execute(
        "ALTER INDEX ix_extraction_jobs_source_asset_id_campaign_id "
        "RENAME TO ix_extraction_jobs_source_document_id_campaign_id"
    )
    op.execute(
        "ALTER TABLE extraction_jobs RENAME CONSTRAINT "
        "fk_extraction_jobs_source_asset_campaign TO "
        "fk_extraction_jobs_source_document_campaign"
    )
    op.alter_column("extraction_jobs", "source_asset_id", new_column_name="source_document_id")

    op.execute(
        "ALTER INDEX ix_entity_relationships_source_asset_id_campaign_id "
        "RENAME TO ix_entity_relationships_source_document_id_campaign_id"
    )
    op.execute(
        "ALTER TABLE entity_relationships RENAME CONSTRAINT "
        "fk_entity_relationships_source_asset_campaign TO "
        "fk_entity_relationships_source_document_campaign"
    )
    op.alter_column("entity_relationships", "source_asset_id", new_column_name="source_document_id")

    op.execute("ALTER INDEX ix_entities_source_asset_id_campaign_id RENAME TO ix_entities_source_document_id_campaign_id")
    op.execute(
        "ALTER TABLE entities RENAME CONSTRAINT fk_entities_source_asset_campaign TO fk_entities_source_document_campaign"
    )
    op.alter_column("entities", "source_asset_id", new_column_name="source_document_id")

    op.execute(
        "ALTER INDEX ix_source_assets_session_id_campaign_id RENAME TO ix_source_documents_session_note_id_campaign_id"
    )
    op.execute("ALTER INDEX ix_source_assets_campaign_id RENAME TO ix_source_documents_campaign_id")
    op.execute(
        "ALTER TABLE source_assets RENAME CONSTRAINT "
        "fk_source_assets_session_campaign TO "
        "fk_source_documents_session_note_campaign"
    )
    op.execute("ALTER TABLE source_assets RENAME CONSTRAINT uq_source_assets_id_campaign TO uq_source_document_id_campaign")
    op.alter_column("source_assets", "session_id", new_column_name="session_note_id")
    op.rename_table("source_assets", "source_documents")

    op.execute("ALTER INDEX ix_sessions_campaign_id RENAME TO ix_session_notes_campaign_id")
    op.execute("ALTER TABLE sessions RENAME CONSTRAINT ck_sessions_number_or_label TO ck_session_notes_number_or_label")
    op.execute("ALTER TABLE sessions RENAME CONSTRAINT uq_sessions_id_campaign TO uq_session_note_id_campaign")
    op.execute("ALTER TABLE sessions RENAME CONSTRAINT uq_sessions_campaign_number TO uq_session_note_campaign_number")
    op.rename_table("sessions", "session_notes")
