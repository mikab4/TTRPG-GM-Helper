# AGENTS.md

## Project Purpose

RPG GM Helper is a single-user, local-first tool for tabletop RPG Game Masters. The first milestone focuses on:
- storing campaign data in a structured way
- ingesting source assets such as text documents, spreadsheets, and images
- extracting candidate entities and relationships from parsed asset content
- requiring human review before extracted data becomes canonical
- searching across entities, sessions, and parsed asset text

This repository is intentionally being built as a foundation for later work on semantic search, model-assisted extraction, and training-oriented workflows.

## Source Of Truth

Before making product or architecture changes, read:
- `docs/plans/2026-03-31-rpg-gm-helper-v1.md`
- `docs/plans/2026-03-31-rpg-gm-helper-v1-reasoning.md`
- `docs/plans/2026-04-17-task-8-backend-design-sessions-source-assets.md` when working on sessions, assets, parsing, or provenance
- `docs/plans/2026-04-17-task-8-backend-design-sessions-source-assets-reasoning.md` when changing the task-8 ingestion design
- `README.md`

If a proposed change conflicts with those documents, call it out explicitly instead of silently diverging.

## Repository Shape And Commands

- The backend lives under `backend/` and uses `uv` with CPython 3.14.
- The frontend lives under `frontend/` and uses React, TypeScript, Vite, ESLint, Prettier, and `npm`.
- Prefer `uv sync` to create or update the backend environment.
- Prefer `uv run <command>` for backend commands such as `pytest`, `ruff check`, `ruff format`, Alembic, and Uvicorn.
- Prefer `npm install` in `frontend/` for frontend dependencies.
- Prefer `npm run lint`, `npm run format:check`, and `npm run build` in `frontend/` as the baseline frontend verification.
- Prefer fast, file-scoped verification before full suites when the smaller check gives enough confidence.

## Architecture Rules

- Prefer a modular monolith over microservices.
- Keep the backend in Python with FastAPI.
- Keep PostgreSQL as the primary and only datastore in v1.
- Use React with TypeScript as the current frontend default, but keep the frontend architecture cheap to replace if an early switch becomes justified.
- Keep the frontend as a separate app in the same repository, not a server-rendered full-stack framework.
- Keep business logic, validation, extraction logic, and workflow rules in the backend rather than in React components or hooks.
- Keep the frontend thin: routing, forms, tables, API calls, and presentation are in scope; domain logic and persistence rules belong in FastAPI services.
- Use a plain typed API client at the frontend-backend boundary and avoid coupling domain behavior to React-only patterns.
- Avoid heavy client-side state frameworks, custom hook abstractions, or React-specific architecture unless they solve a concrete v1 problem now.
- Prefer styling and component structure that preserve CSS, UX flows, and API contracts if the frontend framework is changed later.
- Reconsider the frontend framework only if React materially slows delivery of the admin-style UI, not merely because another framework looks cleaner.
- Keep extraction and search behind internal service boundaries so future semantic search or model-backed extraction can be added cleanly.
- Preserve provenance for extracted entities and relationships.
- Store source assets and reusable parsed output so extraction can be rerun later.
- Keep parsing backend-owned and canonical; do not move canonical parse logic into the frontend.
- In v1, keep parsing implicit and limited to parse-dependent flows such as extraction, preview, and search. Ordinary asset metadata reads should stay cheap and must not trigger parsing.
- Keep the backend upload contract single-purpose. If the frontend offers one combined session-plus-asset flow, orchestrate two API calls rather than adding a combined backend endpoint unless the user explicitly changes that decision.

## V1 Scope

In scope:
- campaign CRUD
- entity CRUD
- relationship CRUD
- session CRUD
- source asset storage
- backend-owned parsing and parse-result caching for text-capable assets
- extraction jobs and candidate review
- PostgreSQL full-text search

## Data Modeling Guidance

- Use one generic `Entity` model in v1 rather than separate tables for each RPG concept.
- Use explicit `campaign_id` on campaign-owned resources.
- Reserve room for future auth by keeping an owner or tenant placeholder in major tables.
- Use JSONB only for flexible metadata, not as a substitute for the relational schema.
- Do not use external system IDs such as Kanka IDs as canonical internal identity.

## Implementation Guidance

- Build the smallest working slice that supports the demo flow.
- Prefer deterministic, testable behavior over ambitious automation.
- Use a rules-first extraction implementation for v1, with a clean interface for a future LLM-backed extractor.
- Keep original uploaded assets outside Postgres blobs and favor backend-owned parsing for canonical extracted representations.
- When changing the current `session_notes + source_documents` shape, prefer in-place compatibility migration over resets so provenance and existing references stay intact.
- Prefer boring, debuggable solutions when tradeoffs are unclear.
- Prefer explicit variable names that describe the role of the value, not just its type.
- Avoid broad names like `data`, `payload`, `response`, `result`, or `session` when a more specific name such as `campaign_create`, `created_entity_response`, or `db_session` is available.
- Apply the same naming rule to fixtures, route handlers, services, and tests.

## Backend Testing Guidance

- For Python backend tests, use the repo-local `py-db-tdd` skill at `.agents/skills/py-db-tdd/SKILL.md`.
- Prefer explicit factory fixtures such as `owner_factory`, `campaign_factory`, `entity_factory`, and `relationship_factory` for scenario data.
- Keep infrastructure plumbing in `backend/tests/conftest.py`; keep scenario data visible in the Arrange step of each test.
- Avoid named scenario fixtures such as `campaign_with_two_entities` or `owner_with_duplicate_campaign`.
- Use `db_session_factory()` when shared session state is part of the scenario, not as the default setup tool.
- Keep Postgres container lifecycle and readiness checks in test support code rather than in individual tests.
- Assume `uv run pytest` is the default backend test entrypoint and that Postgres-backed tests provision a disposable Docker container automatically.
- If Docker is unavailable, treat Postgres-backed test setup failures as real environment problems, not as reasons to silently skip coverage.

## Frontend Guidance

- Keep the v1 UI task-oriented and high-utility, but do not default to a bland utility look if a stronger workspace identity improves usability.
- Start with routing, a shared layout, and typed API request and response shapes that match backend contracts.
- Prefer simple React state and straightforward form handling until real complexity justifies additional client-side abstractions.
- Do not add frontend infrastructure such as Redux, React Query, Zustand, or SSR frameworks unless a concrete requirement appears.
- Prefer one coherent visual language across the app rather than mixing unrelated aesthetics.
- Distinctive styling is allowed when it supports orientation and flow; avoid spectacle that makes tables, forms, and relationship scanning harder.
- Optimize for a working CRUD, extraction review, and search flow, but treat empty states, offline states, and navigation context as product design work, not throwaway scaffolding.

## Verification Expectations

At minimum, cover:
- CRUD flows for core records
- extraction candidate generation
- candidate approval and rejection
- provenance preservation
- search behavior
- campaign ownership validation
- migration-safe preservation of source-asset provenance when schema terminology changes
- parse failure, retry, and stale-cache invalidation behavior for backend-owned parsed assets

Use sample notes under `docs/sample-notes/` for repeatable tests and demos.

- For Python changes, run `uv run ruff check` before claiming the work is complete.
- If Python files were reformatted or newly created, also run `uv run ruff format`.
- Treat `ruff` findings as blockers unless there is a documented reason not to.
- When backend behavior changes, run the relevant `uv run pytest` coverage.
- When frontend code changes, run `npm run lint`, `npm run format:check`, and `npm run build` in `frontend/`.

## Documentation Expectations

When changing architecture, scope, or major workflows:
- update `README.md` if the user-facing setup or project description changes
- update the relevant file under `docs/plans/` if the intended design changes

## Working Style

- Be explicit about assumptions that affect architecture or schema.
- Push back on premature complexity.
- Surface a simpler alternative when proposing a heavier design.
- Do not introduce new infrastructure just to make the project look more advanced.
- Optimize for a working product that can grow, not for maximal abstraction.
