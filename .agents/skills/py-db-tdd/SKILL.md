---
name: py-db-tdd
description: Use when writing, changing, or reviewing pytest tests under `backend/tests/`, including when a backend feature or bug fix needs new or updated tests.
---

# Py DB TDD

Follow the "Backend Tests" rules in `AGENTS.md`. This skill adds where the test infrastructure lives, which database a test should use, and the traps found in this suite.

## File Map

| Path | Holds |
|---|---|
| `backend/tests/conftest.py` | Factory fixtures (`owner_factory`, `campaign_factory`, `entity_factory`, `relationship_factory`, `session_factory`, `source_asset_factory`), `db_session_factory`, `sqlite_engine`, `api_request`, and the PostgreSQL fixtures `postgres_test_container` and `postgres_test_settings` |
| `backend/tests/factories.py` | `factory_boy` model factories (`OwnerFactory`, ...) with `create_in_session()`, used by the factory fixtures |
| `backend/tests/pg_test_support.py` | Docker container lifecycle, readiness checks, and `upgraded_postgres_test_engine()` |

## Choosing The Database

- Default: SQLite. Factory fixtures, `db_session_factory`, and `api_request` all use `sqlite_engine`.
- Use PostgreSQL only when the behavior depends on it: migrations, JSONB behavior, or PostgreSQL-only constraints. See `postgres_session` in `backend/tests/test_models.py` and `backend/tests/test_migrations.py`.

## Factory Fixtures

Each factory fixture opens, commits, and closes its own session, and returns a detached row. To create rows inside a session you already hold, pass `db_session=`:

```python
def test_get_campaign_or_raise_returns_stored_campaign(db_session_factory, campaign_factory) -> None:
    with db_session_factory() as db_session:
        stored_campaign = campaign_factory(db_session=db_session, name="Iron Vale")
        loaded_campaign = get_campaign_or_raise(db_session, stored_campaign.id)

    assert loaded_campaign.id == stored_campaign.id
```

## Example API Test

```python
def test_list_campaigns_supports_owner_filter(api_request, owner_factory, campaign_factory) -> None:
    owner = owner_factory(email="gm@example.com", display_name="Local GM")
    second_owner = owner_factory(email="other@example.com", display_name="Other GM")
    campaign_factory(owner=owner, name="Iron Vale")
    campaign_factory(owner=second_owner, name="Starfall")

    response = api_request("GET", "/api/campaigns", params={"owner_id": str(owner.id)})

    assert [listed_campaign["name"] for listed_campaign in response.json()] == ["Iron Vale"]
```

## Gotchas

- Use `api_request` for API tests; a hand-built client hangs on sync FastAPI handlers (`sync_api_test_runtime_shim` in `conftest.py`).
- Use `sqlite_engine` for SQLite tables; calling `Base.metadata.create_all` directly fails on `'{}'::jsonb` server defaults (`patched_jsonb_defaults` in `conftest.py`).
