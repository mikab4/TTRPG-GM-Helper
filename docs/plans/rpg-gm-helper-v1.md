# RPG GM Helper V1 Implementation Plan

**Applies to:** overall product scope, architecture, delivery sequence, and milestone acceptance
**Related code:** `backend/`, `frontend/`, `docs/mockups/workspace-v1.html`, `compose.yaml`
**Deferred design triggers:** World-owned reusable assets: the tenant level (campaign, owner, or world) must be decided before Task 13 adds membership and before Task 14 adds embedding tables

**Goal:** Build an RPG GM helper that stores campaign data, imports source notes, turns them into reviewable candidate entities and relationships with rules and an LLM, and answers questions across campaign information. It runs locally for one GM today and is being built toward several users, with players who see only part of the campaign data.

**Architecture:** Use a modular monolith with a Python FastAPI backend, PostgreSQL as the only datastore and source of truth, and a separate TypeScript React frontend in the same repository. Parsing and extraction run as backend modules started by a PostgreSQL job row and a background task. Parsed sections, jobs, candidates, and embeddings (pgvector) all live in PostgreSQL so access rules apply to every read. Original files stay behind the `AssetStorage` boundary on local disk until the app is hosted.

**Tech Stack:** FastAPI, PostgreSQL, pgvector, SQLAlchemy, Alembic, pytest, React, TypeScript, Vite, Docker Compose, Google Drive and Sheets APIs, an LLM provider (not chosen yet)

**Direction change (2026-11-16):** The AI-first PostgreSQL-only pipeline proposal (written 2026-11-11) is adopted. It replaces the MinIO, Redis Streams, MongoDB, and separate-worker pipeline that Tasks 9–12 used to describe. The old detailed plan is archived as `docs/plans/archive/2026-08-08-cloud-ready-asset-intelligence-pipeline.md`. Reasons are in the sibling reasoning document.

---

## Delivery Target

Deliver a demoable milestone with these user-visible capabilities:
- Create and manage campaigns
- Create and edit entities, relationships, and sessions
- Upload source assets and import notes from Google Docs and Google Sheets
- Run extraction (rules and LLM) to generate candidate entities and relationships
- Review, edit, and accept or reject candidates before anything becomes canonical
- Sign in as a GM or a player; a player sees only what has been made visible to them
- Search and ask questions across entities, sessions, and parsed source text, with sources

## Core Product Decisions

- The app runs single-user and locally today. Multi-user access with GM and player roles is in scope (Task 13). Until Task 13 lands, no route may be exposed beyond the local machine.
- The backend remains in Python so development stays fast.
- The frontend is TypeScript React so the project includes one deliberate new learning area.
- The frontend stays a separate app with routing, forms, tables, API calls, and presentation only; domain rules remain in backend services.
- `docs/mockups/workspace-v1.html` is authoritative for frontend visual and interaction design. Missing designs and any deviations require engineer approval before implementation and must be recorded in `docs/mockups/design-deviations.md`.
- PostgreSQL is the only datastore. MongoDB is dropped. Redis, S3-compatible storage, and a separate worker are deferred until hosting; see "Hosted processing infrastructure" in `docs/deferred_design_options.md`.
- Original assets use a backend-owned storage boundary (`AssetStorage`). The implementation is local filesystem storage. No code outside the storage adapter may rely on local paths, so an S3 backend can be added later without changing callers.
- Parsing is an explicit workflow started by a job. Ordinary asset metadata reads must remain cheap and must not trigger hidden processing.
- Notes come from Google Docs and Google Sheets first. Every import saves a snapshot as a source asset, so provenance points to a fixed version. English notes come first; Hebrew and mixed-language notes come later, so code must not use English-only shortcuts.
- Extractors (rules or LLM) create candidates only. A human approves before anything becomes an entity or relationship. Provenance records source, parser version, extractor, model, and prompt version.
- Access rules are enforced in backend services, with PostgreSQL Row-Level Security as a second guard. Retrieval filters by visibility before an LLM sees any text. A prompt is never a security boundary.
- Search uses PostgreSQL full-text search and pgvector behind one search service.
- The AI work is first built as a standalone Python toolkit during the 30 Hours program and then plugged into this app. The toolkit uses this app's entity and relationship types as its output schema.
- External platform sync, OCR, model training, automatic canonical writes by an LLM, and independent CRUD services stay out of scope.

## Open Decisions

| Decision | Options | Needed by |
|----------|---------|-----------|
| Toolkit location | New repository, or a folder in this one | Before toolkit work starts |
| Which notes may be sent to an LLM provider | — | Before the first Google import |
| LLM provider and model | Not chosen | Task 12 |
| Order of Task 12 and Task 13 | LLM first (current order), or users and visibility first so AI work is permission-aware from the start | Before Task 12 starts |
| Tenant level | Campaign (current), owner, or world shared by campaigns | Before Task 13 |
| Auth provider | Not chosen; managed, not hand-built | Task 13 |
| Per-player "revealed" state | Join table design | Task 13 |
| Embedding model | Must be multilingual | Task 14 |

## Public Interfaces

Implemented API groups are registered under `backend/app/api/routes/` for owners, campaigns, entities, relationships, relationship types/families, sessions, assets, compatibility migration, and health.

Remaining API groups:
- asset import (Google Docs and Sheets) and processing
- extraction jobs and candidate review
- users, membership, and visibility
- search and question answering

API rules:
- Every resource that belongs to a campaign must include `campaign_id`.
- Backend code must not assume one implicit global campaign.
- Extracted entities and relationships must preserve provenance.
- Extraction candidates must be editable before approval.
- From Task 13, every campaign route checks the caller's role in that campaign through one shared dependency; identity never comes from a request parameter or body.
- The frontend should consume backend contracts through a plain typed API client rather than duplicating workflow or persistence rules in React components.

## Data Model

Implemented PostgreSQL records:
- `Owner`
- `Campaign`
- `Entity`
- `Relationship` (mapped to `entity_relationships`)
- `RelationshipTypeDefinition`
- `Session`
- `SourceAsset`
- `AssetParseResult`
- `ExtractionJob`
- `ExtractionCandidate`

Planned PostgreSQL records:
- `User` (replaces `Owner`) and `campaign_members` (Task 13)
- visibility and per-player reveal records (Task 13)
- text chunks with pgvector embeddings (Task 14)

`ProcessingJob` and `OutboxEvent` are no longer planned. They existed to coordinate PostgreSQL with Redis.

Schema defaults:
- Use one generic `Entity` table in v1.
- `Entity` has campaign ownership, constrained `type`, `name`, optional `summary`, `metadata` JSONB, optional source-asset provenance, and timestamps.
- `Relationship` stores campaign-scoped source and target entities, relationship type, lifecycle/visibility/certainty statuses, optional notes, optional confidence, optional source-asset provenance, and timestamps.
- `RelationshipTypeDefinition` stores campaign-scoped relationship keys, labels, families, direction/symmetry rules, and allowed source/target entity types.
- Deleting an entity also deletes its incoming and outgoing relationships. The ORM configuration and database foreign keys agree on that cascade behavior.
- `Session` represents an actual play session and is distinct from uploaded source artifacts.
- `SourceAsset` stores campaign ownership, an optional session link and title, truth/media metadata, required original filename, byte size, checksum, storage key, lifecycle/storage/parse state, deletion-recovery fields, metadata JSONB, and timestamps.
- `AssetParseResult` is the store for parsed sections (`inline_raw_text`, `inline_structured_content`), versioned by parser kind, parser version, and source checksum. Nothing writes to it yet; Task 10 starts.
- `ExtractionJob` and `ExtractionCandidate` tables exist, but nothing writes to them yet. Task 11 adds the missing provenance fields and the services.
- `Owner` is the seam that becomes `User` in Task 13.

The SQLAlchemy models in `backend/app/models/` and migrations in `backend/alembic/versions/` are authoritative for implemented fields and constraints.

## Implementation Tasks

Sequence the work as vertical slices after the shared foundation. Each major feature should be visible and testable end-to-end before moving to the next slice.

### Task 1: Repository scaffolding and project layout

**Status: Complete**

**Files:**
- Created: `backend/`
- Created: `frontend/`
- Created: `README.md`
- Created: `backend/pyproject.toml`
- Created: `frontend/package.json`

**Steps:**
1. Create the backend app directory and dependency manifest.
2. Create the frontend app directory with Vite React TypeScript scaffolding.
3. Add a root README with local setup instructions.
4. Add environment example files for backend and frontend.

### Task 2: Backend application skeleton

**Status: Complete**

**Files:**
- Created: `backend/app/main.py`
- Created: `backend/app/config.py`
- Created: `backend/app/db.py`
- Created: `backend/app/api/`
- Created: `backend/tests/`

**Steps:**
1. Create a FastAPI app entrypoint and configuration loading.
2. Add PostgreSQL connection setup and session management.
3. Add a health endpoint and API router registration.
4. Add test configuration and startup coverage.

### Task 3: Database schema and migrations

**Status: Complete**

**Files:**
- Created: `backend/alembic.ini`
- Created: `backend/alembic/`
- Created: `backend/app/models/`
- Created: `backend/tests/test_models.py`
- Created: `backend/tests/test_migrations.py`

**Steps:**
1. Define the implemented PostgreSQL records listed in the Data Model section, including relationship-type definitions and extraction schema groundwork.
2. Add Alembic migrations for the initial schema, relationship semantics, and the compatible sessions/source-assets reshape.
3. Defer PostgreSQL full-text search columns and indexes until the search task.
4. Add persistence, constraint, and migration tests for the core records.

### Task 4: Frontend scaffolding and API client

**Status: Complete**

**Files:**
- Created: `frontend/src/main.tsx`
- Created: `frontend/src/App.tsx`
- Created: `frontend/src/app/`
- Created: `frontend/src/api/`
- Created: `frontend/src/types/`

**Steps:**
1. Scaffold the Vite React TypeScript app.
2. Add a plain typed API client layer matching backend request and response contracts.
3. Add routing and the campaign-oriented application shell while keeping domain behavior out of React-specific abstractions.
4. Add environment-based API base URL configuration.

### Task 5: Campaign and entity CRUD backend

**Status: Complete**

**Files:**
- Created: `backend/app/api/routes/campaigns.py`
- Created: `backend/app/api/routes/entities.py`
- Created: `backend/app/schemas/campaigns.py`
- Created: `backend/app/schemas/entities.py`
- Created: `backend/app/services/campaign_service.py`
- Created: `backend/app/services/entity_service.py`
- Created: `backend/tests/test_campaigns_api.py`
- Created: `backend/tests/test_entities_api.py`

**Steps:**
1. Implement campaign CRUD endpoints.
2. Implement entity CRUD endpoints with campaign and entity-type filtering.
3. Reject entities outside known campaigns and constrain entity types.
4. Add API tests for create, read, update, list, delete, and validation flows.

### Task 6: Campaign and entity CRUD frontend

**Status: Complete**

**Files:**
- Created: campaign and entity route components under `frontend/src/routes/`
- Created: campaign and entity components under `frontend/src/components/`
- Created: `frontend/src/api/campaigns.ts`
- Created: `frontend/src/api/entities.ts`
- Created: `frontend/src/types/campaigns.ts`
- Created: `frontend/src/types/entities.ts`

**Steps:**
1. Build campaign registry, workspace, detail, create, edit, and delete flows.
2. Build entity list, quick-look, detail, create, edit, and delete flows.
3. Connect the screens to the typed API client.
4. Handle loading, success, empty, and API error states clearly.

### Task 7: Relationships backend and frontend

**Status: Complete**

**Files:**
- Created: `backend/app/api/routes/relationships.py`
- Created: `backend/app/api/routes/relationship_types.py`
- Created: relationship schemas/services/models under their corresponding `backend/app/` directories
- Created: relationship API and service tests under `backend/tests/`
- Created: relationship routes/components under `frontend/src/routes/` and `frontend/src/components/`
- Created: relationship clients/types under `frontend/src/api/` and `frontend/src/types/`

**Steps:**
1. Implement relationship CRUD with campaign ownership validation.
2. Add lifecycle, visibility, and certainty semantics.
3. Add persisted campaign-scoped relationship definitions with direction, symmetry, family, and allowed entity-type rules.
4. Build relationship list/create/edit and relationship-type management flows.
5. Cover cross-campaign validation, semantics, custom types, deletion, and presentation behavior.

### Task 8: Sessions and source assets backend and frontend

**Status: Complete**

**Files:**
- Created: `backend/app/api/routes/sessions.py`
- Created: `backend/app/api/routes/assets.py`
- Created: `backend/app/schemas/sessions.py`
- Created: `backend/app/schemas/assets.py`
- Created: `backend/app/services/session_service.py`
- Created: `backend/app/services/asset_service.py`
- Created: `backend/app/services/asset_storage.py`
- Created: `backend/app/maintenance/retry_asset_deletions.py`
- Created: `backend/tests/test_sessions_api.py`
- Created: `backend/tests/test_assets_api.py`
- Created: campaign-workspace session and asset routes under `frontend/src/routes/`

**Steps:**
1. Implement campaign-scoped CRUD for sessions.
2. Implement source-asset upload and CRUD through a backend-owned storage abstraction.
3. Keep parsing backend-owned and explicit; ordinary asset metadata reads remain cheap and do not trigger processing.
4. Land asset lifecycle/storage/parse metadata and the `AssetParseResult` table. Nothing writes parse results yet; Task 10 uses the table for parsed sections.
5. Apply an in-place compatibility migration from `session_notes + source_documents` to `sessions + source_assets`, preserving provenance.
6. Add tests for session CRUD, uploads, links, deletion compensation/retry, cross-campaign protection, migration safety, and provenance.
7. Keep the upload contract single-purpose; combined session/upload UI flows orchestrate separate API calls.
8. Build campaign-scoped session and asset list/detail/edit flows rather than separate top-level picker pages.
9. Preserve campaign context and unsaved-change protection in the workspace shell.

The completed detailed plans for this task and its workspace UI are retained under `docs/plans/archive/`.

### Task 9: Hardening before the pipeline

**Status: Complete**

Fix the problems found in the 2026-11-16 code and security review before new tables and jobs are built on top of them. Each fix includes a test that fails without it. Sources: the review, the former `docs/issues.md`, and the database suggestions the review checked against the code.

**Correctness fixes:**

| # | Problem | Where | Fix |
|---|---------|-------|-----|
| 1 | Deleting a campaign removes asset rows by cascade but leaves the uploaded files on disk | `delete_campaign`, `backend/app/services/campaign_service.py` | Remove the campaign's files through the asset-delete flow or a storage-prefix delete before the campaign row goes; a failed file removal must stay recoverable by the retry job |
| 2 | A duplicate campaign name under a race returns 500 instead of 409 | `create_campaign`, `update_campaign` | Catch `IntegrityError`, roll back, raise `ConflictError`, as `session_service` already does |
| 3 | Same check-then-insert race for custom relationship types | `create_relationship_type`, `backend/app/services/relationship_type_service.py` | Same fix as #2 |
| 4 | Duplicate relationships are prevented only by a query; no constraint backs it | `_validate_duplicates`, `backend/app/services/relationship_service.py` | Add a unique constraint on campaign, type, source, and target for the directed case; keep the service check for symmetric types. The migration must report existing duplicates instead of deleting them |
| 5 | The asset-delete trigger reads `lifecycle_status` without a row lock, so a new reference can be accepted while a delete is in progress | `enforce_active_source_asset_reference`, migration `20260502_0003` | Write a concurrency test that shows the race first; then add a row lock to the trigger's `SELECT` in a new migration. Originally specified as `FOR SHARE`; changed to `FOR KEY SHARE` on 2026-11-16, see the progress table |
| 6 | Campaign delete with session-linked assets or provenance references has no PostgreSQL test (it works today; verified by hand on 2026-11-16) | `backend/tests/` | Add PostgreSQL-backed tests for the three cases: session-linked asset, relationship citing an asset, entity citing an asset |

**Schema and migration safety:**

| # | Problem | Where | Fix |
|---|---------|-------|-----|
| 7 | Nothing fails when a model in `backend/app/models/` changes without a matching migration. Schema tests only check the columns they list, and the SQLite tests build tables from the models, so a missing migration can pass the whole suite | `backend/tests/test_migrations.py` | Add a PostgreSQL test that upgrades to `head` and asserts `alembic.autogenerate.compare_metadata(...)` against `Base.metadata` returns no differences (the check `uv run alembic check` runs; `compare_type=True` is already set in `env.py`). Expect a few known differences to whitelist, such as the `'{}'::jsonb` server defaults |
| 8 | Migrations use `YYYYMMDD_NNNN` revision IDs and `YYYYMMDD_NNNN_slug.py` file names, but nothing enforces it. Plain `uv run alembic revision -m "..."` creates a random hash ID | `backend/alembic/env.py` | Add a `process_revision_directives` callback: when no `--rev-id` is given, set the ID to today's date plus the next sequence number after the current head. Add a test that generates a revision and checks the ID format. Until fixed, pass `--rev-id YYYYMMDD_NNNN` by hand |
| 9 | Status columns and `entities.type` accept any string | relationship, source-asset, parse, and extraction status columns | Add `CHECK` constraints. The migration must fail with a clear message if existing rows hold other values; run the entity-type compatibility migration first |
| 10 | Every campaign load also loads all its sessions, assets, entities, relationships, jobs, and candidates | `backend/app/models/campaign.py`, and the `selectin` collections on `Owner` and `Entity` | Make the collections lazy by default and add explicit `selectinload` only in queries that need it |
| 11 | Primary keys are random UUIDv4 | `UUIDPrimaryKeyMixin`, `backend/app/models/base.py` | Change the default to `uuid7`. No migration; existing rows stay. Keep ordering by `created_at, id` |
| 12 | Two `campaign_id` indexes duplicate a unique constraint | `ix_sessions_campaign_id`, `ix_relationship_type_definitions_campaign_id` | Drop them in a migration |

**Environment:**

| # | Problem | Where | Fix |
|---|---------|-------|-----|
| 13 | Compose publishes PostgreSQL, the API, and the frontend on every network interface, with a default superuser password and no login | `compose.yaml` | Bind published ports to `127.0.0.1`; publish PostgreSQL only if host tools need it |
| 14 | No CI; checks run only through local hooks | repository root | Optional in this task: a workflow that runs the backend and frontend checks |

**Progress:** Fixes #1 to #13 were merged by 2026-11-17. The branch split, merge order, and decisions are recorded in `docs/plans/archive/task-9-hardening-agent-team.md`.

| # | Status | What was implemented |
|---|--------|----------------------|
| 2 | Complete | `create_campaign` and `update_campaign` roll back on `IntegrityError` and raise `ConflictError`. Since 2026-11-17 only a violation of `uq_campaign_owner_name` is reported as a duplicate name; any other integrity error is rolled back and re-raised, as in the relationship services |
| 3 | Complete | `create_relationship_type` raises `ConflictError` only when the violated constraint is `uq_relationship_type_definitions_campaign_key`; other integrity errors are re-raised. A PostgreSQL test produces the race for real |
| 6 | Complete | `backend/tests/test_campaign_delete_postgres.py` covers the three cases and checks that a second campaign is untouched. File removal is covered by the #1 tests |
| 7 | Complete | `backend/tests/test_migrations.py` asserts `compare_metadata` returns no differences at `head`. Models and migrations matched, so no whitelist exists. The check does not see `CHECK` constraints, triggers, or functions. A second test, which needs no database, enforces the `YYYYMMDD_NNNN_slug.py` naming, consecutive sequence numbers, and one linear chain |
| 10 | Complete | Eleven collections on `Campaign`, `Owner`, `Entity`, and `ExtractionJob` use `lazy="select"`. No query needed an explicit `selectinload`. Entity and campaign delete rely on the database cascade; `backend/tests/test_delete_cascade_postgres.py` covers both on PostgreSQL |
| 11 | Complete | `UUIDPrimaryKeyMixin` defaults to `uuid7` |
| 13 | Complete | The three published ports are bound to `127.0.0.1`; PostgreSQL stays published for host-side debugging. The engineer opened the app from a Windows browser under WSL on 2026-11-16 and it loaded |
| 5 | Complete | Revision `20261116_0004` adds `FOR KEY SHARE` to the trigger's asset lookup. A concurrency test reproduces the race and a second one shows that two transactions which each cite an asset and then update its row both commit. `FOR SHARE` was measured to deadlock in that case. The lock depends on the delete path taking `FOR UPDATE` before it checks references; a test fails if `_begin_asset_delete` stops doing that |
| 1 | Complete | Decided 2026-11-16: `delete_campaign` marks the campaign's assets `deleting`, removes the files, then deletes the campaign row. A failed removal leaves the campaign in place with a 409, and repeating the delete finishes it. An asset uploaded while the files are being removed also stops the delete with a 409. Background deletion is deferred in `docs/deferred_design_options.md` |
| 12 | Complete | Revision `20261116_0005` drops both indexes and the models no longer declare them. `uq_sessions_campaign_number` and `uq_relationship_type_definitions_campaign_key` already start with `campaign_id` |
| 8 | Complete | Decided 2026-11-16: no auto-ID callback. It would make plain `alembic revision` need a running database. The naming test added with #7 enforces the format instead; keep passing `--rev-id YYYYMMDD_NNNN` |
| 4 | Complete | Revision `20261116_0006` adds `uq_entity_relationships_campaign_type_source_target`. The migration lists existing duplicates and refuses to run without changing any row. `_commit_relationship_write` maps that constraint's violation to the same 409 as the service check. The inverse pair of a symmetric type is still guarded only by `_validate_duplicates`, so that race stays open. `ix_entity_relationships_campaign_id` became covered by the new constraint; revision `20261117_0008` drops it |
| 9 | Complete | Decided 2026-11-16: `CHECK` constraints on the status columns only. `entities.type` stays unconstrained while the entity-type compatibility feature exists. Revision `20261116_0007` adds nine `ck_<table>_<column>_allowed` constraints; it lists out-of-range values and refuses to run without changing any row. The models build each constraint from its enum in `backend/app/enums.py`, and tests compare the models with the enums and with the migrated database. Adding a status value to one of these enums needs a migration that replaces the matching constraint. `source_assets.truth_status`, `extraction_candidates.candidate_type`, `extraction_jobs.extractor_kind`, `asset_parse_results.parser_kind`, and `relationship_type_definitions.family` are not constrained |
| 14 | Complete | Decided 2026-11-17: not done. The fix was optional; checks keep running through the local hooks |

**Not in this task:**

| Item | Goes to |
|------|---------|
| `campaign_id` first in composite keys | Task 13, together with the tenant-level decision; it rewrites every composite key and foreign key |
| Optimistic locking, `SKIP LOCKED` in the delete retry job, migrations as a deploy step, pagination | Hosting; they do not matter for one local user |
| Frontend response-schema validation, forms seeded from props, the synchronous API-test shim | Stay in `docs/technical_debt.md`. The response-schema item is due before Task 11 adds a new API family |
| Mockup differences and mockup-comparison coverage | Stay in `docs/technical_debt.md` |

### Task 10: PostgreSQL-only parsing pipeline and Google import

**Status: Next**

Deliver the first real path from a source note to parsed sections, all inside the backend and PostgreSQL.

```text
Google Doc or Sheet, or uploaded text/Markdown
  → snapshot saved as a source asset
  → job row (queued) → background task in the backend
  → sections saved in asset_parse_results
```

**Steps:**
1. Extend `AssetStorage` with a way to read a stored file and a way to store bytes that do not come from an upload. Keep the local backend; callers must not use paths.
2. Define the format-neutral, Unicode-safe `ParsedDocument`/`ParsedSection` contract and store it in `asset_parse_results`. Each section carries text, optional structure, source location, and a `language` field. Add `campaign_id` to `asset_parse_results` with the same composite-key pattern as the other campaign tables.
3. Add the first parser for plain text and Markdown. Google Docs export as Markdown, so headings give sections.
4. Add an explicit start-processing API. Track parse state in `source_assets.parse_status` and the job row. Reads stay cheap.
5. Run the work as a backend background task. On startup, mark jobs stuck in `running` as `failed` so they can be rerun. Reruns must be idempotent through the existing uniqueness on asset, parser kind, parser version, and checksum.
6. Keep asset deletion coordinated: a running job blocks deletion or is cancelled first, and parse results go with the asset.
7. Add the Google importer: OAuth with a read-only scope, Docs through the Drive API as Markdown, Sheets rows and headers through the Sheets API. Provenance is doc + heading or sheet + row.
8. Test with English, Hebrew, and mixed-language fixtures even though English is the first supported language.

**Blocked on:** an approved mockup design for the import and processing-state UI, and the decision on which notes may be sent to Google and LLM providers. The backend steps 1–6 are not blocked.

### Task 11: Rules extraction and candidate review

**Status: Planned**

**Steps:**
1. Extend `ExtractionJob` with the provenance it lacks: parse result used, parser version, extractor version, model/provider, prompt version, and start time.
2. Link an approved candidate to the entity or relationship it created.
3. Add the rules extractor as the deterministic baseline and fixture oracle.
4. Add the review service: edit, approve, reject. Approval writes through the canonical entity and relationship services and keeps provenance. Candidates are GM-only until reviewed.
5. Before adding the frontend API family, pay the response-schema item in `docs/technical_debt.md`.
6. Build the candidate review UI.

**Blocked on:** an approved mockup design for candidate review (step 6 only).

### Task 12: LLM extraction and evals

**Status: Planned**

**Steps:**
1. Put a real model behind the same extractor interface. Validate structured output and retry invalid output.
2. Cache results by source checksum, model, and prompt version.
3. Classify provider throttling and transient failures separately from invalid requests.
4. Add a hand-labeled eval set and a script that scores each prompt or model version against it and against the rules extractor.
5. No extractor bypasses human review.

The extractor, prompts, and eval set come from the standalone toolkit. The order of this task and Task 13 is an open decision.

### Task 13: Users, membership, and visibility

**Status: Planned**

Decide the tenant level first (see Open Decisions and "World-owned reusable assets" in `docs/deferred_design_options.md`).

**Steps:**
1. Add login through a managed auth provider. Prefer bearer-token auth; if cookies are used, the preflight-free multipart upload needs CSRF protection.
2. Turn `Owner` into `User` and add `campaign_members` with a GM or player role.
3. Add one shared dependency that checks the caller's role for a campaign, and use it on every campaign route. Today routes only check that the campaign exists.
4. Close the unscoped routes: remove `GET /entities` across campaigns, filter `GET /campaigns` by the caller, take `owner_id` from the auth context instead of the request body, replace `GET /owners/default` with a current-user route, and make the entity-type compatibility report and migration admin-only or a maintenance command.
5. Add visibility (`public`, `secret`, revealed to specific players) to entities, relationships, and assets, and enforce it in services. `visibility_status` is stored on relationships today but never enforced on reads.
6. Add role-specific response schemas so players never receive GM-only fields such as notes, provenance, or free-form metadata.
7. Add PostgreSQL Row-Level Security as a second guard.
8. If the tenant level changes, reorder composite keys to put the tenant column first in the same migration.
9. Build the player views.

**Done when:** a test proves a player account cannot fetch a secret entity.

**Blocked on:** approved mockup designs for player views (step 9 only), and the auth-provider decision.

### Task 14: Search and question answering backend

**Status: Planned**

**Files:**
- Create: `backend/app/api/routes/search.py`
- Create: `backend/app/services/search_service.py`
- Create: `backend/tests/test_search.py`

**Steps:**
1. Implement PostgreSQL full-text search over entity names, summaries, sessions, and parsed source-asset text.
2. Add pgvector chunks and embeddings behind the same search service, using a multilingual embedding model.
3. Filter by campaign and visibility before any text reaches an LLM.
4. Return grouped results for entities, sessions, and source assets, and answers with their sources.
5. Add tests for keyword hits, campaign isolation, and empty results, and an eval that proves a player answer never uses a secret source.

### Task 15: Search frontend

**Status: Planned**

**Files:**
- Create: `frontend/src/routes/SearchPage.tsx`
- Create: `frontend/src/api/search.ts`
- Create: `frontend/src/types/search.ts`

**Steps:**
1. Add a search route that calls the backend search API.
2. Display grouped results for entities, sessions, and source assets.
3. Support campaign-scoped filtering using backend-provided contracts.
4. Verify search end to end against sample notes.

**Design decisions to carry forward:**
- Follow `search first, then filter` for fact-finding.
- Let campaign and type filters narrow results after discovery begins.
- Expose enough relationship context in result rows to reduce unnecessary navigation.

### Task 16: Demo polish and documentation

**Status: Planned**

**Files:**
- Modify: `README.md`

**Steps:**
1. Reconcile setup instructions with the complete backend, frontend, and PostgreSQL runtime, including Google and LLM credentials.
2. Keep sample campaign notes useful for demo and repeatable test scenarios.
3. Update the demo script to cover the implemented workflow.
4. Verify the app end to end on a clean local setup.

### Later, not scheduled

| Item | Notes |
|------|-------|
| Hosting | S3 storage behind `AssetStorage`, a separate worker, a production image without the dev server, a least-privilege database role, migrations as a deploy step. See "Hosted processing infrastructure" in `docs/deferred_design_options.md` |
| Asset download or preview endpoint | When added: force attachment, send `nosniff`, check file content against the claimed media type, and never build a header from the stored filename by hand |
| More formats | CSV, XLSX, PDF, then DOCX and ODT with bounded archive inspection. Additive parsers on the Task 10 section contract |
| Hebrew and mixed-language notes | Includes resolving one name written in two scripts to one entity |
| MCP server and extraction agent | The server acts as the logged-in user, never as an admin; tools enforce permissions |
| Player belief graphs | Relationships as claims from a perspective; not designed yet |

## Test Plan

Backend automated tests:
- CRUD and campaign isolation for campaigns, entities, relationships, relationship types, sessions, and source assets
- migration-safe schema, provenance preservation, and models matching migrations
- storage, import, job lifecycle, rerun idempotency, stuck-job recovery, and deletion-coordination behavior
- extraction job creation, candidate generation, editing, approval, and rejection
- role and visibility enforcement: a player cannot read secret records through any route or through search
- search over entities, sessions, and parsed assets

LLM evals:
- extraction quality per prompt and model version against the hand-labeled set
- player-mode answers never use secret sources

Frontend verification:
- campaign, entity, relationship, session, and asset workflows load and submit through typed APIs
- processing and extraction review states are visible and actionable
- search displays grouped campaign-scoped results
- loading, empty, success, and error states remain understandable

Manual acceptance flow:
1. Create a campaign and session.
2. Import a Google Doc of session notes.
3. Observe successful processing into sections.
4. Run extraction and review/edit candidates.
5. Approve at least one entity and relationship.
6. Search for an extracted character or location and ask a question about it.
7. Inspect saved provenance.
8. Sign in as a player and confirm secret records are not visible.

## Assumptions

- The app runs locally through Docker Compose and is not reachable from other machines until Task 13 is done.
- Extraction quality can be modest if the review loop is solid.
- Search schema and indexing are intentionally deferred until search work starts.
- PostgreSQL holds everything except original file bytes; parsed sections and embeddings are derived and rebuildable from the originals.
- Uploads use backend-managed local storage until hosting.
- Real notes are sent to Google and LLM providers only after the owner decides which notes are allowed.
