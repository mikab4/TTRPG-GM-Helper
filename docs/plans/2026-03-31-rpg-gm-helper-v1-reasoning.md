# RPG GM Helper V1 Decision Reasoning

**Applies to:** overall product architecture, technology choices, ingestion, extraction, search, and deferred scope
**Related code:** `backend/`, `frontend/`, `docs/mockups/workspace-v1.html`, `compose.yaml`; planned `processor/`
**Deferred design triggers:** None

## Purpose And Current Decision State

The product must help a single local Game Master turn campaign material into structured, reviewable, searchable records while preserving where each fact came from. It is not trying to become a complete worldbuilding suite, public SaaS, or autonomous AI knowledge base in v1.

Tasks 1–8 are implemented. The next step is the real `.txt` processing slice in Task 9. This reasoning document records the decisions that still govern the current plan; completed implementation details remain authoritative in code, migrations, tests, and archived task plans.

## Why A Modular Monolith Plus One Worker

Campaign CRUD, validation, review, and canonical writes belong together in FastAPI because they share one product workflow and one source of truth. Broad microservices would add deployment, failure, and coordination costs without corresponding team or ownership boundaries.

Parsing and extraction are the one justified runtime boundary. They are slow, retryable, and failure-prone, so running them outside API requests improves isolation and creates a useful place to learn queueing and recovery behavior.

The chosen shape is therefore:

- one FastAPI application for canonical domain and workflow behavior;
- one PostgreSQL database for canonical state;
- one independently runnable asset processor for parsing and extraction;
- narrow adapters for file storage, queue transport, parsed projections, and future model providers.

The simpler alternative remains synchronous processing in the monolith with PostgreSQL and local files. It would be cheaper for a product-only MVP. The approved worker/Redis/MinIO/MongoDB design is justified by the explicit infrastructure-learning goal, not by current scale.

## Why PostgreSQL Owns Canonical State

PostgreSQL is authoritative for campaigns, entities, relationships, sessions, assets, processing jobs, extraction jobs, candidates, review decisions, provenance, and outbox state. Transactional constraints are especially valuable for campaign isolation and human-reviewed promotion of candidates.

Supporting systems have narrower roles:

- MinIO/S3 stores original file bytes and optional large artifacts.
- Redis Streams transports work; it does not decide whether a job exists or succeeded.
- MongoDB stores versioned parsed-document projections that can be rebuilt from originals and canonical metadata.

This replaces the obsolete claim that PostgreSQL is the only v1 database. Multiple datastores are accepted, but competing ownership is not.

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

Approved differences are recorded in `docs/design-deviations.md` so implementation does not silently redefine the design and the mockup can be updated later when appropriate. Existing frontend differences predate this explicit authority and are not automatically approved; conformance is checked on touched surfaces unless a separate full audit is commissioned.

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

Backend ownership gives every caller the same validation, checksum, storage, lifecycle, and provenance behavior. Browser-side canonical parsing would produce inconsistent results across the UI, future imports, and worker processing.

Original files do not belong in PostgreSQL blobs. The implemented upload path already goes through `backend/app/services/asset_storage.py`; its local-filesystem backend is transitional. Task 9 changes the implementation to MinIO through an S3-compatible boundary so the API and worker never depend on a shared local path.

Asset metadata reads must never hide parsing or queue submission. Processing is an explicit workflow with observable state.

## Why Parsing Is Asynchronous, Explicit, And Separate From Extraction

Parsing normalizes a file into reusable text and structure. Extraction interprets that representation and proposes campaign facts. Keeping them separate allows preview, search, and multiple extractor versions to reuse one parse while preserving debuggability and provenance.

The old lazy-parse-on-dependent-read design is rejected. It makes latency and failure surprising, couples cheap reads to expensive work, and obscures retry state. The worker pipeline instead uses explicit processing jobs and callbacks.

The obsolete hybrid parse cache—small content inline in PostgreSQL and large content in file storage—is also rejected for new processing. MongoDB is the rebuildable, versioned parsed-document projection. The existing `AssetParseResult` table remains compatibility/provenance groundwork and must not become a competing current projection design.

Search and extraction consume parsed documents, not raw file containers. Raw bytes remain the preserved source artifact.

## Why The First Worker Slice Is Narrow

Task 9 proves one real path through MinIO, PostgreSQL, Redis, the processor, MongoDB, and an idempotent FastAPI completion callback using `.txt`. It postpones extraction, retries, outbox relay, and additional formats so infrastructure failures can be localized.

An in-process queue or fake storage implementation would not validate the approved boundaries. Building all formats and recovery behavior at once would increase debugging surface before the core path works.

Direct Redis publication is acceptable only in this first learning slice. Task 10 immediately adds a transactional outbox because a database commit followed by queue publication otherwise has an unavoidable failure window.

## Why Parsed Documents Are Format-Neutral And Multilingual

The target parsed projection records asset identity, checksum, parser kind/version, and ordered sections. Each section can carry Unicode text, optional structure, source location, and language hints. CSV/XLSX, PDF, and later office formats add section kinds without changing storage, job, callback, or provenance contracts.

Language is a per-section hint rather than one definitive document label because campaign notes may mix Hebrew, English, names, and invented terms. Exact Unicode preservation is more important than premature normalization or forced classification.

DOCX and ODT require bounded archive inspection before support. Images remain storable but unparsed until OCR has its own explicit plan and security/performance budget.

## Why Extraction Is Rules-First And Human-Reviewed

Deterministic rules provide a debuggable baseline. Extractor, parser, source checksum, and optional provider/model/prompt versions belong in provenance so results can be reproduced and compared.

Extractors create candidates, never canonical entities or relationships. Users must be able to edit, approve, or reject those candidates through FastAPI-owned workflow rules. This protects the campaign record from uncertain model output and keeps the future model adapter replaceable.

Extraction runs and candidates remain separate records because rerun history and review state have different lifecycles. One generic candidate table supports a single review queue while entity and relationship extraction are still evolving; separate subtype tables can wait until their behavior requires distinct constraints rather than merely distinct payloads.

An LLM-first autonomous write path would add nondeterminism, cost, and trust problems before the review loop is proven.

## Why Search Is PostgreSQL Full-Text Search First

The first retrieval goal is dependable campaign-scoped keyword search across entity names/summaries, sessions, and parsed asset text. PostgreSQL full-text search is inspectable, inexpensive, and sufficient for that milestone.

Semantic/vector search remains a later option behind the search service boundary. Good provenance and reviewed structured data matter more than sophisticated retrieval over noisy records. Parsed sections still provide future chunking and embedding inputs without committing v1 to a vector database.

## Why Auth, External Sync, And More Services Are Deferred

The app is local and single-user. The `Owner` record and explicit campaign ownership preserve a migration path, but public login, authorization policy, and tenant enforcement would add substantial product and test scope without helping the current workflow.

External platform synchronization, including Kanka, is deferred because it introduces identity mapping, conflict resolution, deletion semantics, rate limits, and secret management. Export can be added before bidirectional sync if portability becomes important.

Separate CRUD services, model serving, production cloud deployment, semantic search, OCR, training pipelines, and automatic model write-back are likewise outside v1.

## Why The Current Sequence Is Correct

The completed Tasks 1–8 established canonical records, campaign isolation, provenance seams, backend-owned uploads, typed frontend flows, and schema compatibility before distributed processing was introduced.

The remaining order follows dependency and risk:

1. Prove the narrow `.txt` processing spine.
2. Make dispatch and recovery durable.
3. Add extraction and review on the stable parsed contract.
4. Extend formats without reshaping the pipeline.
5. Add search after parsed content exists.
6. Polish and verify the complete demo flow.

This order keeps each increment observable and testable while avoiding abstractions whose requirements have not yet appeared.
