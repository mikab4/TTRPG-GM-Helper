# RPG GM Helper

RPG GM Helper is a single-user, local-first tool for Game Masters to store campaign data, manage source assets, extract candidate entities, review them before saving, and search across structured world data and parsed source material.

## Current Status

This repository is in the planning and initialization stage. The implementation direction is documented here:

- [V1 implementation plan](docs/plans/2026-03-31-rpg-gm-helper-v1.md)
- [Plan reasoning and tradeoffs](docs/plans/2026-03-31-rpg-gm-helper-v1-reasoning.md)
- [Task 8 sessions/assets backend plan](docs/plans/2026-04-17-task-8-backend-design-sessions-source-assets.md)
- [Task 8 sessions/assets reasoning](docs/plans/2026-04-17-task-8-backend-design-sessions-source-assets-reasoning.md)

## V1 Goal

Build a demoable first version with these capabilities:
- manage campaigns
- create and edit entities and sessions
- upload and manage source assets such as text documents, spreadsheets, and images
- parse text-capable assets for extraction and search
- extract candidate entities and relationships from parsed assets
- review and approve extracted candidates before persistence
- search entities, sessions, and parsed asset text with PostgreSQL full-text search

## Planned Stack

- Backend: FastAPI
- Database: PostgreSQL
- Frontend: React + TypeScript
- Search: PostgreSQL full-text search
- Extraction: rules-first, with a future optional LLM-backed implementation

## Initial Repository Shape

Planned directories:
- `backend/` for the FastAPI application, models, migrations, and tests
- `frontend/` for the React TypeScript app
- `docs/plans/` for planning documents
- `docs/sample-notes/` for demo and extraction fixture notes

## Deliberately Deferred

These are intentionally out of scope for v1:
- multi-user auth
- semantic or vector search
- model training
- microservices
- Redis and queue infrastructure
- NoSQL persistence
- Kanka export and sync
- audio and video parsing

## Next Steps

1. Scaffold the backend and frontend applications.
2. Define the initial PostgreSQL schema and migrations.
3. Implement campaign, entity, session, and asset flows, including the task-8 compatibility reshape from `session_notes + source_documents` to `sessions + source_assets`.
4. Build extraction, review, and search workflows.

## Local Setup

Backend:
- install `uv` if it is not already available
- use standard CPython 3.14
- run `uv sync --group dev` inside `backend/`
- copy `backend/.env.example` to `backend/.env`
- install Docker and make sure the Docker daemon is available to your shell
- `uv run pytest` provisions a disposable Postgres container automatically for the Postgres-backed test modules
- `backend/.env.test` is not required for normal test runs; keep it only if you want to run those tests against a custom database manually
- if Docker is installed but unavailable, the Postgres-backed tests fail with an explicit setup error instead of skipping
- set `AUTO_APPLY_MIGRATIONS=true` in `backend/.env` if you want the API to run `alembic upgrade head` automatically on startup
- original uploaded source assets are intended to be stored in backend-managed local storage in v1, not in Postgres blobs
- parsed asset cache is intended to use configurable size thresholds so small results stay inline in Postgres while large derived artifacts go to storage
- schema migrations can run automatically on startup, but semantic data migrations stay explicit: if the app detects legacy entity types, it now opens a migration screen in the frontend and requires user-selected mappings before continuing
- run the API with `uv run uvicorn app.main:app --reload` from `backend/`
- run `uv run ruff format` and `uv run ruff check` for Python changes
- run tests with `uv run pytest`
- backend tests now prefer explicit factory fixtures such as `owner_factory`, `campaign_factory`, and `entity_factory` for scenario data; `conftest.py` keeps infrastructure plumbing, while test files keep the relevant data visible in Arrange

Frontend:
- run `npm install` inside `frontend/`
- copy `frontend/.env.example` to `frontend/.env`
- run the Vite dev server from `frontend/`

## Asset Ingestion Direction

The current intended backend direction is:

- keep `sessions` as campaign timeline records
- keep `source_assets` as uploaded evidence/artifacts that may optionally link to a session
- upload original files to backend-managed storage
- keep parsing backend-owned and implicit only for parse-dependent flows such as extraction, preview, and search
- keep ordinary asset metadata reads cheap and do not trigger parsing from normal list/detail reads
- cache parsed outputs so assets are not reparsed unnecessarily

The parse cache is intended to be hybrid:

- small parse outputs live inline in Postgres
- large parse outputs live in storage and are referenced from the database

Thresholds for inline-vs-storage behavior should be configurable through backend settings rather than hardcoded-only constants.

The parse cache is also intended to keep history per `(asset_id, parser_kind, parser_version, source_checksum)` rather than overwriting one mutable row. Superseded cache rows and derived artifacts may be pruned by policy.

The backend upload contract should stay single-purpose in v1:

- `POST /assets` uploads or updates asset state
- `POST /sessions` creates sessions
- if the UI offers one form for both actions, the frontend should orchestrate two API calls rather than relying on a combined backend endpoint

## Configuration Contract

Keep frontend and backend config separate, but align them intentionally:

- backend owns `BACKEND_CORS_ALLOWED_ORIGINS`
- frontend owns `VITE_API_BASE_URL`

For local development:
- `VITE_API_BASE_URL` should point to the backend API base, for example `http://localhost:8000/api`
- `BACKEND_CORS_ALLOWED_ORIGINS` should list the frontend origin or origins, for example `http://localhost:5173,http://127.0.0.1:5173`

These values are related but not interchangeable:
- the API base URL includes the backend host, port, and `/api` prefix
- the CORS origins list should contain only browser origins allowed to read backend responses

## Demo Materials

- [Demo script](docs/demo-script.md)
- [Sample notes](docs/sample-notes/README.md)
