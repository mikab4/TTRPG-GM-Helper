from app.models import Owner


def test_persisted_row_gets_uuid7_primary_key_by_default(db_session_factory, owner_factory) -> None:
    stored_owner = owner_factory(email="gm@example.com", display_name="Local GM")

    with db_session_factory() as db_session:
        loaded_owner = db_session.get(Owner, stored_owner.id)

    assert loaded_owner is not None
    assert loaded_owner.id.version == 7
