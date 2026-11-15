# Repository Issues

Code fixes found while building agent skills. Each entry is a problem that code can prevent better than a skill instruction can, or a design point to reconsider later. Fix these after the skill work in `docs/plans/2026-11-15-cross-agent-tooling.md` is done.

## Alembic Revision IDs Are Not Enforced

**Where:** `backend/alembic/env.py`

**Problem:** Existing migrations use `YYYYMMDD_NNNN` revision IDs and `YYYYMMDD_NNNN_slug.py` file names (for example `20260502_0003_sessions_source_assets_reshape.py`). Nothing enforces this. Plain `uv run alembic revision -m "..."` creates a random hash ID, so any agent or human who forgets `--rev-id` breaks the pattern.

**Why fix it in code:** A skill instruction only helps when the skill is loaded. A code fix works every time, for every agent and human.

**Proposed fix:** Add a `process_revision_directives` callback in `env.py`. When no `--rev-id` is given, it sets the ID to today's date plus the next sequence number after the current head. Add a test that generates a revision and checks the ID format.

**Until fixed:** Pass `--rev-id YYYYMMDD_NNNN` by hand.

## No Check That Models Match Migrations

**Where:** `backend/tests/test_migrations.py`

**Problem:** Nothing fails when a SQLAlchemy model in `backend/app/models/` changes without a matching migration. Schema tests only check the columns they list, and the SQLite tests build tables from the models, so a missing migration can pass the whole suite and fail only against a real database.

**Why fix it in code:** A forgotten migration is easy to miss in review and costly to debug later. A test catches it on every run.

**Proposed fix:** Add a PostgreSQL test that upgrades to `head` and asserts `alembic.autogenerate.compare_metadata(...)` against `Base.metadata` returns no differences (the same check `uv run alembic check` runs, with `compare_type=True` already set in `env.py`). Expect a few known differences to whitelist, such as the `'{}'::jsonb` server defaults.
