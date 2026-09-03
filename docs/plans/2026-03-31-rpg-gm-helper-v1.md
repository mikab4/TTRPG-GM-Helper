# RPG GM Helper V1 Implementation Plan

**Applies to:** overall product scope, architecture, delivery sequence, and milestone acceptance
**Related code:** `backend/`, `frontend/`, `docs/mockups/workspace-v1.html`, `compose.yaml`; planned `processor/`
**Deferred design triggers:** None

**Goal:** Build a single-user, locally runnable RPG GM helper that stores campaign data, ingests source assets, processes them asynchronously, extracts candidate entities for review, and supports keyword search.

**Architecture:** Use a modular monolith with a Python FastAPI backend, PostgreSQL as the source of truth, and a separate TypeScript React frontend in the same repository. Add one independently runnable `asset-processor` worker for slow, failure-prone asset processing; it uses Redis Streams for transport, MinIO through an S3-compatible storage boundary for files, and MongoDB only for rebuildable versioned parse projections. Keep the frontend thin and keep all canonical workflow, candidate review, and business rules in FastAPI/PostgreSQL.

**Tech Stack:** FastAPI, PostgreSQL, Redis Streams, MongoDB, MinIO/S3 API, SQLAlchemy, Alembic, pytest, React, TypeScript, Vite, Docker Compose

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
- `docs/mockups/workspace-v1.html` is authoritative for frontend visual and interaction design. Missing designs and any deviations require engineer approval before implementation and must be recorded in `docs/design-deviations.md`.
- PostgreSQL is the canonical datastore in v1. Redis is transient work transport and MongoDB is a rebuildable parsed-document projection; neither owns canonical campaign truth.
- Original assets use a backend-owned storage boundary. The current implementation is local filesystem storage; Task 9 adds an S3-compatible implementation backed by MinIO. No API or worker code may rely on a shared local filesystem path after that transition.
- Parsing is an explicit asynchronous workflow. Ordinary asset metadata reads must remain cheap and must not trigger hidden processing.
- Search uses PostgreSQL full-text search only, but search-specific schema and indexing work are deferred until the search task.
- Extraction starts rules-first, but its contract records parser, extractor, model/provider, and prompt/template versions so a future model-backed implementation can use the same review workflow.
- Public auth, tenant enforcement, semantic/vector search, model training, and additional service splits are deferred. The one worker boundary is intentional and must not expand into independent CRUD domain services.

## Public Interfaces

Implemented API groups are registered under `backend/app/api/routes/` for owners, campaigns, entities, relationships, relationship types/families, sessions, assets, compatibility migration, and health.

Remaining API groups:
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
- `ProcessingJob`
- `OutboxEvent`

Schema defaults:
- Use one generic `Entity` table in v1.
- `Entity` has campaign ownership, constrained `type`, `name`, optional `summary`, `metadata` JSONB, optional source-asset provenance, and timestamps.
- `Relationship` stores campaign-scoped source and target entities, relationship type, lifecycle/visibility/certainty statuses, optional notes, optional confidence, optional source-asset provenance, and timestamps.
- `RelationshipTypeDefinition` stores campaign-scoped relationship keys, labels, families, direction/symmetry rules, and allowed source/target entity types.
- Deleting an entity also deletes its incoming and outgoing relationships. The ORM configuration and database foreign keys agree on that cascade behavior.
- `Session` represents an actual play session and is distinct from uploaded source artifacts.
- `SourceAsset` stores campaign ownership, an optional session link and title, truth/media metadata, required original filename, byte size, checksum, storage key, lifecycle/storage/parse state, deletion-recovery fields, metadata JSONB, and timestamps.
- `AssetParseResult` is implemented compatibility/provenance groundwork. New worker output uses MongoDB for rebuildable versioned parsed-document projections rather than reviving the former hybrid inline/artifact cache design.
- `ExtractionJob` and `ExtractionCandidate` schema groundwork exists, but extraction services and review APIs are not implemented yet.
- `ProcessingJob` and `OutboxEvent` will provide canonical processing lifecycle and reliable dispatch records; Redis is never the only record of work.
- `Owner` remains the future ownership/auth seam even though v1 is single-user.

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
4. Land asset lifecycle/storage/parse metadata and `AssetParseResult` compatibility/provenance groundwork without treating it as the target worker projection store.
5. Apply an in-place compatibility migration from `session_notes + source_documents` to `sessions + source_assets`, preserving provenance.
6. Add tests for session CRUD, uploads, links, deletion compensation/retry, cross-campaign protection, migration safety, and provenance.
7. Keep the upload contract single-purpose; combined session/upload UI flows orchestrate separate API calls.
8. Build campaign-scoped session and asset list/detail/edit flows rather than separate top-level picker pages.
9. Preserve campaign context and unsaved-change protection in the workspace shell.

The completed detailed plans for this task and its workspace UI are retained under `docs/plans/archive/`.

### Task 9: Real `.txt` asset-processing vertical slice

**Status: Next**

Implement the first learning slice end to end: a real `.txt` upload is stored in MinIO, creates a canonical PostgreSQL processing job, travels through Redis Streams to the independently runnable worker, becomes a versioned MongoDB parsed-document projection, and reports its result through an internal FastAPI callback. Keep it intentionally narrow: no other formats, candidate extraction, retries, or outbox yet. Completion must already be idempotent.

### Task 10: Durable dispatch, recovery, and deletion coordination

**Status: Planned**

Replace Task 9's direct queue publish with a PostgreSQL transactional outbox and relay process. Add consumer-group recovery, retry classification, terminal failures, dead-letter transport records, cancellation, asset-delete coordination, and structured correlation logging. PostgreSQL remains the authoritative job lifecycle throughout.

### Task 11: Multilingual parsing, extraction, and review

**Status: Planned**

Formalize a Unicode-preserving, format-neutral `ParsedDocument`/`ParsedSection` contract; `.txt` is its first implementation. Treat language as a per-section hint and never assume a mixed Hebrew/English asset has one definitive language. Add the rules extractor, versioned candidate provenance, campaign-scoped candidate review, and human approval before canonical writes. Define—but do not yet call—a model-extractor adapter that records provider/model/prompt versions.

### Task 12: Add formats incrementally and safely

**Status: Planned**

Add CSV/XLSX and PDF parsers to the same section contract, then add DOCX/ODT only with bounded ZIP/package inspection and format-specific security tests. Images remain storable but unparsed until OCR is a separately approved feature. New formats must be additive parser implementations, not changes to storage, job, callback, or provenance contracts.

**Detailed execution plan:** `docs/plans/2026-08-08-cloud-ready-asset-intelligence-pipeline.md` is the task-by-task implementation breakdown for Tasks 9–12. It is subordinate to this source-of-truth plan and must remain consistent with it.

### Task 13: Search backend

**Status: Planned**

**Files:**
- Create: `backend/app/api/routes/search.py`
- Create: `backend/app/services/search_service.py`
- Create: `backend/tests/test_search.py`

**Steps:**
1. Implement PostgreSQL full-text search over entity names, summaries, sessions, and parsed source-asset text.
2. Return grouped results for entities, sessions, and source assets.
3. Add campaign filtering to search queries.
4. Add tests for keyword hits, campaign isolation, and empty results.

### Task 14: Search frontend

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

### Task 15: Demo polish and documentation

**Status: Planned**

**Files:**
- Modify: `README.md`

**Steps:**
1. Reconcile setup instructions with the complete backend, frontend, PostgreSQL, Redis, MongoDB, MinIO, and processor runtime.
2. Keep sample campaign notes useful for demo and repeatable test scenarios.
3. Update the demo script to cover the implemented workflow.
4. Verify the app end to end on a clean local setup.

## Test Plan

Backend automated tests:
- CRUD and campaign isolation for campaigns, entities, relationships, relationship types, sessions, and source assets
- migration-safe schema and provenance preservation
- storage, processing-job, dispatch, callback-idempotency, retry, recovery, and deletion-coordination behavior
- extraction job creation, candidate generation, editing, approval, and rejection
- search over entities, sessions, and parsed assets

Frontend verification:
- campaign, entity, relationship, session, and asset workflows load and submit through typed APIs
- processing and extraction review states are visible and actionable
- search displays grouped campaign-scoped results
- loading, empty, success, and error states remain understandable

Manual acceptance flow:
1. Create a campaign and session.
2. Upload a `.txt` source asset.
3. Observe successful asynchronous processing.
4. Run extraction and review/edit candidates.
5. Approve at least one entity and relationship.
6. Search for an extracted character or location.
7. Inspect saved provenance.

## Assumptions

- v1 remains single-user and locally runnable through Docker Compose, but asset storage and processing interfaces are cloud-compatible.
- Auth is deferred but schema and APIs leave room for it later.
- Extraction quality can be modest if the review loop is solid.
- Search schema and indexing are intentionally deferred until search work starts.
- PostgreSQL job and provenance records are canonical; MongoDB parsed documents are derived and rebuildable.
- Current uploads use backend-managed local storage; Task 9 moves originals to MinIO/S3-compatible storage.
- Parsing runs in one independently runnable worker and reports outcomes through FastAPI; the worker does not write canonical PostgreSQL tables directly.
