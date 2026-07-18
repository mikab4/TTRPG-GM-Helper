from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4

import pytest
from sqlalchemy import Connection, inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from alembic import command
from app.config import Settings
from app.models import (
    AssetParseResult,
    Campaign,
    Entity,
    ExtractionCandidate,
    ExtractionJob,
    Owner,
    Relationship,
    Session,
    SourceAsset,
)
from app.models.relationship_type_definition import RelationshipTypeDefinition
from tests.pg_test_support import (
    build_alembic_config,
    create_test_engine,
    reset_public_schema,
    upgraded_postgres_test_engine,
)

EXPECTED_TABLES = {
    "alembic_version",
    "owners",
    "campaigns",
    "sessions",
    "source_assets",
    "asset_parse_results",
    "extraction_jobs",
    "extraction_candidates",
    "entities",
    "entity_relationships",
    "relationship_type_definitions",
}


def test_alembic_upgrade_head_creates_expected_tables(
    monkeypatch: pytest.MonkeyPatch,
    postgres_test_settings: Settings,
) -> None:
    with upgraded_postgres_test_engine(
        monkeypatch=monkeypatch,
        settings=postgres_test_settings,
    ) as engine:
        inspector = inspect(engine)
        relationship_columns = {column["name"] for column in inspector.get_columns("entity_relationships")}
        source_asset_columns = {column["name"] for column in inspector.get_columns("source_assets")}
        parse_result_columns = {column["name"] for column in inspector.get_columns("asset_parse_results")}

        assert EXPECTED_TABLES.issubset(set(inspector.get_table_names()))
        assert {"lifecycle_status", "visibility_status", "certainty_status"}.issubset(relationship_columns)
        assert {
            "session_id",
            "media_type",
            "original_filename",
            "file_size_bytes",
            "checksum",
            "storage_key",
            "parse_status",
            "last_parsed_at",
        }.issubset(source_asset_columns)
        assert {
            "asset_id",
            "parser_kind",
            "parser_version",
            "source_checksum",
            "parse_status",
            "inline_raw_text",
            "inline_structured_content",
            "artifact_storage_key",
            "artifact_size_bytes",
            "warnings",
            "error_message",
            "parsed_at",
        }.issubset(parse_result_columns)


def test_source_asset_rejects_session_from_another_campaign(
    monkeypatch: pytest.MonkeyPatch,
    postgres_test_settings: Settings,
) -> None:
    with upgraded_postgres_test_engine(
        monkeypatch=monkeypatch,
        settings=postgres_test_settings,
    ) as engine:
        with DBSession(engine) as db_session:
            owner = Owner(email="gm@example.com")
            campaign_a = Campaign(owner=owner, name="Campaign A")
            campaign_b = Campaign(owner=owner, name="Campaign B")
            campaign_b_session = Session(campaign=campaign_b, session_number=1)

            db_session.add_all([owner, campaign_a, campaign_b, campaign_b_session])
            db_session.commit()

            invalid_asset = build_source_asset(
                campaign=campaign_a,
                session_id=campaign_b_session.id,
            )
            db_session.add(invalid_asset)

            with pytest.raises(IntegrityError):
                db_session.commit()

            db_session.rollback()


def test_extraction_job_rejects_source_asset_from_another_campaign(
    monkeypatch: pytest.MonkeyPatch,
    postgres_test_settings: Settings,
) -> None:
    with upgraded_postgres_test_engine(
        monkeypatch=monkeypatch,
        settings=postgres_test_settings,
    ) as engine:
        with DBSession(engine) as db_session:
            owner = Owner(email="gm@example.com")
            campaign_a = Campaign(owner=owner, name="Campaign A")
            campaign_b = Campaign(owner=owner, name="Campaign B")
            asset_a = build_source_asset(campaign=campaign_a)
            asset_b = build_source_asset(campaign=campaign_b)

            db_session.add_all([owner, campaign_a, campaign_b, asset_a, asset_b])
            db_session.commit()

            invalid_job = ExtractionJob(
                campaign=campaign_a,
                source_asset_id=asset_b.id,
                status="pending",
                extractor_kind="rules",
            )
            db_session.add(invalid_job)

            with pytest.raises(IntegrityError):
                db_session.commit()

            db_session.rollback()


def test_extraction_job_rejects_deleting_source_asset(
    monkeypatch: pytest.MonkeyPatch,
    postgres_test_settings: Settings,
) -> None:
    with upgraded_postgres_test_engine(
        monkeypatch=monkeypatch,
        settings=postgres_test_settings,
    ) as engine:
        with DBSession(engine) as db_session:
            owner = Owner(email="gm@example.com")
            campaign = Campaign(owner=owner, name="Campaign A")
            deleting_asset = build_source_asset(campaign=campaign)
            deleting_asset.lifecycle_status = "deleting"

            db_session.add_all([owner, campaign, deleting_asset])
            db_session.commit()

            invalid_job = ExtractionJob(
                campaign=campaign,
                source_asset_id=deleting_asset.id,
                status="pending",
                extractor_kind="rules",
            )
            db_session.add(invalid_job)

            with pytest.raises(IntegrityError):
                db_session.commit()

            db_session.rollback()


def test_extraction_candidate_rejects_job_from_another_campaign(
    monkeypatch: pytest.MonkeyPatch,
    postgres_test_settings: Settings,
) -> None:
    with upgraded_postgres_test_engine(
        monkeypatch=monkeypatch,
        settings=postgres_test_settings,
    ) as engine:
        with DBSession(engine) as db_session:
            owner = Owner(email="gm@example.com")
            campaign_a = Campaign(owner=owner, name="Campaign A")
            campaign_b = Campaign(owner=owner, name="Campaign B")
            asset_b = build_source_asset(campaign=campaign_b)
            job_b = ExtractionJob(
                campaign=campaign_b,
                source_asset=asset_b,
                status="completed",
                extractor_kind="rules",
            )

            db_session.add_all([owner, campaign_a, campaign_b, asset_b, job_b])
            db_session.commit()

            invalid_candidate = ExtractionCandidate(
                campaign=campaign_a,
                extraction_job_id=job_b.id,
                candidate_type="entity",
                payload={"name": "Mismatch"},
                status="pending",
            )
            db_session.add(invalid_candidate)

            with pytest.raises(IntegrityError):
                db_session.commit()

            db_session.rollback()


def test_relationship_rejects_target_entity_from_another_campaign(
    monkeypatch: pytest.MonkeyPatch,
    postgres_test_settings: Settings,
) -> None:
    with upgraded_postgres_test_engine(
        monkeypatch=monkeypatch,
        settings=postgres_test_settings,
    ) as engine:
        with DBSession(engine) as db_session:
            owner = Owner(email="gm@example.com")
            campaign_a = Campaign(owner=owner, name="Campaign A")
            campaign_b = Campaign(owner=owner, name="Campaign B")
            source_entity = Entity(campaign=campaign_a, type="npc", name="Entity A")
            foreign_target_entity = Entity(campaign=campaign_b, type="npc", name="Entity B")

            db_session.add_all([owner, campaign_a, campaign_b, source_entity, foreign_target_entity])
            db_session.commit()

            invalid_relationship = Relationship(
                campaign=campaign_a,
                source_entity=source_entity,
                target_entity_id=foreign_target_entity.id,
                relationship_type="knows",
            )
            db_session.add(invalid_relationship)

            with pytest.raises(IntegrityError):
                db_session.commit()

            db_session.rollback()


def test_alembic_migration_rejects_invalid_relationship_type_direction_labels(
    monkeypatch: pytest.MonkeyPatch,
    postgres_test_settings: Settings,
) -> None:
    with upgraded_postgres_test_engine(
        monkeypatch=monkeypatch,
        settings=postgres_test_settings,
    ) as engine:
        with DBSession(engine) as db_session:
            owner = Owner(email="gm@example.com")
            campaign = Campaign(owner=owner, name="Campaign A")
            db_session.add_all([owner, campaign])
            db_session.commit()

            invalid_type = RelationshipTypeDefinition(
                campaign=campaign,
                key="bodyguard_of",
                label="bodyguard of",
                family="social",
                reverse_label=None,
                is_symmetric=False,
                allowed_source_types=["person"],
                allowed_target_types=["person"],
            )
            db_session.add(invalid_type)

            with pytest.raises(IntegrityError):
                db_session.commit()

            db_session.rollback()


def test_session_delete_is_restricted_when_source_asset_references_it(
    monkeypatch: pytest.MonkeyPatch,
    postgres_test_settings: Settings,
) -> None:
    with upgraded_postgres_test_engine(
        monkeypatch=monkeypatch,
        settings=postgres_test_settings,
    ) as engine:
        with DBSession(engine) as db_session:
            owner = Owner(email="gm@example.com")
            campaign = Campaign(owner=owner, name="Campaign A")
            stored_session = Session(campaign=campaign, session_number=1)
            source_asset = build_source_asset(
                campaign=campaign,
                linked_session=stored_session,
            )
            entity = Entity(
                campaign=campaign,
                type="npc",
                name="Entity A",
                source_asset=source_asset,
            )
            relationship = Relationship(
                campaign=campaign,
                source_entity=entity,
                target_entity=entity,
                relationship_type="self_ref",
                source_asset=source_asset,
            )

            db_session.add_all([owner, campaign, stored_session, source_asset, entity, relationship])
            db_session.commit()

            db_session.delete(stored_session)

            with pytest.raises(IntegrityError):
                db_session.commit()

            db_session.rollback()


def test_source_asset_delete_is_restricted_when_records_reference_it(
    monkeypatch: pytest.MonkeyPatch,
    postgres_test_settings: Settings,
) -> None:
    with upgraded_postgres_test_engine(
        monkeypatch=monkeypatch,
        settings=postgres_test_settings,
    ) as engine:
        with DBSession(engine) as db_session:
            owner = Owner(email="gm@example.com")
            campaign = Campaign(owner=owner, name="Campaign A")
            stored_session = Session(campaign=campaign, session_number=1)
            source_asset = build_source_asset(
                campaign=campaign,
                linked_session=stored_session,
            )
            entity = Entity(
                campaign=campaign,
                type="npc",
                name="Entity A",
                source_asset=source_asset,
            )
            relationship = Relationship(
                campaign=campaign,
                source_entity=entity,
                target_entity=entity,
                relationship_type="self_ref",
                source_asset=source_asset,
            )

            db_session.add_all([owner, campaign, stored_session, source_asset, entity, relationship])
            db_session.commit()

            db_session.delete(source_asset)

            with pytest.raises(IntegrityError):
                db_session.commit()

            db_session.rollback()


def test_upgrade_from_20260410_backfills_legacy_source_document_into_source_asset_and_parse_result(
    monkeypatch: pytest.MonkeyPatch,
    postgres_test_settings: Settings,
) -> None:
    # Arrange
    engine = create_test_engine(postgres_test_settings)
    alembic_config = build_alembic_config()

    reset_public_schema(engine)
    monkeypatch.setenv("DATABASE_URL", postgres_test_settings.database_url)

    try:
        command.upgrade(alembic_config, "20260410_0002")

        with engine.begin() as connection:
            legacy_record_ids = insert_legacy_source_document_scenario(connection)

        # Act
        command.upgrade(alembic_config, "head")

        with DBSession(engine) as db_session:
            migrated_asset = db_session.get(SourceAsset, legacy_record_ids.asset_id)
            migrated_parse_results = db_session.scalars(
                select(AssetParseResult).where(AssetParseResult.asset_id == legacy_record_ids.asset_id)
            ).all()
            migrated_entity = db_session.get(Entity, legacy_record_ids.entity_id)
            migrated_relationship = db_session.get(Relationship, legacy_record_ids.relationship_id)
            migrated_job = db_session.get(ExtractionJob, legacy_record_ids.extraction_job_id)

            # Assert
            assert migrated_asset is not None
            assert migrated_asset.session_id == legacy_record_ids.session_id
            assert migrated_asset.parse_status == "succeeded"
            assert migrated_asset.checksum.startswith("sha256:")
            assert migrated_asset.storage_status == "missing"
            assert len(migrated_parse_results) == 1

            migrated_parse_result = migrated_parse_results[0]
            assert migrated_parse_result.inline_raw_text == ("Legacy recap text for migration backfill.")
            assert migrated_parse_result.parser_kind == "text"
            assert migrated_parse_result.parser_version == "legacy_raw_text_v1"
            assert migrated_parse_result.parse_status == "succeeded"
            assert migrated_parse_result.source_checksum == migrated_asset.checksum

            assert migrated_entity is not None
            assert migrated_entity.source_asset_id == legacy_record_ids.asset_id
            assert migrated_relationship is not None
            assert migrated_relationship.source_asset_id == legacy_record_ids.asset_id
            assert migrated_job is not None
            assert migrated_job.source_asset_id == legacy_record_ids.asset_id
    finally:
        command.downgrade(alembic_config, "base")
        monkeypatch.delenv("DATABASE_URL", raising=False)
        engine.dispose()


@dataclass(frozen=True)
class LegacySourceDocumentScenario:
    owner_id: object
    campaign_id: object
    session_id: object
    asset_id: object
    entity_id: object
    relationship_id: object
    extraction_job_id: object


def build_source_asset(
    *,
    campaign: Campaign,
    linked_session: Session | None = None,
    session_id: object | None = None,
    truth_status: str = "canonical",
) -> SourceAsset:
    return SourceAsset(
        campaign=campaign,
        session=linked_session,
        session_id=session_id,
        title="GM recap",
        media_type="text/plain",
        original_filename="gm-recap.txt",
        file_size_bytes=256,
        checksum=f"sha256:{uuid4().hex}",
        storage_key=f"assets/{uuid4().hex}.txt",
        parse_status="pending",
        truth_status=truth_status,
    )


def insert_legacy_source_document_scenario(connection: Connection) -> LegacySourceDocumentScenario:
    legacy_record_ids = LegacySourceDocumentScenario(
        owner_id=uuid4(),
        campaign_id=uuid4(),
        session_id=uuid4(),
        asset_id=uuid4(),
        entity_id=uuid4(),
        relationship_id=uuid4(),
        extraction_job_id=uuid4(),
    )

    connection.execute(
        text(
            """
            INSERT INTO owners (id, email, created_at, updated_at)
            VALUES (:owner_id, :email, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
        ),
        {
            "owner_id": legacy_record_ids.owner_id,
            "email": "gm@example.com",
        },
    )
    connection.execute(
        text(
            """
            INSERT INTO campaigns (id, owner_id, name, created_at, updated_at)
            VALUES (:campaign_id, :owner_id, :name, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
        ),
        {
            "campaign_id": legacy_record_ids.campaign_id,
            "owner_id": legacy_record_ids.owner_id,
            "name": "Campaign A",
        },
    )
    connection.execute(
        text(
            """
            INSERT INTO session_notes (
                id,
                campaign_id,
                session_number,
                created_at,
                updated_at
            )
            VALUES (
                :session_id,
                :campaign_id,
                7,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
            """
        ),
        {
            "session_id": legacy_record_ids.session_id,
            "campaign_id": legacy_record_ids.campaign_id,
        },
    )
    connection.execute(
        text(
            """
            INSERT INTO source_documents (
                id,
                campaign_id,
                session_note_id,
                title,
                truth_status,
                raw_text,
                metadata,
                created_at,
                updated_at
            )
            VALUES (
                :asset_id,
                :campaign_id,
                :session_id,
                :title,
                'canonical',
                :raw_text,
                '{}'::jsonb,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
            """
        ),
        {
            "asset_id": legacy_record_ids.asset_id,
            "campaign_id": legacy_record_ids.campaign_id,
            "session_id": legacy_record_ids.session_id,
            "title": "Legacy recap",
            "raw_text": "Legacy recap text for migration backfill.",
        },
    )
    connection.execute(
        text(
            """
            INSERT INTO entities (
                id,
                campaign_id,
                type,
                name,
                source_document_id,
                metadata,
                provenance_data,
                created_at,
                updated_at
            )
            VALUES (
                :entity_id,
                :campaign_id,
                'person',
                'Archivist Nera',
                :asset_id,
                '{}'::jsonb,
                '{}'::jsonb,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
            """
        ),
        {
            "entity_id": legacy_record_ids.entity_id,
            "campaign_id": legacy_record_ids.campaign_id,
            "asset_id": legacy_record_ids.asset_id,
        },
    )
    connection.execute(
        text(
            """
            INSERT INTO entity_relationships (
                id,
                campaign_id,
                source_entity_id,
                target_entity_id,
                relationship_type,
                source_document_id,
                provenance_data,
                lifecycle_status,
                visibility_status,
                certainty_status,
                created_at,
                updated_at
            )
            VALUES (
                :relationship_id,
                :campaign_id,
                :entity_id,
                :entity_id,
                'knows',
                :asset_id,
                '{}'::jsonb,
                'current',
                'public',
                'confirmed',
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
            """
        ),
        {
            "relationship_id": legacy_record_ids.relationship_id,
            "campaign_id": legacy_record_ids.campaign_id,
            "entity_id": legacy_record_ids.entity_id,
            "asset_id": legacy_record_ids.asset_id,
        },
    )
    connection.execute(
        text(
            """
            INSERT INTO extraction_jobs (
                id,
                campaign_id,
                source_document_id,
                status,
                extractor_kind,
                created_at
            )
            VALUES (
                :job_id,
                :campaign_id,
                :asset_id,
                'completed',
                'rules',
                CURRENT_TIMESTAMP
            )
            """
        ),
        {
            "job_id": legacy_record_ids.extraction_job_id,
            "campaign_id": legacy_record_ids.campaign_id,
            "asset_id": legacy_record_ids.asset_id,
        },
    )

    return legacy_record_ids
