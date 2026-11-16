# Cloud-Ready Asset Intelligence Pipeline Implementation Plan

**Applies to:** asset storage, asynchronous processing, parsing, extraction, and processing-job recovery
**Related code:** `backend/app/services/asset_*`, `backend/app/models/`, `processor/`, `compose.yaml`
**Deferred design triggers:** None

**Goal:** Build a real `.txt` asset-processing vertical slice immediately to learn Redis, MongoDB, MinIO/S3-compatible storage, and one worker-service boundary; then harden and extend that same path into a multilingual, model-ready pipeline.

**Architecture:** FastAPI and PostgreSQL own canonical workflow data. One `asset-processor` worker consumes jobs from Redis Streams, reads originals from MinIO through an S3-compatible storage interface, writes versioned parsed-document projections to MongoDB, and reports idempotent outcomes to FastAPI. Docker Compose runs every dependency locally; authentication, tenancy, and cloud deployment are deferred.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, PostgreSQL, Redis Streams, MongoDB, MinIO/S3 API, Docker Compose, React, TypeScript, pytest, Mongo/Redis Python clients.

---

## Deliberate scope change

This document is the detailed implementation breakdown for Tasks 9–12 in `docs/plans/2026-03-31-rpg-gm-helper-v1.md`. The original synchronous, PostgreSQL-only path was a sound v1 delivery choice. This approved follow-up intentionally adds infrastructure while keeping the source plan's durable product rules.

- PostgreSQL is authoritative for asset metadata, job lifecycle, candidates, approvals, entities, relationships, campaign ownership, and provenance.
- MinIO/S3 owns original assets and optional large artifacts. No code outside the storage adapter relies on local paths.
- MongoDB is a rebuildable, versioned parsed-document projection—not a second canonical campaign database.
- Redis is a work-transport mechanism—not the source of truth for jobs.
- The frontend is thin and never owns parse, extraction, approval, or persistence rules.
- There is one independent worker service, not separate asset, parser, extractor, and review microservices.

Out of scope: public accounts, authorization, multi-tenant enforcement, production cloud deployment, semantic search, automatic canonical writes by an LLM, and a separate model-serving service.

## First vertical slice: real but deliberately narrow

The first end-to-end behavior accepts only a real `.txt` upload:

```text
Upload .txt → MinIO → Postgres processing job → Redis Stream
      → asset-processor → Mongo parsed document → FastAPI callback → completed job
```

It does not fake asset data or introduce an in-process queue. It deliberately postpones PDF, spreadsheets, images, DOCX/ODT, language detection, candidate extraction, retries, outbox delivery, and elaborate UI work.

The contracts must nevertheless be format-neutral from day one:

```text
ParsedDocument
  asset_id, source_checksum, parser_kind, parser_version
  sections[]: kind, text, optional structure, source location, language hints
```

For `.txt`, `sections` contains one paragraph-like section. Later formats add section kinds and optional structure without changing the job, storage, API, or provenance contracts.

## Delivery order

### Task 1: Run the future production dependencies locally

**Files:**
- Modify: `compose.yaml`
- Modify: `.env.example`
- Modify: `backend/.env.example`
- Modify: `backend/pyproject.toml`
- Modify: `backend/app/config.py`
- Create: `backend/tests/test_runtime_dependencies.py`
- Modify: `README.md`

**Steps:**
1. Write a failing settings test for configurable Redis, MongoDB, MinIO endpoint, S3 bucket, and processor callback secret values.
2. Add Redis, MongoDB, and MinIO services with named volumes, health checks, and local credentials to Compose and environment templates.
3. Add pinned backend dependencies for Redis, MongoDB, and the S3 API through `uv`.
4. Add typed configuration without connecting during import; add safe readiness diagnostics for dependencies.
5. Verify Compose starts all services and backend settings tests pass; commit `chore: add local processing dependencies`.

### Task 2: Deliver the `.txt` asset-processing learning spine

**Files:**
- Modify: `backend/app/services/asset_storage.py`
- Modify: `backend/app/services/asset_service.py`
- Create: `backend/alembic/versions/<revision>_processing_jobs.py`
- Create: `backend/app/models/processing_job.py`
- Create: `backend/app/services/processing_job_service.py`
- Create: `backend/app/api/routes/processing_jobs.py`
- Create: `backend/app/api/routes/internal_processing.py`
- Create: `backend/app/schemas/processing_jobs.py`
- Create: `backend/app/schemas/internal_processing.py`
- Create: `processor/Dockerfile`
- Create: `processor/pyproject.toml`
- Create: `processor/app/main.py`
- Create: `processor/app/consumer.py`
- Create: `processor/app/document_store.py`
- Create: `processor/tests/test_txt_vertical_slice.py`
- Create: `backend/tests/test_processing_jobs_api.py`
- Modify: `compose.yaml`

**Steps:**
1. Write an end-to-end failing test: upload a small `.txt` asset, start one processing job, consume its Redis message, store its actual text in MongoDB, submit completion through FastAPI, and read `completed` status through the public API.
2. Replace the Compose local-filesystem assumption with a minimal S3/MinIO asset adapter. Preserve opaque `storage_key`, checksum, and streaming upload; do not expose paths to the worker.
3. Add a minimal PostgreSQL `processing_jobs` table with job ID, asset ID, source checksum, parser kind/version, status, timestamps, and diagnostic. The job ID is canonical even in this first slice.
4. Publish a job reference to one Redis Stream only after creating its Postgres job. This temporary direct publish is intentionally marked for replacement by the transactional outbox in Task 3.
5. Implement the separate processor as a Redis consumer-group member. It fetches the object from MinIO, builds one Unicode-preserving text section, writes a Mongo document keyed by `(asset_id, source_checksum, parser_version)`, and calls an internal authenticated completion endpoint.
6. Make completion idempotent and ensure duplicate Redis delivery does not create a second canonical job result. Acknowledge the message only after accepted completion.
7. Expose a small public status endpoint and a minimal frontend asset action/status indicator if existing asset UI can accommodate it without a new route abstraction.
8. Run focused API, processor, Mongo, Redis, and Compose smoke tests; commit `feat: process text assets through worker pipeline`.

### Task 3: Make the initial job path durable with an outbox and retryable dispatch

**Files:**
- Create: `backend/alembic/versions/<revision>_processing_outbox.py`
- Create: `backend/app/models/outbox_event.py`
- Create: `backend/app/infrastructure/redis_streams.py`
- Create: `backend/app/maintenance/publish_processing_outbox.py`
- Modify: `backend/app/services/processing_job_service.py`
- Modify: `compose.yaml`
- Create: `backend/tests/test_processing_outbox_publisher.py`

**Steps:**
1. Write failing tests for the failure window where the database commits but Redis is unavailable.
2. Write the processing job and an outbox event in one Postgres transaction; only the relay publishes to Redis.
3. Add a separate bounded outbox-relay process to Compose. Mark an event sent only after Redis confirms it; retain event IDs for consumer deduplication.
4. Add a replay command and delivery-lag diagnostics.
5. Verify Redis outage/restart recovery; commit `feat: reliably dispatch processing jobs`.

### Task 4: Harden worker delivery, result acceptance, and asset deletion

**Files:**
- Modify: `processor/app/consumer.py`
- Modify: `backend/app/services/processing_job_service.py`
- Modify: `backend/app/services/asset_service.py`
- Create: `backend/app/maintenance/retry_processing_jobs.py`
- Create: `backend/app/maintenance/reconcile_processing_state.py`
- Create: `backend/tests/test_processing_job_recovery.py`
- Create: `processor/tests/test_failure_recovery.py`

**Steps:**
1. Write failure-injection tests for worker crash after claim, duplicate delivery, Mongo failure, callback timeout, cancellation, and deletion while processing.
2. Add explicit retry classes, attempt counters, delayed retry records, and terminal failure states in Postgres. Use a Redis dead-letter stream only for exhausted transport messages; Postgres remains authoritative.
3. Request cancellation before asset deletion; workers check it between phases. Reconcile derived Mongo cleanup only after canonical state permits deletion.
4. Extend the existing asset-delete maintenance flow to include processing jobs and derived projections.
5. Add a periodic maintenance trigger and claim stale deleting-asset rows before external cleanup, using bounded batches and `FOR UPDATE SKIP LOCKED` (or an equivalently explicit lease) so concurrent runners do not duplicate work.
6. Add correlation IDs and structured logs without raw asset contents or credentials; commit `feat: harden processing recovery`.

### Task 5: Generalize parsing to a multilingual, format-neutral contract

**Files:**
- Create: `processor/app/parsing/base.py`
- Create: `processor/app/parsing/text.py`
- Create: `processor/app/language.py`
- Create: `processor/tests/test_parsing_text.py`
- Create: `processor/tests/fixtures/`
- Modify: `processor/app/document_store.py`

**Steps:**
1. Write tests using English-only, Hebrew-only, and mixed-language text fixtures.
2. Formalize `ParsedDocument` and `ParsedSection`; preserve Unicode exactly, maintain stable source locations, and retain explicit language hints separately from detector output.
3. Make whole-document language detection optional and advisory: mixed-language assets must not be forced into one language.
4. Move Task 2's inline text parser behind the contract without changing job or callback behavior.
5. Run parser and worker regression tests; commit `feat: add multilingual parsed document contract`.

### Task 6: Add the baseline extraction and human-review workflow

**Files:**
- Create: `processor/app/extraction/base.py`
- Create: `processor/app/extraction/rules.py`
- Create: `backend/app/api/routes/extraction_review.py`
- Create: `backend/app/services/candidate_review_service.py`
- Create: `backend/tests/test_extraction_result_service.py`
- Create: `backend/tests/test_candidate_review.py`
- Create: `frontend/src/api/extractionReview.ts`
- Create: `frontend/src/routes/CampaignCandidateReviewTab.tsx`
- Create: `frontend/src/routes/__tests__/campaign-candidate-review-tab.test.tsx`

**Steps:**
1. Write failing rules-extraction tests against structured text sections and fixed sample notes.
2. Define result contracts carrying extractor kind/version, confidence, and Unicode-safe provenance excerpt/span.
3. Persist candidates in PostgreSQL through idempotent worker-result submission; the worker does not write canonical entities or relationships.
4. Add approval, rejection, and edit-before-approve API/service flows. Approval calls canonical backend services and keeps asset/job/parser/extractor provenance.
5. Add a focused campaign review UI; commit `feat: review extracted candidates`.

### Task 7: Make extraction model-ready without prematurely choosing a provider

**Files:**
- Create: `processor/app/extraction/model.py`
- Modify: `processor/app/extraction/base.py`
- Modify: `backend/app/models/extraction.py`
- Modify: `backend/app/services/candidate_review_service.py`
- Create: `processor/tests/test_model_extractor_contract.py`
- Create: `backend/tests/test_model_provenance.py`

**Steps:**
1. Write contract tests for a model extractor without calling an external model provider.
2. Add provider/model identifier, model version, prompt/template version, and language hints to candidate provenance.
3. Classify provider throttling/transient failures separately from invalid requests and unsupported capabilities.
4. Keep the rules extractor as a deterministic baseline, fixture oracle, and fallback. Do not allow any extractor to bypass human review.
5. Run extraction/provenance tests; commit `feat: make extraction model-ready`.

### Task 8: Add supported parser formats incrementally

**Files:**
- Create: `processor/app/parsing/spreadsheet.py`
- Create: `processor/app/parsing/pdf.py`
- Create: `processor/tests/test_parsing_spreadsheet.py`
- Create: `processor/tests/test_parsing_pdf.py`
- Modify: `backend/app/services/asset_service.py`
- Modify: `backend/tests/test_assets_api.py`

**Steps:**
1. Add CSV/XLSX parsing first: represent sheets/tables in `sections[].structure` and produce derived text for extraction.
2. Add PDF parsing next: represent pages and paragraphs in the same section contract.
3. Add tests for source locations, Unicode preservation, warnings, unsupported/corrupt inputs, and versioned Mongo projection reuse.
4. Leave images storable but deterministically unparsed until OCR is intentionally planned.
5. Run parser, API, and end-to-end pipeline coverage; commit one parser format at a time.

### Task 9: Add safe DOCX/ODT processing only after the parser boundary is proven

**Files:**
- Create: `processor/app/parsing/office_package.py`
- Create: `processor/app/parsing/docx.py`
- Create: `processor/app/parsing/odt.py`
- Create: `processor/tests/test_office_package_security.py`
- Create: `processor/tests/test_parsing_docx.py`
- Create: `processor/tests/test_parsing_odt.py`
- Modify: `backend/app/services/asset_service.py`
- Modify: `backend/tests/test_assets_api.py`

**Steps:**
1. Write security tests that reject encrypted packages, unsafe/duplicate ZIP paths, unsupported compression, excessive member count, oversized expansion, and dangerous compression ratios.
2. Implement bounded package inspection before parser selection; validate DOCX OPC metadata and ODT mimetype/manifest rather than trusting MIME type alone.
3. Map headings, paragraphs, and tables to the established section contract and make semantic failures visible terminal job outcomes.
4. Extend upload support only after parser safety tests pass; commit `feat: safely process DOCX and ODT assets`.

### Task 10: Document operations and future hosted multi-user seams

**Files:**
- Modify: `README.md`
- Create: `docs/operations/asset-intelligence-local-runbook.md`
- Create: `docs/operations/asset-intelligence-failure-recovery.md`
- Modify: `docs/plans/2026-08-08-cloud-ready-asset-intelligence-pipeline-reasoning.md`
- Modify: `docs/technical_debt.md`
- Modify: `docs/deferred_design_options.md`

**Steps:**
1. Document Compose startup, dependency inspection, outbox replay, consumer recovery, dead-letter diagnosis, Mongo rebuild, and safe teardown.
2. Record why Postgres is canonical, Mongo is rebuildable, and the worker is the only new service boundary.
3. Remove paid-down technical debt and preserve trigger-based future concerns as deferred design options.
4. Document—without implementing—the auth/tenant migration seams: tenant-aware object keys, job correlation, service authentication rotation, and authorization requirements.
5. Run the complete backend, processor, frontend, and Compose verification suite; commit `docs: document asset intelligence operations`.

## Verification gates

Each task requires focused tests before the next. Before the track is declared complete, run:

```bash
cd backend && uv run ruff format --check && uv run ruff check && uv run pytest
cd frontend && npm run lint && npm run format:check && npm run build && npm test -- --run
docker compose up --build
```

Also execute a Compose end-to-end scenario: upload a mixed Hebrew/English text file; observe Redis-to-worker processing; verify a Mongo projection; simulate one retry; review candidates; and confirm only explicit approval writes canonical PostgreSQL records.

## Learning checkpoints

- After Task 2: trace one real `.txt` asset across MinIO, Postgres, Redis, the worker, MongoDB, and the callback API.
- After Task 3: explain the database-to-queue failure window and transactional outbox.
- After Task 4: demonstrate duplicate delivery and a worker crash without duplicate canonical effects.
- After Task 5: explain Unicode preservation, language hints, and why mixed-language detection is not definitive.
- After Task 7: explain model/prompt version provenance and why model output stays reviewable.
