from __future__ import annotations

from sqlalchemy import event
from sqlalchemy.engine import Engine

from app.services import session_service


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


def test_list_sessions_does_not_eager_load_unused_source_assets(
    db_session_factory,
    sqlite_engine: Engine,
    campaign_factory,
    session_factory,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    session_factory(campaign=stored_campaign, session_number=3, session_label="Starfall")

    with db_session_factory() as db_session:
        # Act
        with SelectStatementCounter(sqlite_engine) as statement_counter:
            listed_sessions = session_service.list_sessions(
                db_session,
                campaign_id=stored_campaign.id,
            )

        # Assert
        assert [listed_session.session_label for listed_session in listed_sessions] == ["Starfall"]
        assert statement_counter.select_statement_count == 2


def test_get_session_does_not_eager_load_unused_source_assets(
    db_session_factory,
    sqlite_engine: Engine,
    campaign_factory,
    session_factory,
) -> None:
    # Arrange
    stored_campaign = campaign_factory()
    stored_session = session_factory(
        campaign=stored_campaign,
        session_number=4,
        session_label="Ashes in the Harbor",
    )

    with db_session_factory() as db_session:
        # Act
        with SelectStatementCounter(sqlite_engine) as statement_counter:
            loaded_session = session_service.get_session(
                db_session,
                campaign_id=stored_campaign.id,
                session_id=stored_session.id,
            )

        # Assert
        assert loaded_session.session_label == "Ashes in the Harbor"
        assert statement_counter.select_statement_count == 1
