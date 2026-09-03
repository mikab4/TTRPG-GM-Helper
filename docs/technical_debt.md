# Technical Debt

This file tracks current implementation liabilities that should be paid down. Planned product work and designs that become relevant only after a specific trigger belong elsewhere.

## Frontend API response-schema validation

**Priority:** Medium

The shared API client correctly returns `unknown`, but each endpoint family now maintains its own handwritten response parser. That repetition makes contract validation inconsistent and increasingly expensive as processing, extraction, and search APIs are added.

**Recommended action:** Introduce a small runtime schema library such as Zod before adding the next API families. Migrate schemas incrementally as endpoints change rather than rewriting every parser at once.

**Done when:** New API contracts derive their TypeScript types from runtime schemas, and existing handwritten parsers have a documented incremental migration path.

## Forms seeded from initial props

**Priority:** Medium

`CampaignForm` and `EntityForm` initialize local state from `initialValues`. React Router can reuse an edit-route component when only a record identifier changes, so a newly loaded record can be rendered with stale form state.

**Recommended action:** Remount each edit form with a stable record-specific `key`. This is simpler and less error-prone than synchronizing local state through effects. Add a route-param-change regression test.

**Done when:** Navigating directly between edit URLs renders the newly loaded record values and the regression is covered by a test.

## Synchronous API-test runtime shim

**Priority:** High

`backend/tests/conftest.py` monkeypatches FastAPI, Starlette, and AnyIO threadpool internals so synchronous handlers run inline during in-process ASGI tests. This couples the suite to framework internals and makes its execution model less representative.

The earlier proposal blamed repeated `asyncio.run()` calls and prescribed converting the whole suite to async tests, but that cause and remedy have not been demonstrated in this repository. Native async tests, executor substitutions, and other alternatives have already been attempted; see the [runtime-shim investigation](technical-debt-references/synchronous-api-test-runtime-shim-investigation.md) before planning remediation.

**Recommended action:** First rerun an unpatched minimal sync-route reproduction against the current dependency versions and environment. If it succeeds, convert one focused API test to a native async client without the shim and verify it in both the ordinary and Docker-backed test environments before migrating incrementally. If it still hangs, identify the responsible runtime boundary and replace the broad monkeypatch with the narrowest proven workaround; do not repeat the rejected approaches without new evidence.

**Done when:** API tests no longer patch framework threadpool internals, or a narrowly scoped workaround is backed by a reproducible test and explanation.
