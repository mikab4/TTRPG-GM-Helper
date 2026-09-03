# Dockerized Postgres Test Harness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Postgres-backed backend tests run automatically with `uv run pytest` by provisioning a disposable Docker Postgres instance for the pytest session.

**Architecture:** Keep the existing Postgres integration tests because they validate real Alembic migrations and PostgreSQL constraints. Move all container lifecycle, readiness checks, and connection URL injection into test support code so individual tests remain focused on business rules and database behavior. Prefer one shared disposable container per pytest session over per-test containers for lower overhead and easier GitHub Actions parity.

**Tech Stack:** Pytest, Docker CLI, PostgreSQL container image, SQLAlchemy, Alembic, FastAPI backend tests

---

### Task 1: Define the Docker harness contract in tests

**Files:**
- Modify: `backend/tests/test_pg_test_support.py`
- Modify: `backend/tests/pg_test_support.py`

**Step 1: Write failing tests for the new harness contract**

Add tests that verify:
- `load_test_settings()` no longer requires `backend/.env.test` to exist when the harness provides a runtime database URL.
- a helper such as `ensure_postgres_test_container()` or equivalent starts from a fixed image/container contract and returns the runtime database URL.
- Docker-not-installed and Docker-daemon-unavailable paths fail with explicit, actionable errors instead of silent skips.

Use straight-line tests with one concept each. Prefer monkeypatched subprocess calls over mocking whole helper stacks.

**Step 2: Run the focused support tests to verify they fail**

Run: `UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests/test_pg_test_support.py -q`

Expected: FAIL because the current support module still depends on static env files / skips.

**Step 3: Implement the minimal support API**

In `backend/tests/pg_test_support.py`:
- add constants for Docker image, container name prefix, container port, database name, username, and password
- add a small runtime config object or explicit helper return values for `database_url`
- add helpers for:
  - checking Docker CLI availability
  - starting a disposable Postgres container
  - waiting for readiness
  - removing the container on teardown
- keep the public interface small and boring

Avoid introducing a general-purpose test orchestration framework.

**Step 4: Re-run the focused support tests**

Run: `UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests/test_pg_test_support.py -q`

Expected: PASS

**Step 5: Commit**

```bash
git add backend/tests/test_pg_test_support.py backend/tests/pg_test_support.py
git commit -m "test: add docker postgres harness support"
```

### Task 2: Attach the Docker harness to the Postgres-backed test session

**Files:**
- Modify: `backend/tests/conftest.py`
- Modify: `backend/tests/pg_test_support.py`
- Modify: `backend/tests/test_models.py`
- Modify: `backend/tests/test_migrations.py`

**Step 1: Write or update a failing integration-oriented test**

Add a focused test around the session bootstrap contract, for example:
- a session-scoped fixture creates one runtime Postgres URL
- Postgres-backed tests consume that runtime URL instead of reading `.env.test`

Keep the test readable; do not test Docker internals from `test_models.py` or `test_migrations.py`.

**Step 2: Run the focused bootstrap tests to verify they fail**

Run: `UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests/test_pg_test_support.py tests/test_models.py tests/test_migrations.py -q`

Expected: FAIL or skip for the old path because the session fixture has not been wired yet.

**Step 3: Implement the session-scoped fixture**

In `backend/tests/conftest.py`:
- add a session-scoped fixture that provisions the Docker Postgres container once
- expose a runtime database URL fixture for Postgres-backed tests
- ensure teardown always removes the container, even after failures

In `backend/tests/test_models.py` and `backend/tests/test_migrations.py`:
- replace direct env-file lookup with the runtime fixture
- keep each test body focused on schema/constraint behavior, not setup mechanics

**Step 4: Run the focused Postgres-backed modules**

Run: `UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests/test_models.py tests/test_migrations.py -q`

Expected: PASS when Docker is available and the harness works.

**Step 5: Commit**

```bash
git add backend/tests/conftest.py backend/tests/pg_test_support.py backend/tests/test_models.py backend/tests/test_migrations.py
git commit -m "test: run postgres integration tests in docker"
```

### Task 3: Remove obsolete env-file-based behavior and document the new path

**Files:**
- Modify: `backend/tests/test_config.py`
- Modify: `README.md`
- Optional modify: `backend/.env.test.example`

**Step 1: Write failing documentation/contract tests if needed**

Add or update tests to reflect the intended behavior:
- Postgres test support should not require a developer-created `backend/.env.test` for the default path
- settings tests should still cover explicit env-file loading where that behavior remains relevant

Do not over-test README text.

**Step 2: Run the focused contract tests**

Run: `UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests/test_config.py tests/test_pg_test_support.py -q`

Expected: any remaining mismatches around `.env.test` assumptions fail here.

**Step 3: Update docs and simplify obsolete config assumptions**

In `README.md`:
- explain that `uv run pytest` provisions Postgres automatically through Docker for Postgres-backed tests
- document the Docker prerequisite explicitly
- remove instructions that imply a manual `backend/.env.test` creation step for ordinary test runs

If `backend/.env.test.example` is no longer needed for automated tests:
- either remove its use from test support entirely, or keep it only as an override/example with clear wording

**Step 4: Run the focused tests again**

Run: `UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests/test_config.py tests/test_pg_test_support.py -q`

Expected: PASS

**Step 5: Commit**

```bash
git add README.md backend/tests/test_config.py backend/tests/test_pg_test_support.py backend/.env.test.example
git commit -m "docs: describe automatic postgres test setup"
```

### Task 4: Verify the full backend suite and CI readiness

**Files:**
- Modify if needed: `.github/workflows/...` only if a workflow already exists and must align
- Otherwise no file changes required

**Step 1: Run lint**

Run: `UV_CACHE_DIR=/tmp/uv-cache uv run ruff check`

Expected: PASS

**Step 2: Run the full backend suite**

Run: `UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests -q`

Expected: PASS with no Postgres-related skips when Docker is available

**Step 3: Sanity-check CI portability**

Verify that the harness assumptions are compatible with GitHub Actions:
- Docker CLI invocation uses non-interactive commands
- container naming avoids collisions
- teardown happens even on failed tests
- runtime URL is injected from the harness, not from local-only files

If a CI workflow already exists and conflicts with this approach, update it minimally.

**Step 4: Commit**

```bash
git add .
git commit -m "test: automate postgres integration test environment"
```

### Notes

- Keep test names requirement-focused and visually AAA where useful.
- Do not move Docker orchestration into the model or migration tests themselves.
- Prefer explicit helper names like `start_postgres_test_container`, `wait_for_postgres_ready`, and `build_runtime_database_url`.
- If Docker is installed but unusable, fail clearly rather than silently skipping; the user explicitly wants no manual test setup, so hidden skips would mask broken automation.
