# Synchronous API-Test Runtime Shim Investigation

> **Status:** Historical evidence supporting the active entry in [`docs/technical_debt.md`](../technical_debt.md#synchronous-api-test-runtime-shim). This is not general test-writing guidance.

## Why This Record Exists

The backend API-test harness patches FastAPI, Starlette, and AnyIO threadpool internals so synchronous handlers can run inline under in-process ASGI tests. Removing that coupling remains active technical debt.

This record preserves the observations and rejected approaches from the original CRUD API-test investigation so future remediation does not restart from an unsupported diagnosis or repeat failed experiments without a reason.

## Required Production Boundary

The accepted production design remained synchronous end to end:

- synchronous FastAPI routes;
- a synchronous database dependency;
- synchronous services;
- synchronous SQLAlchemy sessions.

Changing routes to `async def` while continuing to perform blocking SQLAlchemy work directly was rejected because it would block the event loop and degrade production design to accommodate the test harness.

## Original Failure And Reproduction

The first CRUD tests called route functions directly. They were rejected because they bypassed request parsing, dependency injection, parameter binding, response-model handling, and automatic validation responses.

A live Uvicorn server made the tests exercise the real HTTP boundary, but binding a local socket failed in the sandbox with `PermissionError: [Errno 1] Operation not permitted`.

The investigation then tested the in-process ASGI path and observed:

1. An `async def` FastAPI route completed under `httpx.ASGITransport`.
2. A trivial synchronous `def` FastAPI route hung under the same transport.
3. `asyncio.to_thread()` completed.
4. `anyio.to_thread.run_sync()` hung.

These observations narrowed the demonstrated failure to the in-process synchronous execution path below the application CRUD code. They did not prove that repeated `asyncio.run()` calls were the root cause.

## Approaches Already Tried

### Native async tests

CRUD tests were written as async pytest tests using an async HTTP client. They still hung on synchronous FastAPI execution. Converting the entire suite to async therefore remains an unproven remedy, not an established fix.

### Async routes over synchronous database work

Temporarily converting the API boundary and database dependency to async made the tests pass. It was rejected because the services and SQLAlchemy sessions remained blocking, producing the wrong production execution model.

### AnyIO executor substitutions

Replacing AnyIO worker execution with the default asyncio executor did not resolve the hangs. A dedicated `ThreadPoolExecutor` improved a minimal reproduction but still failed on real FastAPI paths involving response models and dependency cleanup.

### Partial threadpool patching

Patching only one threadpool layer was insufficient. FastAPI and Starlette use `run_in_threadpool()` for synchronous routes, dependency solving, and response serialization, while synchronous generator dependency entry and exit can call `anyio.to_thread.run_sync()` directly.

## Current Workaround

The test-only `sync_api_test_runtime_shim` in `backend/tests/conftest.py` replaces these call paths with inline execution:

- `starlette.concurrency.run_in_threadpool`;
- `fastapi.routing.run_in_threadpool`;
- `fastapi.dependencies.utils.run_in_threadpool`;
- `fastapi.concurrency.run_in_threadpool`;
- `anyio.to_thread.run_sync`.

The `api_request` fixture still sends real in-process HTTP requests through `httpx.ASGITransport` and `httpx.AsyncClient`, so request parsing, dependency injection, validation, response models, and service-backed behavior remain covered. The compromise is that tests do not exercise the production threadpool execution model.

## Safe Next Investigation

Dependency versions and execution environments may have changed since the original investigation. Remediation should therefore begin by revalidating the narrow failure rather than assuming either that it persists or that async tests solve it:

1. Run an unpatched minimal synchronous FastAPI route through `httpx.ASGITransport` with a bounded timeout.
2. If it succeeds, run one representative API test with a native async client and no shim.
3. Verify the experiment in the ordinary test environment and with the Docker-backed PostgreSQL harness where applicable.
4. Migrate incrementally only if the focused test is stable.
5. If the minimal reproduction still hangs, capture current framework, HTTPX, AnyIO, Python, and pytest-plugin versions and isolate the responsible boundary before changing the harness.

Do not introduce a live-socket server, convert synchronous production routes around blocking database work to async, or migrate the whole suite to async unless new evidence invalidates the earlier results.
