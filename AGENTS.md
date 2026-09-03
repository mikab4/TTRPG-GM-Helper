# AGENTS.md

## Project

RPG GM Helper is a single-user, local-first workspace for tabletop RPG Game Masters. It stores campaign records and source assets, turns source material into reviewable structured data, preserves provenance, and supports retrieval across campaign information.

## Planning And Documentation

- Documents directly under `docs/plans/` are current planning guidance.
- Documents under `docs/plans/archive/` are historical and non-authoritative unless a current plan explicitly links to them.
- Before planning or implementing feature behavior, inspect the filenames and opening discovery blocks of current plans. Read only relevant plans and surface conflicts instead of choosing silently.
- Before planning or implementing feature behavior, inspect the headings and `Trigger` fields in `docs/deferred_design_options.md`. If requested work satisfies or may satisfy a trigger, flag the matching option before choosing an architecture and recommend whether to activate, reject, or continue deferring it. Do not implement an activated option until the decision is recorded in the applicable current plan and reasoning document.
- When creating or updating a current plan, follow `docs/plans/README.md`, keep its discovery fields accurate, and maintain its corresponding `-reasoning.md` decision summary.
- When implementation completes or materially changes a task in a current plan, update that task in the same work. Retain its original intent and steps, set its current status, add a concise summary of what was implemented, and correct outdated paths or schema descriptions. Update the sibling reasoning document when an architectural decision or trade-off changes.
- Keep `README.md` limited to product description, setup, running, debugging, prerequisites, and verification commands.
- Record architecture, workflow, scope, reasoning, and implementation handoffs under `docs/`, updating a current plan when intended behavior changes.

## Architecture Boundaries

- Prefer a modular monolith. Add service boundaries or infrastructure only when a current plan justifies them.
- Keep the backend in Python with FastAPI and the frontend as a separate React and TypeScript application.
- PostgreSQL owns canonical domain and workflow state. Supporting stores or transports must not become competing sources of truth.
- Keep domain rules, validation, extraction, review, and persistence in backend services. The frontend owns routing, forms, API calls, and presentation.
- Use a plain typed API client at the frontend boundary. Do not add heavy client-state or framework abstractions without a concrete need.
- Preserve campaign ownership and provenance for extracted entities and relationships.
- Keep original assets outside PostgreSQL blobs and access storage through a backend-owned boundary.
- Parsing and extraction are backend-owned capabilities. Ordinary asset metadata reads must remain cheap and must not trigger hidden processing.
- Keep one generic `Entity` model unless a current plan explicitly changes the data model. Use JSONB for flexible metadata, not as a substitute for stable relational fields.

## Frontend Design Authority

- `docs/mockups/workspace-v1.html` is the authoritative visual and interaction reference for the frontend. Inspect the relevant mockup views before planning, implementing, or reviewing UI/UX work.
- Match the mockup as strictly as the implemented product behavior permits. Preserve its composition, hierarchy, proportions, responsive intent, Inter/Cinzel typography, colors, spacing, borders, shadows, control styling, button placement, and interaction states. Do not make liberal creative substitutions or visual "improvements."
- Treat any difference from the mockup—including colors, fonts, dimensions, spacing, component placement, button placement, or interaction behavior—as a design deviation requiring explicit approval from the responsible engineer before implementation.
- If a required route, section, tab, state, or error-handling path has no mockup design, stop before making the design choice. Explain the missing design, propose the smallest mockup-consistent solution, and implement it only after the responsible engineer approves it.
- Record every approved deviation in `docs/mockups/design-deviations.md`, including the affected surface, mockup baseline, approved change, rationale, and whether the mockup needs a later update. Product behavior may require additions, but it does not silently authorize presentation changes.

## Repository And Commands

- Backend: `backend/`, CPython 3.14, `uv`.
- Frontend: `frontend/`, React, TypeScript, Vite, npm.
- Use `uv sync` for backend dependencies and `uv run <command>` for backend tools.
- Use `npm install` for frontend dependencies and the scripts defined in `frontend/package.json`.
- Prefer focused verification before full suites when it provides sufficient confidence.

## Backend Tests

- Use `.agents/skills/py-db-tdd/SKILL.md` when working on Python backend tests.
- Keep infrastructure plumbing in `backend/tests/conftest.py`; keep scenario data visible in each test's Arrange step.
- Prefer explicit factory fixtures such as `owner_factory`, `campaign_factory`, `entity_factory`, and `relationship_factory`. Avoid named scenario fixtures.
- Use `db_session_factory()` only when shared session state is part of the scenario.
- Keep PostgreSQL container lifecycle and readiness logic in test support code, not individual tests.
- Treat unavailable Docker as an environment failure for PostgreSQL-backed tests; do not silently skip coverage.

## Verification

- Verify changed behavior with focused tests.
- Expand to broader tests when a change affects shared infrastructure or multiple features.
- Treat failures from repository checks as blockers.

## Working Principles

- State assumptions that affect architecture, schema, or product behavior.
- Push back on unnecessary complexity and surface a simpler alternative for substantial abstractions or infrastructure.
- Prefer deterministic, testable, and debuggable behavior.
- Use explicit, role-specific names when they improve clarity; avoid vague names when the domain concept is known.
- Preserve existing data through compatible migrations unless a current plan explicitly authorizes a reset.
