# Backend Test Factory Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace object-style backend test fixtures with explicit `factory-boy` factories and factory fixtures so scenario data stays visible in tests while setup plumbing stays centralized.

**Architecture:** Keep infrastructure fixtures in `conftest.py` for app wiring, SQLite engine lifecycle, and Dockerized Postgres session setup. Move test data creation to generic SQLAlchemy factories in a dedicated test support module, then migrate tests to use `owner_factory`, `campaign_factory`, `entity_factory`, and related helpers directly in the Arrange step. Remove fixed scenario fixtures such as `test_owner` and `test_campaign`, and avoid replacing them with new named scenario fixtures.

**Tech Stack:** Pytest, factory-boy, SQLAlchemy, FastAPI backend tests, Ruff

---

### Task 1: Add `factory-boy` and define generic SQLAlchemy factories

**Files:**
- Modify: `backend/pyproject.toml`
- Create: `backend/tests/factories.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/test_owners_api.py`

**Step 1: Write the failing test**

In `backend/tests/test_owners_api.py`, add or update one focused test so it expects an `owner_factory` fixture instead of `test_owner`.

**Step 2: Run the focused test to verify it fails**

Run: `UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests/test_owners_api.py -q`

Expected: FAIL because `owner_factory` does not exist yet.

**Step 3: Write the minimal implementation**

- Add `factory-boy` to the backend `dev` dependency group in `backend/pyproject.toml`
- Create `backend/tests/factories.py` with:
  - a small SQLAlchemy factory base
  - `OwnerFactory`
  - `CampaignFactory`
  - `EntityFactory`
  - `RelationshipFactory` only if immediately needed by touched tests
- In `backend/tests/conftest.py`, add generic factory fixtures that return callable creators bound to the current SQLAlchemy session
- Keep factory defaults boring and override-friendly

**Step 4: Run the focused test to verify it passes**

Run: `UV_CACHE_DIR=/tmp/uv-cache uv sync`
Run: `UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests/test_owners_api.py -q`

Expected: PASS

**Step 5: Commit**

```bash
git add backend/pyproject.toml backend/tests/factories.py backend/tests/conftest.py backend/tests/test_owners_api.py
git commit -m "test: add backend factory fixtures"
```

### Task 2: Migrate campaign and campaign-adjacent tests to explicit factories

**Files:**
- Modify: `backend/tests/test_campaigns_api.py`
- Modify: `backend/tests/test_campaign_lookup.py`
- Modify: `backend/tests/conftest.py`

**Step 1: Write the failing test**

Replace `test_owner` / `test_campaign` usage in one campaign API test with `owner_factory` / `campaign_factory`, and strengthen one weak `422` assertion to check the validation message.

**Step 2: Run the focused campaign tests to verify they fail**

Run: `UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests/test_campaigns_api.py tests/test_campaign_lookup.py -q`

Expected: FAIL until the old fixtures are removed or the tests are migrated correctly.

**Step 3: Write the minimal implementation**

- Remove `test_owner` and `test_campaign` fixture usage from the touched tests
- Keep Arrange data explicit in the test body
- Replace direct `db_session_factory` setup with factory calls where it improves readability
- Leave infra fixtures in place

**Step 4: Run the focused campaign tests to verify they pass**

Run: `UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests/test_campaigns_api.py tests/test_campaign_lookup.py -q`

Expected: PASS

**Step 5: Commit**

```bash
git add backend/tests/test_campaigns_api.py backend/tests/test_campaign_lookup.py backend/tests/conftest.py
git commit -m "test: migrate campaign tests to factories"
```

### Task 3: Migrate the remaining SQLite-backed API tests to factories

**Files:**
- Modify: `backend/tests/test_entities_api.py`
- Modify: `backend/tests/test_relationships_api.py`
- Modify: `backend/tests/test_compatibility_api.py`
- Modify: `backend/tests/test_relationship_catalog.py`
- Modify: `backend/tests/test_relationship_type_routes.py`
- Modify: `backend/tests/conftest.py`
- Modify: `backend/tests/factories.py`

**Step 1: Write the failing test**

Convert one representative entity or relationship API test to use factories and run the focused module to confirm the suite still depends on old fixture setup.

**Step 2: Run the focused tests to verify they fail**

Run: `UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests/test_entities_api.py tests/test_relationships_api.py tests/test_compatibility_api.py -q`

Expected: FAIL until all touched tests are migrated consistently.

**Step 3: Write the minimal implementation**

- Add any missing generic factories needed for these tests
- Replace direct ORM object creation inside `with db_session_factory()` blocks where factories improve the story
- Keep special-case values visible in the test body
- Do not introduce named scenario fixtures

**Step 4: Run the focused tests to verify they pass**

Run: `UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests/test_entities_api.py tests/test_relationships_api.py tests/test_compatibility_api.py tests/test_relationship_catalog.py tests/test_relationship_type_routes.py -q`

Expected: PASS

**Step 5: Commit**

```bash
git add backend/tests/test_entities_api.py backend/tests/test_relationships_api.py backend/tests/test_compatibility_api.py backend/tests/test_relationship_catalog.py backend/tests/test_relationship_type_routes.py backend/tests/conftest.py backend/tests/factories.py
git commit -m "test: migrate backend api tests to factories"
```

### Task 4: Migrate helper and lookup tests, then remove obsolete fixtures

**Files:**
- Modify: `backend/tests/test_campaign_lookup.py`
- Modify: `backend/tests/test_main.py`
- Modify: `backend/tests/test_api_router.py`
- Modify: `backend/tests/conftest.py`

**Step 1: Write the failing test**

Remove one obsolete fixture from `conftest.py` after migrating its last consumer, then run the affected tests to surface any remaining hidden dependencies.

**Step 2: Run the focused tests to verify they fail**

Run: `UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests/test_campaign_lookup.py tests/test_main.py tests/test_api_router.py -q`

Expected: FAIL if any test still relies on removed fixtures.

**Step 3: Write the minimal implementation**

- Finish any remaining fixture migrations
- Remove `test_owner`, `test_campaign`, and `api_client_factory` if unused
- Keep `api_request`, SQLite engine fixtures, runtime shim, and Docker Postgres fixtures

**Step 4: Run the focused tests to verify they pass**

Run: `UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests/test_campaign_lookup.py tests/test_main.py tests/test_api_router.py -q`

Expected: PASS

**Step 5: Commit**

```bash
git add backend/tests/test_campaign_lookup.py backend/tests/test_main.py backend/tests/test_api_router.py backend/tests/conftest.py
git commit -m "test: remove obsolete backend test fixtures"
```

### Task 5: Verify the full backend suite and document the factory pattern

**Files:**
- Modify: `README.md`
- Modify: `backend/tests/conftest.py`
- Modify: `backend/tests/factories.py`

**Step 1: Write any final failing assertion upgrades**

Add or tighten focused assertions that were intentionally left weak during migration, especially `422` cases that should prove the actual validation rule.

**Step 2: Run lint and targeted tests**

Run: `UV_CACHE_DIR=/tmp/uv-cache uv run ruff check`
Run: `UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests/test_owners_api.py tests/test_campaigns_api.py tests/test_entities_api.py tests/test_relationships_api.py -q`

Expected: PASS

**Step 3: Update docs minimally**

In `README.md`, add a short testing note explaining:
- backend tests use explicit factory fixtures for scenario data
- infrastructure remains in `conftest.py`
- fixed scenario fixtures were intentionally removed in favor of factories

**Step 4: Run full verification**

Run: `UV_CACHE_DIR=/tmp/uv-cache uv run ruff check`
Run: `UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests -q`

Expected: PASS for SQLite-backed tests and explicit Docker setup errors or full PASS for Postgres-backed tests depending on Docker availability in the current shell.

**Step 5: Commit**

```bash
git add README.md backend/tests/conftest.py backend/tests/factories.py backend/tests
git commit -m "test: migrate backend suite to factory fixtures"
```

### Notes

- Prefer plain, explicit factory calls in tests over nested helper stacks.
- Keep factories generic; if a name or field matters to the scenario, pass it in at the test site.
- Use `factory-boy` for object construction, not for hiding whole business scenarios.
- Do not change `patched_jsonb_defaults` in this migration.
