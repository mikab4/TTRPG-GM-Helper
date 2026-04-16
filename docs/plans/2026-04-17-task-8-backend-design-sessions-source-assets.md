# Backend Design Plan For Task 8: Sessions, Source Assets, And Hybrid Parsed Cache

## Summary

This task replaces the current text-only `session_notes + source_documents` shape with a broader backend-owned ingestion model that supports:

- `sessions` as campaign timeline records
- `source_assets` as uploaded source artifacts
- backend-managed storage for original files
- lazy backend parsing with reusable cached parse results
- hybrid parse-output storage:
  - small parsed outputs inline in Postgres
  - large parsed outputs in storage with DB pointers

This is the active plan for the `add_documents_support` branch. The earlier March v1 plan is background context only.

## Current State

The repo already has:

- backend and frontend app skeletons
- Alembic migrations and PostgreSQL-backed test infrastructure
- campaign, entity, and relationship CRUD
- current schema/models for:
  - `session_notes`
  - `source_documents`
  - `extraction_jobs`
  - `extraction_candidates`
- provenance fields on entities and relationships that currently point to `source_documents`

This task is therefore a compatibility reshape, not greenfield scaffolding.

## Target Model

### Domain split

- `sessions` represent campaign timeline events.
- `source_assets` represent uploaded evidence or reference artifacts.
- A `source_asset` may optionally link to one `session`.
- Provenance for extracted and approved records continues to point to the originating asset.

### Persistence

Rename and reshape the current persistence model to this target:

- `sessions`
  - rename from `session_notes`
  - keep timeline-oriented fields such as `session_number`, `session_label`, `played_on`, `summary`

- `source_assets`
  - rename from `source_documents`
  - replace `session_note_id` with `session_id`
  - remove `raw_text` from the main row
  - add:
    - `media_type`
    - `original_filename`
    - `file_size_bytes`
    - `checksum`
    - `storage_key`
    - `parse_status`
    - `last_parsed_at`
  - keep:
    - `campaign_id`
    - `title`
    - `truth_status`
    - `metadata`
    - timestamps

- `asset_parse_results`
  - new table
  - columns:
    - `id`
    - `asset_id`
    - `parser_kind`
    - `parser_version`
    - `source_checksum`
    - `parse_status`
    - `inline_raw_text` nullable
    - `inline_structured_content` nullable JSONB
    - `artifact_storage_key` nullable
    - `artifact_size_bytes` nullable
    - `warnings` JSONB not null default `[]`
    - `error_message` nullable
    - `parsed_at`
  - one row per unique `(asset_id, parser_kind, parser_version, source_checksum)`

### Controlled values

New controlled fields must use the repo's existing `StrEnum` plus schema-normalization pattern, not raw strings scattered through services and tests.

Add enum-backed values for:

- asset truth status
- asset parse status
- asset parser kind
- parse result status
- supported media families if the backend constrains them in v1

## Migration Strategy

Use an in-place compatibility migration. Do not reset the database and do not keep permanent legacy aliases.

### Migration requirements

1. Rename `session_notes` to `sessions`.
2. Rename `source_documents` to `source_assets`.
3. Rename foreign-key columns and constraints that still use `session_note` / `source_document` terminology.
4. Add the new asset metadata columns.
5. Add `asset_parse_results`.
6. Backfill one parse-result row for every existing `source_document` row:
   - move current `raw_text` into `asset_parse_results.inline_raw_text`
   - mark the backfilled parse row with a deterministic parser kind/version for legacy text documents
   - set `source_checksum` from migrated asset checksum logic
7. Update provenance-bearing relations to point at `source_assets`:
   - entities
   - relationships
   - extraction jobs
8. Preserve existing IDs so provenance links remain stable across the rename.
9. Remove the main-row `raw_text` column only after the backfill is complete.

### Migration invariants

- Existing entity and relationship provenance must still resolve after migration.
- Existing extraction jobs must still point at the correct asset.
- Cross-campaign ownership protections must remain enforced.
- Existing data must stay queryable through the new model names without a manual data reset.

## Storage And Parsing Contract

### Storage

- Original uploaded files are always stored outside Postgres in backend-managed storage.
- Use one storage backend abstraction:
  - local filesystem implementation now
  - future object storage implementation later
- Parsed artifacts larger than inline thresholds also use that storage backend.

### Parsing

- Parsing is backend-owned and canonical.
- Parsing is implicit only. There is no public `POST /assets/{id}/parse` endpoint in v1.
- Parsing may be triggered only by parse-dependent reads:
  - extraction
  - search
  - preview or parsed-content inspection flows
- Ordinary asset metadata reads must not trigger parsing.

### Parse-result lifecycle

- On a parse-dependent read:
  - find a reusable parse result by `(asset_id, parser_kind, parser_version, source_checksum)`
  - return it if present
  - otherwise parse, persist, and return the new result
- Keep parse-result history instead of overwriting one mutable row.
- Add stale-cache cleanup rules:
  - superseded parse rows and derived artifacts may be pruned
  - never prune the latest successful reusable parse row for an asset/parser pair
  - never delete data still needed for provenance or current feature behavior

### Parse storage thresholds

The inline-vs-storage decision must be configurable in backend settings:

- `PARSE_INLINE_TEXT_MAX_BYTES`
- `PARSE_INLINE_STRUCTURED_MAX_BYTES`
- `PARSE_INLINE_TOTAL_MAX_BYTES`

Rules:

- decide by serialized payload size, not record-count heuristics
- if either text or structured content exceeds the configured thresholds, store the derived artifact outside Postgres and persist only metadata plus storage pointer
- document defaults in config and README

### Parser behavior by asset family

- text documents:
  - produce reusable raw text
  - may also produce light structure
- spreadsheets:
  - produce structured table-oriented content
  - also produce derived text usable by extraction and search
- images:
  - are storable in v1
  - do not require parse output in v1

## API Contract

### Sessions

- `POST /campaigns/{campaign_id}/sessions`
- `GET /campaigns/{campaign_id}/sessions`
- `GET /campaigns/{campaign_id}/sessions/{session_id}`
- `PATCH /campaigns/{campaign_id}/sessions/{session_id}`
- `DELETE /campaigns/{campaign_id}/sessions/{session_id}`

### Assets

- `POST /campaigns/{campaign_id}/assets`
  - multipart upload
  - may link to an existing session via `session_id`
  - must not create a session inline
- `GET /campaigns/{campaign_id}/assets`
- `GET /campaigns/{campaign_id}/assets/{asset_id}`
- `PATCH /campaigns/{campaign_id}/assets/{asset_id}`
- `DELETE /campaigns/{campaign_id}/assets/{asset_id}`

### Frontend orchestration rule

The frontend may still present one combined form for:

- creating a session and uploading an asset
- uploading an asset without a session
- linking an asset to an existing session

When the user chooses "new session", the frontend should:

1. call `POST /sessions`
2. use the returned `session_id` in `POST /assets`

Do not add a special combined backend command endpoint in this task.

## Backend Structure

Keep the service shape small.

### Top-level boundaries

- one storage backend abstraction
- one asset workflow service that owns:
  - upload flow
  - asset metadata persistence
  - parse-result lookup
  - parse invocation
  - storage-mode choice
  - cleanup/compensation paths

### Internal helpers under the asset workflow

- parser modules by asset family
- parse serialization helpers
- stale-cache pruning helpers

Do not introduce a separate top-level parse service yet. If later tasks produce multiple independent callers with enough separate policy, that boundary can be extracted then.

### Loading rules

- do not eager-load parse-result history on ordinary asset queries
- fetch parse-result history explicitly only in paths that need it

## Error Handling And Failure Behavior

The implementation must explicitly handle split-brain cases between filesystem/object storage and the database.

Required behavior:

- if original file storage succeeds but DB persistence fails:
  - clean up the stored file, or mark it recoverable and invisible to normal reads
- if DB row creation succeeds but derived parse artifact storage fails:
  - persist a visible failed parse status and error detail
  - do not pretend the asset parsed successfully
- if parsing fails:
  - expose a visible failed parse status
  - retain useful error detail
  - allow a later successful retry path to clear stale failure state correctly
- if a file changes or parser version changes:
  - do not reuse stale parse output

## Implementation Sequence

### 1. Schema and model reshape

- add enum-backed value types needed for assets and parse results
- rename `SessionNote` -> `Session`
- rename `SourceDocument` -> `SourceAsset`
- add `AssetParseResult`
- update model relationships and foreign keys
- write the in-place Alembic migration and backfill

### 2. Backend asset/session contracts

- add session CRUD routes and schemas under the new naming
- add asset CRUD/upload routes and schemas
- update extraction-facing relations and provenance references to the new asset model

### 3. Storage and parse workflow

- add the storage backend abstraction
- implement local filesystem storage
- implement asset workflow service
- implement parser helpers for text documents and spreadsheets
- add parse-result selection, persistence, and pruning behavior

### 4. Frontend integration

- update frontend contracts to use `sessions` and `assets`
- implement the one-form orchestration flow as two API calls when session creation is needed
- expose parse status clearly
- keep ordinary asset reads cheap; parse-dependent UI should be the only caller that triggers parsing

### 5. Documentation sync

Update all source-of-truth docs that still describe the old shape:

- `README.md`
- `docs/plans/2026-03-31-rpg-gm-helper-v1.md`
- `docs/plans/2026-03-31-rpg-gm-helper-v1-reasoning.md`
- `docs/schemas.md`
- `docs/schema-reasoning.md`

## Test Plan

### Migration and regression tests

- migration creates the expected renamed tables and new parse-results table
- existing `source_document` rows migrate to `source_assets` plus backfilled `asset_parse_results`
- existing provenance from entities and relationships still resolves after migration
- existing extraction jobs still point at the correct asset after migration
- cross-campaign foreign-key protections still hold after the rename

### Backend API and model tests

- session CRUD works independently of assets
- asset upload stores original file metadata correctly
- asset can link to an existing session
- asset rejects cross-campaign session links
- unsupported media types or corrupt uploads fail clearly
- asset list/detail reads do not trigger parsing

### Parse workflow tests

- parse cache miss triggers parse and persistence
- reusable parse result is selected by checksum and parser version
- checksum change invalidates stale parse reuse
- parser version change invalidates stale parse reuse
- small parsed outputs stay inline
- large parsed outputs go to storage with DB metadata pointer
- parse failure sets visible failed status and stores error detail
- later successful retry clears stale failure state correctly
- stale-cache pruning removes superseded cache rows and artifacts according to policy
- parse-result history selection returns the latest reusable successful row

### Split-brain and compensation tests

- original file written but DB write fails
- DB row exists but derived artifact write fails
- cleanup or recoverable error handling leaves the system in a non-silent state

### Frontend integration coverage

- one-form flow:
  - create session then upload/link asset
  - upload asset without session
  - upload asset linked to existing session
- partial-success case:
  - session creation succeeds
  - asset upload fails
  - user sees a clear recoverable state

## ASCII Flow Diagram

```text
ASSET INGESTION AND PARSE FLOW
==============================
user submits asset form
        |
        +--> optional frontend call: POST /sessions
        |          |
        |          +--> session_id
        |
        +--> POST /assets multipart
                   |
                   +--> store original file
                   |
                   +--> persist source_asset row
                   |
                   +--> later parse-dependent read
                              |
                              +--> reusable parse result exists?
                              |         |
                              |         +--> yes: return cached result
                              |         |
                              |         +--> no: parse source asset
                              |                    |
                              |                    +--> small payload -> inline DB
                              |                    |
                              |                    +--> large payload -> derived artifact storage + DB pointer
                              |
                              +--> extraction/search/preview consume parse result
```

## Not In Scope

- public manual parse endpoint in v1
- combined backend endpoint that atomically creates a session and uploads an asset
- audio/video parsing
- permanent compatibility aliases that keep `SessionNote` / `SourceDocument` alive in the codebase
- promoting parsing to a dedicated top-level service before later tasks prove that need

## Worktree Parallelization

| Step | Modules touched | Depends on |
|------|-----------------|------------|
| Schema + migration reshape | `backend/alembic/`, `backend/app/models/` | — |
| Asset/session API + schemas | `backend/app/api/`, `backend/app/schemas/` | Schema + migration reshape |
| Storage + parse workflow | `backend/app/services/`, config/storage modules | Schema + migration reshape |
| Backend regression and workflow tests | `backend/tests/` | Schema + migration reshape |
| Frontend session/asset flow | `frontend/src/` | Asset/session API + schemas |

Parallel execution:

- run schema/migration first
- once schema contracts stabilize:
  - backend API/schemas
  - storage/parse workflow
  - backend tests
  can proceed in parallel with careful coordination
- frontend can start after the new API contract settles

Main conflict risk:

- backend API work and storage/parse workflow both touch service-layer modules, so those lanes need explicit ownership or sequential integration
