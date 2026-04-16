# Why We Chose The Task 8 Sessions And Source Assets Design

## Problem We Are Actually Solving

The current branch already has a working schema for text-first campaign data. That schema is no longer enough for the intended v1 workflow because v1 now needs to support:

- uploaded source artifacts, not just pasted text
- text documents, spreadsheets, and images
- backend-owned provenance for extraction and search
- future extraction/search work reusing the same canonical parsed representation

So the real problem is not "how do we add file upload." The problem is "how do we replace a text-only document model with a broader asset model without breaking existing provenance, tests, and future workflows."

## Why This Is A Compatibility Migration, Not A Fresh Build

The repo already contains:

- migrations
- ORM models
- CRUD routes
- extraction tables
- provenance fields pointing at `source_documents`

Pretending this task starts from zero would be sloppy. It would hide the hardest part of the change, which is preserving existing references while renaming and reshaping the data model.

That is why the plan uses an in-place compatibility migration instead of a reset.

## Why We Renamed Internals Now

Keeping `SessionNote` and `SourceDocument` in the code while exposing `Session` and `SourceAsset` in the API would create permanent translation debt.

That debt would show up everywhere:

- service names
- schema names
- migration names
- test fixtures
- future extraction/search code

This codebase is still early enough that paying the rename cost once is cheaper than teaching every later task two vocabularies for the same concept.

## Why Sessions And Assets Are Separate

A session is a campaign timeline event.

A source asset is an uploaded artifact.

Those are different things.

One session can have multiple assets:

- recap text
- player notes
- spreadsheet trackers
- maps

And an asset can exist without a session:

- world reference sheet
- city map
- faction roster

Keeping them separate makes the model more durable and keeps provenance attached to the actual source artifact, not a vague campaign event.

## Why Original Files Stay Outside Postgres

This is a local-first tool, but that does not mean Postgres should hold every binary.

Original files belong in backend-managed storage because:

- blobs bloat the database
- backups get heavier for no query benefit
- local filesystem storage is simpler for v1
- a later switch to object storage is straightforward if the storage boundary already exists

Postgres should hold metadata, references, and queryable parsed output, not act like a file bucket.

## Why Parsing Is Backend-Owned

If parsing stays in the frontend, then every future consumer has to trust browser-derived output:

- search
- extraction
- later import flows
- later multi-user or headless workflows

That is the wrong center of gravity.

Backend-owned parsing gives one canonical representation. The UI can still render previews, but it should not be the system of record for parsed content.

## Why Parsing Is Implicit, But Only In Parse-Dependent Flows

We rejected two extremes:

- explicit parse endpoint for every asset
- parsing on every ordinary asset read

The explicit-endpoint version adds ceremony to the user workflow and creates another contract to maintain.

The "parse on any read" version is worse. It makes cheap list/detail pages unexpectedly expensive and hides CPU and I/O behind innocent metadata requests.

So the chosen compromise is:

- parsing is implicit
- but only parse-dependent consumers may trigger it:
  - extraction
  - search
  - preview or parsed-content inspection

This keeps the workflow simple without making the UI randomly slow.

## Why We Did Not Add A Public Parse Endpoint

There is no real v1 user need for a dedicated manual parse endpoint if extraction/search/preview can trigger parse when needed.

Adding the endpoint would mean:

- more API surface
- more tests
- more state transitions to explain
- more opportunities for the frontend to call the wrong path

That is complexity without enough value in this milestone.

## Why The Frontend Gets One Form But The Backend Keeps Two Calls

The user experience goal is reasonable: one form where a GM can create a session and attach an asset without thinking about API boundaries.

That does not require one backend endpoint.

If `POST /assets` also creates sessions, then one multipart endpoint starts owning:

- session validation
- session creation rules
- file upload
- cross-campaign checks
- transaction semantics across DB and storage

That is too much responsibility for one contract.

So the UI gets one flow, but the frontend orchestrates:

1. `POST /sessions`
2. `POST /assets`

This keeps the backend explicit and boring while still delivering the intended UX.

## Why We Kept Parse History

Overwriting one mutable cache row is cheaper today, but it throws away useful information:

- which parser version produced which result
- whether a file changed
- what failed previously
- what can be safely reused

Keeping one row per unique `(asset_id, parser_kind, parser_version, source_checksum)` makes parse reuse explicit and makes debugging possible.

This matters because extraction and search will both depend on parse correctness later.

## Why Parse History Also Needs Pruning

History without retention becomes local storage creep.

The important distinction is between:

- correctness history we still need
- dead cache rows and artifacts we can safely prune

That is why the plan keeps history but also requires a cleanup policy for superseded parse rows and derived artifacts.

## Why We Kept The Service Shape Small

There is real reuse pressure in parsing. Search and extraction will both need it.

What is not yet proven is that parsing needs to be a full top-level platform service right now.

If we split too early into:

- asset ingestion service
- parse cache service
- parser service
- storage service

then we spend a lot of time managing boundaries instead of shipping the feature.

The chosen compromise is:

- one storage backend abstraction
- one asset workflow service
- parser helpers under that service

That keeps the code organized without paying interface tax too early. If later tasks show multiple truly independent parse callers, we can promote the shared parse module into a top-level service then.

## Why We Required Explicit Split-Brain Handling

This task crosses two persistence systems:

- the database
- file or artifact storage

That means split-brain failures are not edge cases. They are the obvious real-world failures:

- file written, DB transaction failed
- DB row created, derived artifact write failed

If the plan ignores those, users get orphaned files, silent broken assets, or records that look valid but are not.

So compensation and visible error states are part of the design, not optional cleanup.

## Why The Test Plan Got Larger

The earlier draft test plan was decent for happy paths, but too thin for the actual risk in this task.

The highest-risk failures are:

- migration regressions
- provenance breakage
- stale parse reuse
- split-brain storage failures
- partial-success frontend flow

Those are exactly the kinds of defects that slip through if the test plan only checks CRUD and successful parsing.

So the final plan explicitly requires regression, compensation, and flow-level tests.

## Why This Design Fits The Rest Of V1

This design is heavier than a text-only upload field, but still boring enough for v1.

It does not add:

- queues
- Redis
- object storage complexity in v1
- microservices
- frontend-owned domain logic

What it does add is the minimum durable shape needed for:

- source asset upload
- provenance-preserving extraction
- later search over parsed material
- future semantic or model-assisted features

That is the whole point. Not fancy. Durable.
