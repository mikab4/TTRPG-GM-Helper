# RPG GM Helper V1 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a single-user, local-first RPG GM helper that stores campaign data, ingests source assets, extracts candidate entities for review, and supports keyword search.

**Architecture:** Use a modular monolith with a Python FastAPI backend, PostgreSQL as the source of truth, and a separate TypeScript React frontend in the same repository. Keep the frontend thin and isolated behind a plain typed API boundary so business rules stay in FastAPI services and the UI remains cheap to replace if early framework choices change. Keep extraction and external sync behind clear interfaces so semantic search, model-assisted extraction, and future auth can be added without rewriting core workflows.

**Tech Stack:** FastAPI, PostgreSQL, SQLAlchemy or SQLModel, Alembic, pytest, React, TypeScript, Vite

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
- PostgreSQL is the only datastore in v1.
- Search uses PostgreSQL full-text search only, but search-specific schema and indexing work are deferred until the search task.
- Extraction is rules-first, with an interface that can later support an LLM-backed implementation.
- Auth, semantic search, vector search, model training, and microservices are deferred.

## Public Interfaces

Implement these API groups:
- `/campaigns`
- `/entities`
- `/relationships`
- `/sessions`
- `/assets`
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
- `ExtractionJob`
- `ExtractionCandidate`

Schema defaults:
- Use one generic `Entity` table in v1.
- `Entity` has `type`, `name`, `summary`, `metadata JSONB`, provenance fields, and timestamps.
- `Relationship` maps to the `entity_relationships` table and stores source entity, target entity, relationship type, optional notes, provenance, and confidence.
- `Session` represents an actual play session and is distinct from uploaded source artifacts.
- `SourceAsset` stores uploaded evidence or artifacts and may optionally link back to a session.
- `AssetParseResult` stores cached parse output so text and structure can be reused without reparsing unchanged assets.
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
- Create: `frontend/src/pages/SessionsPage.tsx`
- Create: `frontend/src/pages/AssetsPage.tsx`

**Steps:**
1. Implement CRUD for sessions.
2. Implement source asset upload and CRUD with backend-managed original-file storage.
3. Keep parsing backend-owned and implicit, but only for parse-dependent reads such as extraction, search, and preview; ordinary asset metadata reads must stay cheap and must not trigger parsing.
4. Add backend-owned lazy parsing with cached parse results for text documents and spreadsheets, while allowing images to be stored without parse output.
5. Use an in-place compatibility migration from the older `session_notes + source_documents` shape when this task is applied to an existing branch or database state.
6. Add tests covering session CRUD, asset upload, parse cache behavior, asset-session linking, parse failure and retry behavior, and migration-safe provenance preservation.
7. Keep the backend upload contract single-purpose. If the UI offers one form for creating a session and uploading an asset, the frontend should orchestrate two API calls rather than adding a combined backend endpoint in this task.
8. Verify the session and asset flow is usable end-to-end before starting extraction work.
9. Build session and asset list and detail flows in the frontend.
10. Connect session and asset screens to the typed API client without moving validation rules into React.

**Design decisions to revisit in this task:**
- Which session and asset facts belong in quick inspection surfaces versus full editing pages?
- How should campaign context remain visible while working inside sessions/assets so users do not lose orientation?
- Which parsed asset details should be exposed in asset detail views without surfacing parser internals too early?

### Task 9: Extraction pipeline contract and rules-based implementation

**Files:**
- Create: `backend/app/services/extraction/base.py`
- Create: `backend/app/services/extraction/rules.py`
- Create: `backend/app/api/extraction_jobs.py`
- Create: `backend/tests/test_extraction_rules.py`
- Create: `backend/tests/test_extraction_api.py`

**Steps:**
1. Define an extraction service interface that accepts parsed asset content and campaign context and returns candidate entities and relationships.
2. Implement a rules-based extractor that targets obvious named entities and simple relationships from curated sample notes and spreadsheet-derived structure.
3. Add extraction job and extraction candidate persistence.
4. Expose API endpoints to start an extraction job and fetch its candidates.
5. Add tests against fixed sample assets so the behavior is stable and demoable.

### Task 10: Candidate review and approval workflow backend

**Files:**
- Create: `backend/app/api/extraction_review.py`
- Create: `backend/app/services/review_service.py`
- Create: `backend/tests/test_candidate_review.py`

**Steps:**
1. Implement endpoints to approve, reject, or edit extraction candidates.
2. Persist approved candidates as canonical entities and relationships.
3. Preserve provenance from the source asset and extraction job.
4. Add tests for approve, reject, edit, and duplicate-name review paths.

### Task 11: Extraction review frontend

**Files:**
- Create: `frontend/src/pages/ExtractionReviewPage.tsx`

**Steps:**
1. Add a view to trigger extraction jobs from stored source assets.
2. Show candidate entities and relationships with their source context.
3. Add approve, reject, and edit actions wired to the review endpoints.
4. Verify the extraction-to-review flow works visually from raw text through approved records.

**Design decisions to revisit in this task:**
- Should extraction review expose quick-look side panels so users can compare a candidate against existing records without leaving the review queue?
- Which candidate fields should be editable inline versus requiring a dedicated edit surface?

### Task 12: Search backend

**Files:**
- Create: `backend/app/api/search.py`
- Create: `backend/app/services/search_service.py`
- Create: `backend/tests/test_search.py`

**Steps:**
1. Implement PostgreSQL full-text search over entity names, summaries, sessions, and parsed source asset text.
2. Return grouped results for entities, sessions, and source assets.
3. Add campaign filtering to search queries.
4. Add tests for keyword hits and empty-result behavior.

### Task 13: Search frontend

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

### Task 14: Demo polish and documentation

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
- parse failure, retry, and stale-cache invalidation behavior

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

- v1 is a single-user local-first app.
- Auth is deferred but schema and APIs leave room for it later.
- Extraction quality can be modest if the review loop is solid.
- Search schema and indexing are intentionally deferred from Task 3 until search work starts.
- Backend parsing is canonical.
- Original uploaded assets live outside Postgres in backend-managed storage.
- Large parsed outputs may live outside Postgres while small outputs stay inline in the parse cache.
