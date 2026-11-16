# Task 9 Hardening: Agent Team Plan

**Applies to:** how the 14 fixes of v1 Task 9 ("Hardening before the pipeline") are split into branches, which run in parallel, and the merge order
**Related code:** `backend/app/services/`, `backend/app/models/`, `backend/alembic/`, `backend/tests/`, `compose.yaml`
**Deferred design triggers:** None. "Centralized asset-delete blockers" stays deferred; fixes #1 and #5 work in that area but add no table that references `source_assets`

**Goal:** Let several agents implement Task 9 at the same time without merge conflicts, a split Alembic history, or two agents designing the same thing differently.

**Source of the fixes:** `docs/plans/rpg-gm-helper-v1.md`, Task 9. The fix numbers (#1–#14) below are that task's row numbers. This document does not restate the problems; read the task first.

**Status of this plan:** Drafted 2026-11-16 from a read-only code analysis. The engineer approved the branch split on 2026-11-16. Three decisions are open (see "Open decisions"); the branches they block are marked.

## Progress

Last updated 2026-11-16.

| Fix | Branch | Status |
|-----|--------|--------|
| #2, #3 | `task9/race-409` | Merged to `main` |
| #6 | `task9/campaign-delete` | Merged to `main` |
| #7 | `task9/migration-gate` | Merged to `main`. Models and migrations matched, so no whitelist was needed |
| #10 | `task9/lazy-collections` | Merged to `main`. No explicit `selectinload` was needed |
| #11 | `task9/uuid7` | Merged to `main` |
| #13 | `task9/compose-bind` | Merged to `main`. The engineer's browser check under WSL is still open |
| #5 | `task9/lane-1-trigger-lock` | Implemented with `FOR KEY SHARE` (D6 decided) and reviewed; waiting for the engineer's merge |
| #1 | `task9/campaign-delete-files` | In progress (D1 decided) |
| #8, #9 | — | Blocked on D3, D2 |
| #12, #4 | — | Wait for #5 on `main` |
| #14 | — | Optional; not started |

The six merged branches were stacked and fast-forwarded in one line, because the engineer merges with `--ff-only`. Later branches are rebased onto `main` before they are handed over.

Follow-ups the integrator still owes:

- Keep Task 9 in `rpg-gm-helper-v1.md` in step as further fixes land; it is updated for the six merged branches.
- Move the PostgreSQL session fixture into `backend/tests/conftest.py`. Four new test files each define their own copy because branch agents may not edit `conftest.py`; `AGENTS.md` keeps test plumbing in `conftest.py`.

---

## Roles

| Role | Count | Does |
|------|-------|------|
| Integrator | 1 | Merges branches in the order below, runs the full suite on `main` after each merge, and makes every edit to `docs/plans/rpg-gm-helper-v1.md` |
| Schema-lane agent | 1 | Owns the four migration branches, one after another |
| Branch agent | 1 per parallel branch | Owns one branch from first failing test to green checks |

## Rules for every agent

1. One branch, one git worktree. Run `uv sync --group dev` in `backend/` of a new worktree. Run `npm install` in `frontend/` only if the branch touches frontend files.
2. Write the failing test first, and read `.agents/skills/py-db-tdd/SKILL.md` before touching `backend/tests/`.
3. Do not edit `docs/plans/rpg-gm-helper-v1.md`. Report what you implemented in your final message; the integrator updates the task rows. Every branch editing its own row in that table would conflict.
4. Do not edit `backend/tests/conftest.py` or `backend/tests/test_migrations.py` unless your branch is listed as an owner of that file below. Put new tests in a new file.
5. Do not add a migration unless your branch is in the schema lane.
6. Race tests go at the service level. The API test client runs handlers inline, so it cannot show a race.
7. PostgreSQL tests are safe to run at the same time in different worktrees: each pytest session starts its own container on a random port. If pytest is killed, remove only the container your own session started. Never remove containers by the shared `rpg-gm-helper-test-postgres-` name prefix; that kills other agents' databases.
8. Do not run the Compose stack in a worktree. It uses fixed host ports, so two stacks collide. Tests do not need it.
9. Stop and report, instead of choosing, when the work needs a decision this document marks as open.
10. Commit on your branch after every step that leaves the tests green. A session can stop at any moment (for example at a usage limit); commits are what the next agent resumes from.
11. Never merge or push. The engineer merges each branch after review. The engineer's local Claude Code settings deny `git merge` and `git push`.

## Running the team

- **Batch size:** at most three or four branches in progress at once, not all of Wave 0. Start a new branch only when one is reviewed and waiting for the engineer's merge. Half-done branches are the costly state to be stopped in.
- **Review cycle:** when a branch agent finishes, the integrator reviews the branch and sends findings back to the same agent. This repeats until the review is clean. Only then is the branch handed to the engineer.
- **Merge gate:** the engineer reads the reviewed branch and merges it. No agent merges.
- **Models:** the integrator and the reviews run on the session's model. All branch agents run on Opus (engineer's decision, 2026-11-16).

## Verification commands

Run in `backend/`:

| Purpose | Command |
|---------|---------|
| Focused tests | `uv run pytest tests/<file>.py -k <name> --no-cov` |
| Full suite | `uv run pytest` |
| Format and lint | `uv run ruff format --check` and `uv run ruff check` |
| One Alembic head | `uv run alembic heads` prints exactly one line |

Run in `frontend/` when frontend files change: `npm test -- --run`, `npm run lint`, `npm run format:check`, `npm run build`.

---

## Branches

| Branch | Fixes | Why these go together | Blocked on |
|--------|-------|-----------------------|------------|
| `task9/migration-gate` | #7, #8 | Same files (`backend/alembic/env.py`, `backend/alembic.ini`, `backend/tests/test_migrations.py`); both must exist before the schema lane | D3 for the #8 half only |
| `task9/race-409` | #2, #3 | Same fix and same test technique, both small. They share no file with each other | — |
| `task9/campaign-delete` | #6, then #1 | Same behavior. The #6 tests are the safety net for #1 | D1 for the #1 half only |
| `task9/lazy-collections` | #10 | Only the `relationship()` loader lines in four model files | — |
| `task9/uuid7` | #11 | One file (`backend/app/models/base.py`) that no other fix touches | — |
| `task9/compose-bind` | #13 | `compose.yaml` only | — |
| `task9/ci` | #14 | New `.github/workflows/` file only. Optional in Task 9 | — |
| Schema lane (four branches, in series) | #5, #12, #4, #9 | Each adds a migration; #4 and #9 edit the same lines of `backend/app/models/relationship.py` | D2 for #9 only |

Groupings that were considered and rejected:

- #2 with #1: both edit `campaign_service.py`, but #2 is small and unblocked while #1 waits on a decision.
- #3 with #4: both are about relationships, but they share no file and #4 must sit in the schema lane.
- One long branch for all four migrations: #9 is blocked on a decision and would hold back the other three.

---

## What runs in parallel

```text
Wave 0 (all start now, in parallel)
  migration-gate      #7 now; #8 after D3
  race-409            #2, #3
  campaign-delete     #6 now; #1 after D1
  lazy-collections    #10
  uuid7               #11
  compose-bind        #13
  ci (optional)       #14
  schema lane step 1  #5

Wave 1 (schema lane, strictly one at a time)
  #12  →  #4  →  #9
  #12 starts after migration-gate and #5 are merged
  #9 starts after D2 and the operator check

Wave 2 (integrator)
  Task 9 status and summary in rpg-gm-helper-v1.md, full suite on main
```

## Merge order

1. `task9/migration-gate` before schema-lane steps #12, #4, and #9.
2. `task9/race-409` before `task9/campaign-delete`.
3. Schema-lane branches in revision-ID order, each cut from `main` only after the previous one is merged.
4. Everything else in any order.

## What cannot run in parallel, and how this plan avoids it

| Pair | Where they collide | How it is avoided |
|------|--------------------|-------------------|
| #5, #12, #4, #9 with each other | Alembic head: two migrations off the same parent create two heads | Serial lane with pre-assigned revision IDs |
| #4 and #9 | `__table_args__` in `backend/app/models/relationship.py`; `test_migrations.py` | Serial lane |
| #7/#8 and the lane | `test_migrations.py`, `env.py` | Gate merges first; #5 keeps its test in its own file |
| #2 and #1 | `campaign_service.py` (different functions, same import block) | `race-409` merges first; `campaign-delete` rebases and uses a new test file |
| #9 and #2 | `backend/tests/test_campaigns_api.py` | #9 is last and rebases |
| #5 and #6 | Both want a PostgreSQL session fixture | Both use `upgraded_postgres_test_engine` from `pg_test_support.py` directly; neither edits `conftest.py` |
| Every branch | Task 9 rows in `rpg-gm-helper-v1.md` | Only the integrator edits them |

No collision was found for #11, #13, or #14 with anything, for #3 with #4, or for #5 with #1. #10 and #9 both edit `models/entity.py` and `models/extraction.py`, but in different regions; #10 merges in Wave 0, so #9 simply starts from it.

---

## Schema lane

The current Alembic head is `20260502_0003`. Revision IDs are assigned here, in advance, so tests and briefs can name them. The date part is the assignment date and does not change if the file is written later.

| Order | Fix | Revision ID and file name | `down_revision` |
|-------|-----|---------------------------|-----------------|
| 1 | #5 | `20261116_0004_lock_source_asset_in_reference_trigger.py` | `20260502_0003` |
| 2 | #12 | `20261116_0005_drop_duplicate_campaign_id_indexes.py` | `20261116_0004` |
| 3 | #4 | `20261116_0006_unique_directed_relationships.py` | `20261116_0005` |
| 4 | #9 | `20261116_0007_status_and_entity_type_checks.py` | `20261116_0006` |

Lane rules:

- Always pass `--rev-id`, even after #8 lands.
- Every migration needs a working `downgrade()`. Every PostgreSQL test upgrades to `head` and then downgrades to `base`, so a broken downgrade fails unrelated tests.
- In a data-preservation test, upgrade to the migration's own revision, not `head`, and read the predecessor from the script's `down_revision` instead of hard-coding it.
- Never merge a placeholder migration. The Compose backend applies migrations at startup, so a placeholder would be applied to the engineer's real database.

Why the lane is serial and not parallel with pre-assigned IDs: a branch whose `down_revision` is not yet on its base cannot run `upgrade head`, so its agent cannot run any PostgreSQL test. The reasoning document has the full comparison.

---

## Branch briefs

### `task9/migration-gate` — #7 and #8

**Owns:** `backend/alembic/env.py`, `backend/alembic.ini`, `backend/tests/test_migrations.py`.

**#7, start now:**
1. First run `uv run alembic check` against an upgraded test database and record the real output. The analysis expects no differences, but that was not run.
2. Add a PostgreSQL test in `test_migrations.py`: upgrade to `head`, assert `compare_metadata` against `Base.metadata` returns an empty list. Show that it can fail by temporarily adding a column to a model.
3. The `'{}'::jsonb` whitelist that Task 9 expects applies only if `compare_server_default` is turned on. `env.py` does not set it. Do not turn it on without reporting the resulting differences.
4. Add a static test that needs no database: every file in `backend/alembic/versions/` is named `YYYYMMDD_NNNN_slug.py`, each `revision` matches its file name, sequence numbers are consecutive, and there is exactly one head. The serial lane relies on this guard.

**Limits to state in the final message:** Alembic autogenerate does not compare `CHECK` constraints, triggers, or functions. The #7 test therefore cannot verify #9 or #5. If the engineer wants #9 gated, add an assertion that the `CHECK` constraint names from `inspector.get_check_constraints()` equal the `CheckConstraint` names in `Base.metadata`.

**#8, after D3:** The fix as written in Task 9 is incomplete. A `process_revision_directives` callback in `env.py` runs for plain `alembic revision` only if `alembic.ini` also sets `revision_environment = true`, and then plain `alembic revision` needs `DATABASE_URL` and a reachable database. If the callback is approved: the test must write the generated revision to a temporary versions path, and the callback must tolerate being called from the #7 check.

**Verify:** `uv run pytest tests/test_migrations.py --no-cov`, `uv run alembic heads`.

### `task9/race-409` — #2 and #3

**Touches:** `create_campaign` and `update_campaign` in `backend/app/services/campaign_service.py`; `create_relationship_type` in `backend/app/services/relationship_type_service.py`; new service-test files.

1. Follow the existing pattern in `backend/tests/test_relationship_service.py`: patch `commit` to raise `IntegrityError`, assert `ConflictError` and exactly one rollback. Cover campaign create, campaign update, and relationship-type create.
2. Copy the catch, roll back, raise shape from `backend/app/services/session_service.py`. The routes already map `ConflictError` to 409.
3. For #3, do not report "already exists" for every `IntegrityError`. The same insert can also violate the direction-labels `CHECK` on `relationship_type_definitions`. Tell the two apart.

**Verify:** the new files plus `tests/test_campaigns_api.py tests/test_campaign_lookup.py tests/test_relationship_types_api.py`.

### `task9/campaign-delete` — #6, then #1

**Touches:** `delete_campaign` in `campaign_service.py`; a new helper in `backend/app/services/asset_service.py`; the delete route in `backend/app/api/routes/campaigns.py` (it must receive the storage dependency); a new PostgreSQL test file. Rebase onto `main` after `race-409` merges.

**#6, start now:** Add PostgreSQL tests that delete a campaign holding (a) a session-linked asset, (b) a relationship citing an asset, (c) an entity citing an asset, and assert all rows are gone. These should pass today; they describe current behavior and protect #1 and #10. If one fails, stop and report.

**#1, after D1:**
1. Test with the recording storage double from `backend/tests/test_asset_service.py`: upload through the service, delete the campaign, assert the files are gone.
2. Test with the failing storage double: assert the failure behavior chosen in D1.
3. `delete_asset` refuses when an entity, relationship, or extraction job cites the asset. A campaign delete removes those too, so it cannot call `delete_asset` unchanged.
4. Rows migrated from the old schema have `storage_status='missing'` and no file. Treat a missing file as already deleted.

**Verify:** the new file plus `tests/test_campaigns_api.py tests/test_asset_service.py tests/test_assets_api.py`. Run the frontend tests only if an error message shown in the UI changes.

### `task9/lazy-collections` — #10

**Touches:** loader strategy only, in `backend/app/models/campaign.py` (seven collections), `owner.py` (`campaigns`), `entity.py` (`outgoing_relationships`, `incoming_relationships`), and `extraction.py` (`ExtractionJob.candidates`). Task 9 names the first three; the fourth has the same problem and is included here.

1. Add statement-count tests: `get_campaign`, the default-owner lookup, and `get_entity` each issue one `SELECT`. A counting helper already exists in `tests/test_session_service.py` and `tests/test_asset_service.py`.
2. Change the collections to lazy loading.
3. The analysis found no code or schema that reads these collections, so the number of places that need an explicit `selectinload` is probably zero. Confirm with the full suite; do not add loader options that nothing needs.
4. One behavior changes: entity delete now relies on the database `ON DELETE CASCADE` instead of the ORM deleting loaded relationships. `tests/test_entities_api.py` covers it on SQLite.

**Verify:** the new tests, then the full backend suite, because models are shared.

### `task9/uuid7` — #11

**Touches:** `backend/app/models/base.py`, one new test.

1. Test: persist a row and assert `id.version == 7`.
2. Change the `UUIDPrimaryKeyMixin` default to `uuid.uuid7` (available in the project's Python 3.14). No migration.
3. Leave the `uuid4` calls that build storage keys in `asset_service.py` and `asset_storage.py`.

**Verify:** the new test plus `tests/test_models.py`.

### `task9/compose-bind` — #13

**Touches:** `compose.yaml`; `README.md` only if the wording about ports must change.

1. Bind the three published ports to `127.0.0.1`.
2. Keep PostgreSQL published: the documented debugging flow in `README.md` runs the API on the host against Compose PostgreSQL.
3. Optional test: parse `compose.yaml` and assert every published port starts with `127.0.0.1:`.

**Verify:** `docker compose config`. The engineer then checks by hand that the app still opens from the Windows browser under WSL; an agent cannot verify that.

### `task9/ci` — #14 (optional)

**Touches:** new `.github/workflows/` file.

Run the commands listed in `README.md` under verification: the backend tests, the two `ruff` checks, and the four frontend commands. Backend tests need Docker on the runner. If this merges early, it checks every later branch.

### Schema lane step 1 — #5

**Touches:** new migration `20261116_0004`; a new concurrency test file; a wait-for-lock helper in `backend/tests/pg_test_support.py`.

1. Write the test first and show it fails today. Shape (inferred, not yet run):
   1. Session B opens a transaction and selects the asset `FOR UPDATE`, without committing.
   2. A thread in session A inserts a row that cites the asset.
   3. Session B sets `lifecycle_status='deleting'` and commits.
   4. Today session A's commit succeeds; that is the bug. Assert it raises.
2. The test engine uses `NullPool`, so each `connect()` is a separate database connection. The test needs a helper that polls `pg_stat_activity` until session A is blocked on a lock; put it in `pg_test_support.py`.
3. Entity create does not accept `source_asset_id`, so insert through the ORM or the relationship service.
4. The migration replaces the function `enforce_active_source_asset_reference` with `FOR SHARE` on its `SELECT`. One function backs three triggers. `downgrade()` restores the old body.

**Verify:** the new test file plus `tests/test_migrations.py tests/test_relationship_service.py`.

### Schema lane step 2 — #12

**Touches:** `backend/app/models/session.py` and `relationship_type_definition.py` (remove the two `Index(...)` entries and the then-unused `Index` imports); new migration `20261116_0005`; `test_migrations.py`.

Test: after upgrade to `head`, `inspector.get_indexes` for `sessions` and `relationship_type_definitions` does not list the two names. The #7 test fails until the models change too.

**Verify:** `tests/test_migrations.py tests/test_models.py`.

### Schema lane step 3 — #4

**Touches:** `__table_args__` in `backend/app/models/relationship.py`; `_commit_relationship_write` in `backend/app/services/relationship_service.py`; new migration `20261116_0006`; `test_migrations.py`; `tests/test_relationships_api.py`.

1. Three tests: a duplicate inserted through the ORM on PostgreSQL raises `IntegrityError`; upgrading from `20261116_0005` with duplicate rows fails with a message that lists them and deletes nothing; a directed duplicate returns 409 through the API.
2. The unique constraint covers campaign, type, source, and target. All four columns are `NOT NULL`.
3. `_commit_relationship_write` currently re-raises every `IntegrityError` except the asset-delete trigger message. Map the new unique violation to `ConflictError`, or the race still returns 500.
4. Keep `_validate_duplicates` for symmetric types. Symmetry of built-in types is defined in code, so the database cannot enforce the inverse pair. That race stays open; say so in the final message.
5. The model-level constraint also applies to the SQLite tests. Check existing `relationship_factory` calls for accidental duplicates.

**Verify:** `tests/test_migrations.py tests/test_relationships_api.py tests/test_relationship_service.py tests/test_relationship_types_api.py`.

### Schema lane step 4 — #9

**Blocked on D2 and on the operator check below.** Do not start before both.

**Touches:** `__table_args__` in `models/relationship.py`, `source_asset.py`, `asset_parse_result.py`, `extraction.py`, and possibly `entity.py`; new migration `20261116_0007`; `test_migrations.py`; depending on D2, the compatibility service, route, tests, and frontend panel.

Allowed values come from `backend/app/enums.py`:

| Column | Enum |
|--------|------|
| `entities.type` | `EntityType` |
| `entity_relationships.lifecycle_status` | `RelationshipLifecycleStatus` |
| `entity_relationships.visibility_status` | `RelationshipVisibilityStatus` |
| `entity_relationships.certainty_status` | `RelationshipCertaintyStatus` |
| `source_assets.lifecycle_status` | `SourceAssetLifecycleStatus` |
| `source_assets.storage_status` | `SourceAssetStorageStatus` |
| `source_assets.parse_status`, `asset_parse_results.parse_status` | `ParseStatus` |
| `extraction_jobs.status` | `ExtractionJobStatus` |
| `extraction_candidates.status` | `ExtractionCandidateStatus` |

Tests: per column, a bad value raises on PostgreSQL; upgrading from `20261116_0006` with a bad row fails with a clear message.

**Operator check before merge:** the engineer runs the entity-type compatibility report against the real local database and migrates any legacy types. If legacy rows remain when the Compose backend restarts, the migration fails, the backend does not start, and the API that would fix the rows is unreachable.

**Verify:** full backend suite; frontend suite if the compatibility panel changes.

---

## Open decisions

The engineer decides these. Agents do not.

| ID | Blocks | Question | Recommendation |
|----|--------|----------|----------------|
| D1 | #1 | Decided 2026-11-16: mark the campaign's assets `deleting` and commit, delete the files, then delete the campaign row. If a file removal fails, the campaign stays and issuing the delete again completes it. A file that is already missing counts as removed. Deleting the row first and sweeping the storage folder later was rejected: no worker exists to sweep, and the database would hold no record of files still to remove. A campaign-level deleting state with a background worker is deferred; see "Background campaign deletion" in `docs/deferred_design_options.md` | — |
| D2 | #9 | Model-declared `CHECK` constraints are also enforced in the SQLite tests, and the compatibility tests need legacy entity types to exist. A `CHECK` on `entities.type` also makes the compatibility report permanently empty, while v1 Task 13 still expects that feature | Leave `entities.type` out of #9 for now and constrain only the status columns. Constrain `entities.type` when the compatibility feature is retired |
| D3 | #8 | The auto-ID callback needs `revision_environment = true`, so plain `alembic revision` would need a running database | Rely on the static naming test in the #7 brief and skip the callback. The naming rule is then enforced by a test, not by generation |

| D6 | #5 | Decided 2026-11-16: `FOR KEY SHARE`. Both locks close the race; with `FOR SHARE`, two transactions that each cite an asset and then update its row deadlock | — |

Also undecided for #9: whether `source_assets.truth_status`, `extraction_candidates.candidate_type`, `extraction_jobs.extractor_kind`, `asset_parse_results.parser_kind`, and `relationship_type_definitions.family` get constraints, and whether Task 10 will soon add job statuses that a new `CHECK` would have to be migrated for.

## Not verified

- `compare_metadata` was not run. "No differences today" is a reading of the migrations against the models.
- The #5 test shape and the PostgreSQL lock behavior it depends on were reasoned, not executed.
- No test was run during the analysis.

## Test harness problem found during this work

Every pytest session leaves one anonymous Docker volume behind. `remove_postgres_test_container` in `backend/tests/pg_test_support.py` runs `docker rm --force` without `--volumes`. Measured on 2026-11-16: one run of the suite raised the count of unattached volumes by one. Proposed fix, not yet made: add `--volumes` to that command.
