# Schema Reasoning For V1

This document explains the main schema decisions currently reflected in the v1 planning docs.

## Why The Schema Stays Small

The current milestone is meant to prove the core workflow:

- store campaign data
- ingest text
- extract candidate structure
- require review before canonical persistence
- support later search

The schema should support that workflow without pretending the domain model is already stable. That means preferring boring relational tables with a few flexible `JSONB` fields over subtype tables, dynamic configuration tables, or early infrastructure for future features.

## Why We Use UUID Primary Keys

UUIDs were chosen for all primary keys to keep identifiers stable across future export, sync, and local-first evolution. `BIGINT` would have been simpler in the short term, but UUIDs reduce later migration pressure and are still straightforward for this scale.

## Why `owners` Exists Even Though Auth Is Deferred

The product is still single-user in v1, but the schema keeps an `owners` table so campaigns already have a future auth and tenancy anchor. The current assumption is one seeded local owner row rather than full auth flows.

## Why `sessions` And `source_assets` Are Separate

There was an important terminology correction during planning:

- `sessions` represents an actual game session in the campaign timeline
- `source_assets` represents uploaded evidence or source artifacts

This matters because a session is not just a blob of text; it is a real event in the campaign. The uploaded artifacts about that session belong in `source_assets`, optionally linked back to a `sessions` row.

This model also lets a session have multiple attached assets, such as player notes, GM recap text, a cleaned-up summary, a spreadsheet, or a map image.

## Why `source_assets` Stores Truth Status Instead Of Document Genre

The early idea of `document_kind` was too focused on file category. The more important distinction for this product is whether a source text is treated as:

- canonical
- uncertain
- subjective

That matches the actual tabletop use case better than labels like `session_note` or `reference`, because the workflow depends on whether the asset should be treated as reliable world truth or only as evidence that needs interpretation.

## Why Original Binaries Are Stored Outside The Database

Images, spreadsheets, and other uploaded binaries should not be stored as Postgres blobs by default.

Reasoning:
- large binary data bloats the relational database and backups
- local filesystem storage is simpler for the current local-first deployment
- a storage abstraction keeps the future path to object storage open
- PostgreSQL is better used for metadata, provenance, and queryable derived content

So the intended v1 split is:
- original binary file in backend-managed storage
- asset metadata in PostgreSQL

## Why Extraction Jobs And Candidates Are Separate

The extraction workflow needs two different concepts:

- a record of each extraction run
- a set of reviewable proposed facts produced by that run

`extraction_jobs` stores run history, extractor kind, status, and completion timing. `extraction_candidates` stores reviewable proposed entities or relationships. This separation preserves rerun history and keeps review state distinct from canonical world data.

## Why Candidates Use One Generic Table

A single `extraction_candidates` table was chosen instead of separate candidate tables for entities and relationships. That keeps the review flow simpler in v1:

- one review queue
- one approval or rejection workflow
- easier evolution of extraction output while the rules-based extractor is still changing

`candidate_type` plus a structured `payload` is enough for the first milestone.

## Why `entities` Stays Generic

The current product needs one canonical record model for people, places, factions, items, and other world concepts. Separate subtype tables would be more rigid and would slow iteration while the domain model is still being learned. A generic `entities` table with:

- `type`
- `name`
- `summary`
- `metadata`

is the right compromise for v1.

## Why Relationships Stay As Directed Rows

Relationships are stored in the `entity_relationships` table as directed assertions using:

- `source_entity_id`
- `target_entity_id`
- `relationship_type`

This supports both one-way relationships like `lives_in` and symmetric semantics like `sibling_of` without duplicating rows. Symmetry and reverse-language handling stay in backend code rather than in extra schema tables for v1.

## Why Parsed Asset Content Is Cached Separately

The app needs a place to cache parsed asset output without forcing every asset row to hold large text or structured payloads directly.

That cache is separate because:
- the original asset and the parse result have different lifecycles
- parse results may need invalidation when parser code changes
- the same asset may later need different parser kinds
- cached parse output can be reused for extraction, preview, and search

The intended reuse key in v1 is:
- `asset_id`
- `parser_kind`
- `parser_version`
- `source_checksum`

## Why Parsing Is Lazy But Cached

Always parsing on upload wastes work for assets that may never be searched or extracted. Parsing from scratch every time wastes work in the opposite direction.

The chosen compromise is:
- upload and store the asset first
- keep ordinary asset metadata reads cheap
- parse on first real parse-dependent consumer need such as preview, search, or extraction
- cache the parse result
- invalidate when the source checksum or parser version changes

This keeps parsing backend-owned and reusable without paying the cost for every uploaded file immediately.

The related API contract choice is:
- do not add a public manual parse endpoint in v1
- let parse-dependent flows trigger parsing implicitly
- keep normal asset list/detail reads from doing hidden parse work

## Why Parsed Cache Storage Is Hybrid

Not all parse results should be stored inline in PostgreSQL.

Reasoning:
- small text or compact structured fragments are convenient to keep inline
- large structured output from spreadsheets or rich documents can bloat rows
- storage-backed derived artifacts are a better fit for larger payloads

So the parse cache should be hybrid:
- small outputs inline in the database
- large outputs in storage, referenced from the database

The threshold should be configurable in backend settings rather than fixed only by code constants.

## Why Parse Results Keep History Instead Of One Mutable Row

The cache should not behave like a single mutable blob attached to the asset.

Reasoning:
- parser version changes matter
- file checksum changes matter
- failed parses and prior successful parses are useful debugging signals
- future extraction and search work will depend on predictable parse reuse rules

So the intended direction is:
- keep parse-result rows keyed by `asset_id + parser_kind + parser_version + source_checksum`
- reuse a matching successful parse result when available
- prune superseded cache rows and derived artifacts by policy rather than overwriting history blindly

## Why Controlled Vocabularies Stay In Backend Code

For `entities.type`, `entity_relationships.relationship_type`, and `source_assets.truth_status`, the agreed choice was:

- store plain text in the database
- validate allowed values in backend code

This is less strict than DB constraints or dedicated lookup tables, but it keeps v1 easier to evolve while the vocabulary is still being discovered. The design leaves room to add stricter DB enforcement later if the vocabularies stabilize.

## Why Search Schema Work Is Deferred

The original plan placed PostgreSQL full-text search columns and indexes in Task 3. That is now intentionally deferred. The schema task should focus first on the core canonical and evidence tables. Search-specific vectors and indexes can be added when the search task is implemented, once the final searchable fields are clearer.

## Why Kanka Is Removed From The Initial Schema Plan

Kanka export was deprioritized because it is not central to validating the main product workflow and may never be implemented. Keeping it in the initial schema would add tables and assumptions for a feature that is no longer part of the current critical path. The v1 schema now focuses only on campaign data, source text, extraction, review, and canonical persistence.
