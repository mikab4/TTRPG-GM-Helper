from __future__ import annotations

from sqlalchemy import event
from sqlalchemy.engine import Engine

from app.models import ExtractionCandidate, ExtractionJob
from app.services import campaign_service, entity_service, owner_service


class SelectStatementCounter:
    def __init__(self, engine: Engine) -> None:
        self._engine = engine
        self.select_statement_count = 0

    def __enter__(self) -> "SelectStatementCounter":
        event.listen(self._engine, "before_cursor_execute", self._before_cursor_execute)
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        event.remove(self._engine, "before_cursor_execute", self._before_cursor_execute)

    def _before_cursor_execute(
        self,
        conn,
        cursor,
        statement: str,
        parameters,
        context,
        executemany,
    ) -> None:
        del conn, cursor, parameters, context, executemany
        if statement.lstrip().upper().startswith("SELECT"):
            self.select_statement_count += 1


def test_get_campaign_does_not_eager_load_campaign_collections(
    db_session_factory,
    sqlite_engine: Engine,
    campaign_factory,
    session_factory,
    entity_factory,
    relationship_factory,
) -> None:
    # Arrange
    stored_campaign = campaign_factory(name="Iron Vale")
    session_factory(campaign=stored_campaign, session_number=1, session_label="Arrival")
    source_entity = entity_factory(campaign=stored_campaign, name="Mara")
    target_entity = entity_factory(campaign=stored_campaign, name="Harbor Guild")
    relationship_factory(
        campaign=stored_campaign,
        source_entity=source_entity,
        target_entity=target_entity,
    )

    with db_session_factory() as db_session:
        # Act
        with SelectStatementCounter(sqlite_engine) as statement_counter:
            loaded_campaign = campaign_service.get_campaign(db_session, stored_campaign.id)

        # Assert
        assert loaded_campaign.name == "Iron Vale"
        assert statement_counter.select_statement_count == 1


def test_get_default_owner_does_not_eager_load_owner_campaigns(
    db_session_factory,
    sqlite_engine: Engine,
    owner_factory,
    campaign_factory,
    session_factory,
) -> None:
    # Arrange
    stored_owner = owner_factory(email="gm@example.com", display_name="Local GM")
    stored_campaign = campaign_factory(owner=stored_owner, name="Iron Vale")
    session_factory(campaign=stored_campaign, session_number=1, session_label="Arrival")

    with db_session_factory() as db_session:
        # Act
        with SelectStatementCounter(sqlite_engine) as statement_counter:
            loaded_owner = owner_service.get_default_owner(db_session)

        # Assert
        assert loaded_owner.id == stored_owner.id
        assert statement_counter.select_statement_count == 1


def test_get_entity_does_not_eager_load_entity_relationships(
    db_session_factory,
    sqlite_engine: Engine,
    campaign_factory,
    entity_factory,
    relationship_factory,
) -> None:
    # Arrange
    stored_campaign = campaign_factory(name="Iron Vale")
    source_entity = entity_factory(campaign=stored_campaign, name="Mara")
    target_entity = entity_factory(campaign=stored_campaign, name="Harbor Guild")
    relationship_factory(
        campaign=stored_campaign,
        source_entity=source_entity,
        target_entity=target_entity,
    )

    with db_session_factory() as db_session:
        # Act
        with SelectStatementCounter(sqlite_engine) as statement_counter:
            loaded_entity = entity_service.get_entity(
                db_session,
                campaign_id=stored_campaign.id,
                entity_id=source_entity.id,
            )

        # Assert
        assert loaded_entity.name == "Mara"
        assert statement_counter.select_statement_count == 1


def test_loading_extraction_job_does_not_eager_load_candidates(
    db_session_factory,
    sqlite_engine: Engine,
    campaign_factory,
    source_asset_factory,
) -> None:
    # Arrange
    stored_campaign = campaign_factory(name="Iron Vale")
    stored_asset = source_asset_factory(campaign=stored_campaign)
    with db_session_factory() as db_session:
        stored_job = ExtractionJob(
            campaign_id=stored_campaign.id,
            source_asset_id=stored_asset.id,
            status="completed",
            extractor_kind="rules",
        )
        db_session.add(stored_job)
        db_session.flush()
        db_session.add(
            ExtractionCandidate(
                campaign_id=stored_campaign.id,
                extraction_job_id=stored_job.id,
                candidate_type="entity",
                payload={"type": "person", "name": "Mara"},
                status="pending",
            )
        )
        db_session.commit()
        stored_job_id = stored_job.id

    with db_session_factory() as db_session:
        # Act
        with SelectStatementCounter(sqlite_engine) as statement_counter:
            loaded_job = db_session.get(ExtractionJob, stored_job_id)

        # Assert
        assert loaded_job is not None
        assert loaded_job.status == "completed"
        assert statement_counter.select_statement_count == 1
