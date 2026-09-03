# Cloud-Ready Asset Intelligence Pipeline Reasoning

**Applies to:** asset storage, asynchronous processing, parsing, extraction, and processing-job recovery
**Related code:** `backend/app/services/asset_*`, `backend/app/models/`, `processor/`, `compose.yaml`
**Deferred design triggers:** None

## Why This Pipeline Exists

The project needs a real asset-processing path and is also being used to learn a focused set of production-relevant infrastructure. The chosen design accepts more operational complexity than the earlier PostgreSQL-only approach, but confines that complexity to one cohesive asset-processing boundary.

The simpler synchronous PostgreSQL and local-filesystem design remains the cheaper product-only alternative. The worker pipeline is justified here by the explicit learning goal and by the need to isolate slow, retryable parsing and extraction work from request handling.

## Canonical Ownership

PostgreSQL remains authoritative for asset metadata, processing-job state, extraction candidates, review decisions, entities, relationships, campaign ownership, and provenance.

The supporting systems have narrower roles:

- MinIO/S3 stores original files and optional large derived artifacts.
- Redis Streams transports work but does not define whether a job exists or succeeded.
- MongoDB stores versioned parsed-document projections that can be rebuilt from original assets and canonical job metadata.

This prevents split ownership and keeps recovery decisions grounded in PostgreSQL.

## One Worker Boundary

Parsing and extraction belong in one independently runnable `asset-processor` because they are slow, failure-prone, and operationally different from CRUD and review workflows. Campaign APIs and canonical writes stay in FastAPI.

Separate asset, parser, extractor, and review microservices were rejected. They would add deployment and coordination costs without creating useful ownership boundaries for the current product.

## A Narrow Real Vertical Slice First

The first slice processes an actual `.txt` upload through MinIO, PostgreSQL, Redis, the worker, MongoDB, and a FastAPI completion callback. It deliberately omits additional formats, extraction, elaborate retries, and broad UI work.

An in-process queue or fake storage path was rejected because it would avoid testing the infrastructure boundaries this slice exists to teach. Conversely, implementing every format and recovery mechanism before the first end-to-end path would delay feedback and make failures harder to localize.

## Durable And Idempotent Processing

PostgreSQL processing jobs provide canonical identity and lifecycle. Worker completion must be idempotent because Redis delivery and callbacks can be repeated.

The initial direct Redis publish is a temporary learning step. A transactional outbox follows immediately to close the database-commit-to-publish failure window. Redis acknowledgements occur only after FastAPI accepts the result, and retries or dead-letter records never replace canonical PostgreSQL state.

## Format-Neutral Parsed Documents

The `.txt` parser is narrow, but its output contract is not text-file-specific. Parsed documents contain versioned sections with text, optional structure, source locations, and language hints. Parser version and source checksum are part of reuse and provenance decisions.

This lets spreadsheets, PDFs, and later office documents add section kinds without changing storage, job, callback, or extraction contracts. Unicode must be preserved exactly, and mixed-language content must not be forced into one definitive document language.

## Human Review Remains Mandatory

Extractors produce candidates rather than canonical records. Only FastAPI review services may approve candidates into entities or relationships, preserving asset, parser, extractor, and optional model provenance.

Rules-based extraction remains the deterministic baseline. A model adapter may be added later, but provider output cannot bypass review or become authoritative on its own.

## Formats Are Added Incrementally

CSV/XLSX and PDF support follow the proven section contract. Images remain storable but unparsed until OCR is intentionally planned.

DOCX and ODT support is deferred until bounded package inspection can reject encrypted content, unsafe paths, duplicate members, unsupported compression, and expansion attacks. Accepting archive-based formats using MIME type alone was rejected as an unsafe partial implementation.

## Deferred Boundaries

Public authentication, tenant enforcement, production cloud deployment, semantic search, automatic model write-back, and a separate model-serving service remain outside this plan. The design records seams for those concerns without implementing them prematurely.

## Asset-delete maintenance concurrency

The hardened pipeline may run more than one maintenance process, so delete recovery cannot continue relying only on idempotent storage deletion. Task 4 adds periodic execution and explicit database claiming of stale delete work in bounded batches. `FOR UPDATE SKIP LOCKED` is the preferred PostgreSQL mechanism; an explicit lease is acceptable if implementation constraints require work to continue after the claiming transaction closes.
