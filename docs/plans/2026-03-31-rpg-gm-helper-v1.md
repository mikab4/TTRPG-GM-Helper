# RPG GM Helper V1 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a single-user, locally runnable RPG GM helper that stores campaign data, ingests source assets, processes them asynchronously, extracts candidate entities for review, and supports keyword search.

**Architecture:** Use a modular monolith with a Python FastAPI backend, PostgreSQL as the source of truth, and a separate TypeScript React frontend in the same repository. Add one independently runnable `asset-processor` worker for slow, failure-prone asset processing; it uses Redis Streams for transport, MinIO through an S3-compatible storage boundary for files, and MongoDB only for rebuildable versioned parse projections. Keep the frontend thin and keep all canonical workflow, candidate review, and business rules in FastAPI/PostgreSQL.

**Tech Stack:** FastAPI, PostgreSQL, Redis Streams, MongoDB, MinIO/S3 API, SQLAlchemy or SQLModel, Alembic, pytest, React, TypeScript, Vite, Docker Compose

---

## Delivery Target

Deliver a demoable first milestone with these user-visible capabilities:
- Create and manage campaigns
- Create and edit entities and sessions
- Upload and manage source assets such as text documents, spreadsheets, and images
- Run extraction to generate candidate entities and relationships
- Review and accept or reject candidates before persistence
- Search entities, sessions, and parsed asset text with PostgreSQL full-text search

## Core Product Decisions

- The app is single-user and local-first in v1.
- The backend remains in Python so development stays fast.
- The frontend is TypeScript React so the project includes one deliberate new learning area.
- The frontend stays a separate app with routing, forms, tables, API calls, and presentation only; domain rules remain in backend services.
- PostgreSQL is the canonical datastore in v1. Redis is transient work transport and MongoDB is a rebuildable parsed-document projection; neither owns canonical campaign truth.
- Original assets use an S3-compatible storage boundary, backed by MinIO in local Docker Compose. No API or worker code may rely on a shared local filesystem path.
- Search uses PostgreSQL full-text search only, but search-specific schema and indexing work are deferred until the search task.
- Extraction starts rules-first, but its contract records parser, extractor, model/provider, and prompt/template versions so a future model-backed implementation can use the same review workflow.
- Public auth, tenant enforcement, semantic/vector search, model training, and additional service splits are deferred. The one worker boundary is intentional and must not expand into independent CRUD domain services.

## Public Interfaces

Implement these API groups:
- `/campaigns`
- `/entities`
- `/relationships`
- `/sessions`
- `/assets`
- `/processing-jobs`
- `/extraction-jobs`
- `/search`

API rules:
- Every resource that belongs to a campaign must include `campaign_id`.
- Backend code must not assume one implicit global campaign.
- Extracted entities and relationships must preserve provenance.
- Extraction candidates must be editable before approval.
- The frontend should consume backend contracts through a plain typed API client rather than duplicating workflow or persistence rules in React components.

## Data Model

Define these initial records:
- `Owner`
- `Campaign`
- `Entity`
- `Relationship`
- `Session`
- `SourceAsset`
- `AssetParseResult`
- `ProcessingJob`
- `OutboxEvent`
- `ExtractionJob`
- `ExtractionCandidate`

Schema defaults:
- Use one generic `Entity` table in v1.
- `Entity` has `type`, `name`, `summary`, `metadata JSONB`, provenance fields, and timestamps.
- `Relationship` maps to the `entity_relationships` table and stores source entity, target entity, relationship type, optional notes, provenance, and confidence.
- Deleting an entity also deletes its incoming and outgoing relationships. The ORM relationship configuration and database foreign keys must agree on that cascade behavior.
- `Session` represents an actual play session and is distinct from uploaded source artifacts.
- `SourceAsset` stores uploaded evidence or artifacts and may optionally link back to a session.
- `AssetParseResult` remains compatibility/provenance groundwork while MongoDB holds rebuildable versioned parse projections. Parsed documents use a format-neutral section contract from the first `.txt` slice so new formats do not reshape job, storage, callback, or provenance contracts.
- `ProcessingJob` and `OutboxEvent` provide canonical lifecycle and reliable dispatch records; Redis is never the only record of work.
- `Owner` exists as a placeholder for future auth and tenancy even though v1 is single-user.

## Implementation Tasks

Sequence the work as vertical slices after the shared foundation. The point is to make each major feature visible and testable end-to-end before moving to the next slice, instead of batching all backend work first and all frontend work later.

### Task 1: Repository scaffolding and project layout

**Files:**
- Create: `backend/`
- Create: `frontend/`
- Create: `README.md`
- Create: `backend/pyproject.toml` or `backend/requirements.txt`
- Create: `frontend/package.json`

**Steps:**
1. Create the backend app directory and dependency manifest.
2. Create the frontend app directory with Vite React TypeScript scaffolding.
3. Add a root README with local setup instructions.
4. Add environment example files for backend and frontend.

### Task 2: Backend application skeleton

**Files:**
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`
- Create: `backend/app/db.py`
- Create: `backend/app/api/`
- Create: `backend/tests/`

**Steps:**
1. Create a FastAPI app entrypoint and configuration loading.
2. Add PostgreSQL connection setup and session management.
3. Add a health endpoint and API router registration.
4. Add test configuration and one smoke test for app startup.

### Task 3: Database schema and migrations

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/alembic/`
- Create: `backend/app/models/`
- Create: `backend/tests/test_models.py`

**Steps:**
1. Define models for owner, campaign, entity, relationship, session, source asset, asset parse result, extraction job, and extraction candidate.
2. Add an initial Alembic migration for the full v1 schema.
3. Defer PostgreSQL full-text search columns and indexes until the search task.
4. Add tests that persist and retrieve the core records.

### Task 4: Frontend scaffolding and API client

**Files:**
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/api/`
- Create: `frontend/src/types/`

**Steps:**
1. Scaffold the Vite React TypeScript app.
2. Add a plain typed API client layer matching backend request and response contracts.
3. Add routing and shared layout for the admin-style UI while keeping domain behavior out of React-specific abstractions.
4. Add a simple environment-based API base URL config.

### Task 5: Campaign and entity CRUD backend

**Files:**
- Create: `backend/app/api/campaigns.py`
- Create: `backend/app/api/entities.py`
- Create: `backend/app/schemas/`
- Create: `backend/tests/test_campaigns_api.py`
- Create: `backend/tests/test_entities_api.py`

**Steps:**
1. Implement campaign CRUD endpoints.
2. Implement entity CRUD endpoints with filtering by campaign and entity type.
3. Validate that entities cannot be created outside a known campaign.
4. Add API tests for successful create, read, update, list, and delete flows.

### Task 6: Campaign and entity CRUD frontend

**Files:**
- Create: `frontend/src/pages/CampaignsPage.tsx`
- Create: `frontend/src/pages/EntitiesPage.tsx`
- Create: `frontend/src/pages/EntityDetailPage.tsx`

**Steps:**
1. Build list and detail views for campaigns.
2. Build entity list and entity edit flows.
3. Connect the screens to the typed API client for the new backend CRUD endpoints.
4. Handle loading, success, and API error states clearly so the full campaign and entity flow is demoable.

**Deferred UX decisions to carry forward:**
- The Overview should weight `New Entity` more heavily than `New Campaign` if actual usage continues to support that assumption.
- Quick-look side panels should remain the primary low-cost inspection flow; deeper pages should be escalation paths, not the default.
- Full profile and edit screens should be tightened for higher information density if scrolling cost remains too high.
- Entity `type` should move from free text to a constrained choice during the frontend/backend cleanup pass for entity consistency.
- Type-sensitive forms are explicitly deferred until richer typed metadata or relationship semantics exist.

### Task 7: Relationships backend and frontend

**Files:**
- Create: `backend/app/api/relationships.py`
- Create: `backend/tests/test_relationships_api.py`
- Create: `frontend/src/pages/RelationshipsPage.tsx`
- Create: `frontend/src/pages/RelationshipDetailPage.tsx`

**Steps:**
1. Implement CRUD for relationships with campaign ownership validation.
2. Add tests covering cross-campaign validation and relationship CRUD behavior.
3. Build relationship list and edit flows in the frontend.
4. Connect relationship screens to the typed API client so the full relationship flow is demoable end-to-end.

**Design decisions to revisit in this task:**
- How should relationship labels be phrased so they match GM mental models instead of backend field names?
- Which relationship types should be constrained choices in v1 versus flexible free text?
- What relationship summary should be available on entity lists and quick-look panels without requiring full-page navigation?

### Task 8: Sessions and source assets backend and frontend

**Files:**
- Create: `backend/app/api/sessions.py`
- Create: `backend/app/api/assets.py`
- Create: `backend/tests/test_sessions_api.py`
- Create: `backend/tests/test_assets_api.py`
- Create: campaign-workspace Session and Asset route components under `frontend/src/routes/`

**Steps:**
1. Implement CRUD for sessions.
2. Implement source asset upload and CRUD with backend-managed original-file storage.
3. Keep parsing backend-owned and prepare the asset model for later implicit parse-dependent reads such as extraction, search, and preview; ordinary asset metadata reads must stay cheap and must not trigger parsing in this task.
4. Land the schema, storage, and compatibility groundwork for cached parse results now, while deferring parse lookup/reuse, thresholds, retry handling, and stale-cache cleanup to the next parsing-focused branch.
5. Use an in-place compatibility migration from the older `session_notes + source_documents` shape when this task is applied to an existing branch or database state.
6. Add tests covering session CRUD, asset upload, asset-session linking, groundwork migration safety for future parse caching, and migration-safe provenance preservation.
7. Keep the backend upload contract single-purpose. If the UI offers one form for creating a session and uploading an asset, the frontend should orchestrate two API calls rather than adding a combined backend endpoint in this task.
8. Verify the session and asset groundwork flow is usable end-to-end before starting the next parsing-focused branch.
9. Build session and asset list/detail flows as sections of the selected campaign workspace; do not add separate top-level Sessions or Assets picker pages.
10. Connect those campaign-scoped screens to the typed API client without moving validation rules into React. Use `docs/plans/2026-07-24-campaign-sessions-assets-frontend-scope.md` for the session/asset extension, and preserve the workspace shell defined in `docs/plans/2026-07-24-workspace-layout-frontend-scope.md`.

**Design decisions to revisit in this task:**
- Which session and asset facts belong in quick inspection surfaces versus full editing pages?
- How should campaign context remain visible while working inside sessions/assets so users do not lose orientation?
- Which parsed asset details should be exposed in asset detail views without surfacing parser internals too early?
- How should the campaign switcher preserve the current workspace section while protecting unsaved form changes?

### Task 9: Real `.txt` asset-processing vertical slice

Implement the first learning slice end to end: a real `.txt` upload is stored in MinIO, creates a canonical PostgreSQL processing job, travels through Redis Streams to the independently runnable worker, becomes a versioned MongoDB parsed-document projection, and reports its result through an internal FastAPI callback. Keep it intentionally narrow: no other formats, candidate extraction, retries, or outbox yet. Completion must already be idempotent.

### Task 10: Durable dispatch, recovery, and deletion coordination

Replace Task 9's direct queue publish with a PostgreSQL transactional outbox and relay process. Add consumer-group recovery, retry classification, terminal failures, dead-letter transport records, cancellation, asset-delete coordination, and structured correlation logging. PostgreSQL remains the authoritative job lifecycle throughout.

### Task 11: Multilingual parsing, extraction, and review

Formalize a Unicode-preserving, format-neutral `ParsedDocument`/`ParsedSection` contract; `.txt` is its first implementation. Treat language as a per-section hint and never assume a mixed Hebrew/English asset has one definitive language. Add the rules extractor, versioned candidate provenance, campaign-scoped candidate review, and human approval before canonical writes. Define—but do not yet call—a model-extractor adapter that records provider/model/prompt versions.

### Task 12: Add formats incrementally and safely

Add CSV/XLSX and PDF parsers to the same section contract, then add DOCX/ODT only with bounded ZIP/package inspection and format-specific security tests. Images remain storable but unparsed until OCR is a separately approved feature. New formats must be additive parser implementations, not changes to storage, job, callback, or provenance contracts.

**Detailed execution plan:** `docs/plans/2026-08-08-cloud-ready-asset-intelligence-pipeline.md` is the task-by-task implementation breakdown for Tasks 9–12. It is subordinate to this source-of-truth plan and must remain consistent with it.

### Task 13: Search backend

**Files:**
- Create: `backend/app/api/search.py`
- Create: `backend/app/services/search_service.py`
- Create: `backend/tests/test_search.py`

**Steps:**
1. Implement PostgreSQL full-text search over entity names, summaries, sessions, and parsed source asset text.
2. Return grouped results for entities, sessions, and source assets.
3. Add campaign filtering to search queries.
4. Add tests for keyword hits and empty-result behavior.

### Task 14: Search frontend

**Files:**
- Create: `frontend/src/pages/SearchPage.tsx`

**Steps:**
1. Add a search page that calls the backend search API.
2. Display grouped results for entities, sessions, and source assets.
3. Support campaign-scoped filtering in the UI using backend-provided contracts.
4. Verify search works end-to-end against the seeded demo data and sample notes.

**Design decisions to revisit in this task:**
- The search experience should follow `search first, then filter` for fact-finding.
- Campaign and type filters should narrow results after users begin foraging for a fact, not force a form-like sequence before discovery.
- Search result rows should expose enough relationship scent to reduce unnecessary page visits.

### Task 15: Demo polish and documentation

**Files:**
- Modify: `README.md`
- Create: `docs/demo-script.md`
- Create: `docs/sample-notes/`

**Steps:**
1. Add setup instructions for backend, frontend, and PostgreSQL.
2. Add sample campaign notes for demo and test fixtures.
3. Write a short demo script covering the main workflow.
4. Verify the app can be shown end-to-end on a clean local setup.

## Test Plan

Backend automated tests:
- CRUD for campaigns, entities, relationships, sessions, and source assets
- extraction job creation and candidate generation
- candidate approval and rejection flows
- search queries over entities, sessions, and source assets
- cross-campaign validation failures
- migration-safe provenance preservation for source assets
- in the follow-up parsing branch: parse failure, retry, and stale-cache invalidation behavior

Frontend verification:
- campaign list/detail loads from the API
- entity, session, and asset forms submit successfully
- extraction review actions update candidate state
- search page displays grouped results
- error and loading states are visible and understandable

Manual acceptance flow:
1. Create a campaign.
2. Paste a session summary.
3. Run extraction.
4. Review and accept candidate entities.
5. Search for one extracted character or location.
6. Inspect saved provenance data.
## Assumptions

- v1 remains single-user and locally runnable through Docker Compose, but asset storage and processing interfaces are cloud-compatible.
- Auth is deferred but schema and APIs leave room for it later.
- Extraction quality can be modest if the review loop is solid.
- Search schema and indexing are intentionally deferred from Task 3 until search work starts.
- PostgreSQL job and provenance records are canonical; MongoDB parsed documents are derived and rebuildable.
- Original uploaded assets live outside Postgres in MinIO/S3-compatible backend-managed storage.
- Parsing runs in one independently runnable worker and reports outcomes through FastAPI; the worker does not write canonical PostgreSQL tables directly.
