# RPG GM Helper V1 Decision Reasoning

**Applies to:** overall product architecture, technology choices, ingestion, extraction, search, and deferred scope
**Related code:** `backend/`, `frontend/`, `docs/mockups/workspace-v1.html`, `compose.yaml`
**Deferred design triggers:** World-owned reusable assets: the tenant level (campaign, owner, or world) must be decided before Task 13 adds membership and before Task 14 adds embedding tables

## Purpose And Current Decision State

The product must help a Game Master turn campaign material into structured, reviewable, searchable records while preserving where each fact came from. It runs for one local GM today and is being built toward several users, with players who see only part of the campaign data. It is not trying to become a complete worldbuilding suite or an autonomous AI knowledge base.

Tasks 1–9 are implemented. Task 9 fixed the problems found in the 2026-11-16 review before the pipeline is built; the next step is Task 10. This reasoning document records the decisions that still govern the current plan; completed implementation details remain authoritative in code, migrations, tests, and archived task plans.

## Direction Change On 2026-11-16

The deferred option "AI-first PostgreSQL-only pipeline" was **activated**. The proposal written on 2026-11-11 replaced the MinIO, Redis Streams, MongoDB, and separate-worker pipeline; this section keeps its reasoning, and the proposal itself was deleted after adoption. The old detailed plan and its reasoning are archived under `docs/plans/archive/2026-08-08-cloud-ready-asset-intelligence-pipeline*.md`.

Two things changed since the old pipeline was approved:

| Change | Before | Now |
|--------|--------|-----|
| Learning goal | Infrastructure: Redis, MongoDB, MinIO, a worker service | AI engineering: LLM extraction, evals, RAG, later MCP and agents |
| Product direction | Single user on a local computer | Multiple users, with players who see only part of the campaign data |

The old reasoning already said the worker pipeline was "justified by the explicit infrastructure-learning goal, not by current scale" and named the PostgreSQL-only design as the cheaper alternative. With the learning goal gone, the justification is gone too.

| Technology | Decision | Reason |
|------------|----------|--------|
| MongoDB | Dropped | The data is relational. Access rules need joins and transactions. `asset_parse_results` already has JSONB and raw-text columns |
| MinIO / S3 | Deferred until hosting | Local disk works for one machine. `AssetStorage` is the place to plug S3 in |
| Redis Streams | Deferred | A PostgreSQL job row is enough until the queue is a bottleneck |
| Separate worker service | Deferred until hosting | Start as a backend module. Split it out when one user's slow job can hurt other users |
| Transactional outbox, dead-letter stream | Dropped | They coordinate PostgreSQL with Redis. Without Redis there is nothing to coordinate |
| pgvector | Added | Retrieval inside PostgreSQL, so access rules apply to it too |

The deferred infrastructure is recorded as "Hosted processing infrastructure" in `docs/deferred_design_options.md`.

"World-owned reusable assets" **remains deferred** but now has a deadline: the tenant level must be decided before Task 13. Moving the boundary later means migrating every table.

## Why A Modular Monolith Without A Separate Worker

Campaign CRUD, validation, review, and canonical writes belong together in FastAPI because they share one product workflow and one source of truth. Broad microservices would add deployment, failure, and coordination costs without corresponding team or ownership boundaries.

Parsing and extraction are slow, retryable, and failure-prone, so they must not run inside ordinary API requests. For one local user, a PostgreSQL job row and a backend background task give that isolation without a second service. On startup, jobs stuck in `running` are marked `failed` so they can be rerun.

The chosen shape is therefore:

- one FastAPI application for canonical domain and workflow behavior, including parsing and extraction modules;
- one PostgreSQL database for all state, including parsed sections, jobs, candidates, and embeddings;
- narrow adapters for file storage and model providers.

A separate worker with a queue was the previous design. It becomes justified again when the app is hosted and one user's slow job can hurt other users.

## Why PostgreSQL Is The Only Datastore

PostgreSQL is authoritative for campaigns, entities, relationships, sessions, assets, jobs, parsed sections, candidates, review decisions, provenance, membership, and visibility. Transactional constraints are especially valuable for campaign isolation and human-reviewed promotion of candidates.

Once players exist, every read must pass an access rule. Keeping parsed text and embeddings in the same database means one set of rules, enforced by joins and Row-Level Security, covers search and retrieval as well as CRUD. A second store would need its own copy of those rules and could leak text the rules were meant to hide.

Only original file bytes live outside PostgreSQL, behind `AssetStorage`.

## Where Schema Truth And Reasoning Live

The implemented relational schema is documented by the SQLAlchemy models, Alembic migrations, and tests. A handwritten table-and-column catalogue was rejected because it duplicated those sources and had already drifted from the implementation. Human-readable schema output should be generated from code or a live database when needed rather than maintained as another authority.

This reasoning document records only consequential choices that cannot be recovered reliably from the current schema: product meaning, ownership boundaries, trade-offs, and rejected alternatives. Routine additions such as columns, indexes, and nullable flags belong in models, migrations, and tests unless they change one of those decisions.

UUID primary keys preserve stable identity across exports, future synchronization, and local-first evolution. The `Owner` record remains a future authentication and tenancy anchor even though v1 seeds one local owner and does not implement public authentication. Integer identifiers and an implicit singleton owner would be simpler today, but would make those later boundaries more disruptive to introduce.

## Why The Backend Remains Python And The Frontend Uses TypeScript React

Python, FastAPI, and PostgreSQL protect delivery speed in the highest-risk areas: schema evolution, provenance, extraction workflow, and search. Python also fits later parsing and model experimentation.

React with TypeScript provides a useful typed client boundary and deliberate frontend learning without forcing a backend rewrite. The frontend stays separate and thin: routing, forms, API calls, and presentation belong there; business rules, parsing, review, and persistence do not.

A plain typed API client is enough. Heavy client-state or framework abstractions remain unjustified until repeated state coordination creates a concrete need.

## Why The Workspace Mockup Is Authoritative

`docs/mockups/workspace-v1.html` is the app designer's approved representation of the frontend. UI implementation must reproduce its visual and interaction decisions rather than treating it as loose inspiration. That includes composition, hierarchy, proportions, responsive intent, Inter/Cinzel typography, palette, spacing, borders, shadows, controls, button placement, and interaction states.

The mockup cannot specify product behavior that had not been designed when it was created. When an implemented requirement needs a missing route, section, tab, state, or error path, the gap must be surfaced to the responsible engineer with the smallest mockup-consistent proposal. Approval is required before implementation. The same approval rule applies to every deliberate visual difference, including seemingly minor color, font, spacing, sizing, or placement changes.

Approved differences are recorded in `docs/mockups/design-deviations.md` so implementation does not silently redefine the design and the mockup can be updated later when appropriate. Existing frontend differences predate this explicit authority and are not automatically approved; conformance is checked on touched surfaces unless a separate full audit is commissioned.

## Why Campaign Scope Is Explicit

Single-user does not mean single-campaign. Explicit `campaign_id` fields, campaign-scoped routes, and composite foreign keys prevent accidental cross-campaign links and preserve a future path to authorization.

The implemented schema already enforces campaign ownership for entity relationships, session/asset links, and provenance references. Future processing, extraction, review, and search contracts must preserve the same boundary rather than relying on UI context.

## Why One Generic Entity Model Remains Correct

People, places, organizations, items, events, deities, and miscellaneous records share identity, name, summary, campaign ownership, provenance, and timestamps. One `Entity` table keeps CRUD and relationships consistent while JSONB holds genuinely flexible metadata.

Stable concepts remain relational. JSONB is not a substitute for fields that need constraints, joins, or indexing. The implemented entity type is constrained rather than arbitrary free text, but richer type-specific forms and metadata contracts remain deferred until real use cases justify them.

Separate tables per entity kind would create duplicated endpoints, migrations, forms, and relationship logic before subtype behavior is known.

## Why Relationships Have Explicit Semantics And A Persisted Catalog

A free-text relationship label is too weak for reliable direction, filtering, and display. The implemented design combines:

- a relationship row with source, target, type, lifecycle, visibility, certainty, notes, confidence, and provenance;
- campaign-scoped relationship-type definitions with forward/reverse labels, symmetry, family, and allowed source/target entity types.

This supports GM-facing language without hard-coding every possible campaign vocabulary. The compatibility API exists because constraining previously free entity-type data required an explicit, reviewable migration rather than silent coercion.

## Why Sessions And Source Assets Are Separate

A session is a campaign event with a number or label, date, and summary. A source asset is evidence: a text file, spreadsheet, image, map, or other upload that may optionally relate to a session. Conflating them breaks down as soon as one session has multiple files or an asset is not session-specific.

The completed compatibility migration preserved existing `session_notes` and `source_documents` data while reshaping them into `sessions` and `source_assets`. Compatible migration was chosen over reset because existing campaign data must survive schema improvement.

## Why Asset Ingestion And Storage Are Backend-Owned

Backend ownership gives every caller the same validation, checksum, storage, lifecycle, and provenance behavior. Browser-side canonical parsing would produce inconsistent results across the UI and imports.

Original files do not belong in PostgreSQL blobs. Uploads and imports go through `backend/app/services/asset_storage.py`. Its local-filesystem backend stays until hosting. Callers never use paths, so an S3 backend can replace it without changing them. The boundary can only store and delete today; Task 10 adds reading and storing bytes that do not come from an upload.

Notes come from Google Docs and Google Sheets first, because that is where the real notes are. A live document can change, so every import saves a snapshot as a source asset and provenance points to that fixed version.

Asset metadata reads must never hide parsing or job submission. Processing is an explicit workflow with observable state.

## Why Parsing Is Asynchronous, Explicit, And Separate From Extraction

Parsing normalizes a file into reusable text and structure. Extraction interprets that representation and proposes campaign facts. Keeping them separate allows preview, search, and multiple extractor versions to reuse one parse while preserving debuggability and provenance.

The old lazy-parse-on-dependent-read design is rejected. It makes latency and failure surprising, couples cheap reads to expensive work, and obscures retry state. Processing instead starts from an explicit job.

Parsed sections are stored in `asset_parse_results`, versioned by parser kind, parser version, and source checksum. That uniqueness makes reruns idempotent and is the same pattern used to cache LLM results by checksum, model, and prompt version. An earlier revision of this document called the table compatibility groundwork and placed parsed documents in MongoDB; that is superseded.

Search and extraction consume parsed sections, not raw file containers. Raw bytes remain the preserved source artifact.

## Why Hardening Comes Before The Pipeline

The 2026-11-16 code and security review found a small set of correctness and schema problems: files left behind on campaign delete, races that return 500 instead of 409, a missing lock in the asset-delete trigger, free-text status columns, and over-eager loading of campaign collections. None is severe for one local user. All of them get more expensive once jobs, candidates, chunks, and membership are built on the same tables, so Task 9 fixes them first.

The model-versus-migration check matters most. The API tests run on SQLite with tables built from the models, so a forgotten migration can pass the whole suite. The pipeline adds several migrations in a row.

The asset-delete trigger takes `FOR KEY SHARE`, not the `FOR SHARE` first planned. Both close the race, because the delete path locks the asset row `FOR UPDATE` before it checks references. `FOR SHARE` also blocks ordinary updates of the asset row, and two transactions that each cite an asset and then update it deadlocked in a test. The parsing pipeline is expected to do exactly that when it creates a job row and sets `parse_status`. The cost of the weaker lock is a rule: any code that moves an asset from `active` to `deleting` must lock the row `FOR UPDATE` first.

Some suggestions were deliberately not scheduled now. Reordering composite keys to put `campaign_id` first is correct but rewrites every composite key, so it waits for the tenant-level decision. Optimistic locking, `SKIP LOCKED`, pagination, and running migrations as a deploy step only matter with several users or instances.

## Why Parsed Documents Are Format-Neutral And Multilingual

The parsed contract records asset identity, checksum, parser kind/version, and ordered sections. Each section can carry Unicode text, optional structure, source location, and a language field. Spreadsheets, PDF, and later office formats add section kinds without changing storage, job, or provenance contracts.

English notes are supported first because the GM's own notes are in English. Players' notes are in Hebrew and mixed language, so the contract stays multilingual from the start: no English-only shortcuts in code, a multilingual embedding model, and language recorded per section rather than per document. Exact Unicode preservation is more important than premature normalization or forced classification. A known later problem is resolving one name written in two scripts to one entity.

DOCX and ODT require bounded archive inspection before support. Images remain storable but unparsed until OCR has its own explicit plan and security/performance budget.

## Why Extraction Has A Rules Baseline, A Real Model, And Human Review

Deterministic rules provide a debuggable baseline and a fixture oracle. A real LLM is now called behind the same extractor interface, because learning LLM extraction and evals is the goal. Extractor, parser, source checksum, provider, model, and prompt versions belong in provenance so results can be reproduced and compared.

Evals are part of the design, not an afterthought. A hand-labeled set and a scoring script are the regression check for every prompt or model change; without them a prompt change cannot be judged.

Extractors create candidates, never canonical entities or relationships. Users must be able to edit, approve, or reject those candidates through FastAPI-owned workflow rules. This protects the campaign record from uncertain model output and keeps the model adapter replaceable. Candidates are GM-only until reviewed, so model output cannot leak to players.

Extraction runs and candidates remain separate records because rerun history and review state have different lifecycles. One generic candidate table supports a single review queue while entity and relationship extraction are still evolving; separate subtype tables can wait until their behavior requires distinct constraints rather than merely distinct payloads.

The AI work is built first as a standalone toolkit so its hours go to AI rather than routes, migrations, and UI approvals. To stop the toolkit and the app from drifting apart, the toolkit uses this app's entity and relationship types as its output schema.

## Why Search Combines Full-Text Search And pgvector In PostgreSQL

Dependable campaign-scoped keyword search across entity names/summaries, sessions, and parsed asset text comes first. PostgreSQL full-text search is inspectable, inexpensive, and sufficient for that.

Semantic retrieval is added behind the same search service with pgvector rather than a dedicated vector database. Queries are always inside one campaign, so the number of vectors searched is small, and keeping them in PostgreSQL lets visibility filters run before an LLM sees any text. A dedicated vector store would only be needed for search across campaigns.

Good provenance and reviewed structured data still matter more than sophisticated retrieval over noisy records.

## Why Users And Players Are In Scope, And What Stays Deferred

Players who see only part of the campaign are now a product goal, so login, membership, and visibility are planned work (Task 13) instead of deferred scope. The `Owner` record and explicit campaign ownership were kept as the seam for this, and every query already filters by `campaign_id`, so one role check at the campaign level covers all child resources.

Login uses a managed auth provider; building it by hand adds risk without learning value. Access is enforced in services, with Row-Level Security as a second guard, because a forgotten filter in one query would otherwise leak data. The frontend and LLM prompts are never security boundaries.

Until Task 13 lands the API has no login, so it must not be reachable from other machines. That is why Task 9 binds the Compose ports to the local machine.

External platform synchronization, including Kanka, is deferred because it introduces identity mapping, conflict resolution, deletion semantics, rate limits, and secret management. Google Docs and Sheets import is one-way and snapshot-based, which avoids those problems.

Separate CRUD services, model serving, production cloud deployment, OCR, training pipelines, and automatic model write-back are outside v1.

## Why The Current Sequence Is Correct

The completed Tasks 1–8 established canonical records, campaign isolation, provenance seams, backend-owned uploads, typed frontend flows, and schema compatibility.

The remaining order follows dependency and risk:

1. Fix known problems before building on the same tables (Task 9).
2. Get real notes into parsed sections (Task 10).
3. Add rules extraction and review on the stable section contract (Task 11).
4. Put a real model behind the extractor and measure it (Task 12).
5. Add users, membership, and visibility (Task 13).
6. Add permission-aware search and question answering (Tasks 14–15).
7. Polish and verify the complete demo flow (Task 16).

Steps 4 and 5 can swap. Doing visibility first makes the AI work permission-aware from the start; doing the LLM first reaches the learning goal sooner. This is an open decision in the plan.

This order keeps each increment observable and testable while avoiding abstractions whose requirements have not yet appeared.
