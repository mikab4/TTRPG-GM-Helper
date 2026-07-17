# Possible Technical Debt

## Entity subtype detail tables

Current recommendation for the v1 schema is to keep one generic `entities` table with flexible `metadata`, because that matches the current CRUD, provenance, and future extraction workflow well.

A stronger medium-term alternative is to keep `entities` as the shared canonical root and add 1-to-1 subtype detail tables for entity types that now have stable, meaningful structured fields.

Example direction:
- `entities` keeps shared fields such as `id`, `campaign_id`, `type`, `name`, `summary`, provenance, and timestamps.
- `entity_person_details` uses `entity_id` as both primary key and foreign key to `entities.id`.
- `entity_event_details` uses `entity_id` as both primary key and foreign key to `entities.id`.
- `entity_deity_details` uses `entity_id` as both primary key and foreign key to `entities.id`.

Why this may be worth doing later, and possibly before extraction becomes deeper:
- It gives stronger validation for mature type-specific fields such as person attributes, event timeline fields, or deity domains.
- It makes filtering, sorting, and indexing cleaner than storing everything in `metadata`.
- It keeps one shared entity identity for relationships, search, provenance, and campaign scoping.
- It gives extraction a clearer target shape for stable fields once typed extraction becomes important.
- It avoids the weaker long-term ergonomics of keeping all mature typed fields inside JSON metadata.

Why this was deferred now:
- The current milestone still benefits from one uniform entity shape.
- The project has not yet committed to which typed fields are truly stable enough to deserve schema columns.
- Adding subtype tables too early would increase migrations, service branching, API surface, and form complexity before those benefits are clearly worth it.
- `metadata` remains the cheaper option for exploratory, sparse, or low-confidence attributes.

Important nuance:
- This is not a recommendation to replace `entities` with fully separate top-level tables like `characters`, `events`, and `deities`.
- The better likely direction is a hybrid model: keep `entities` as the root table and add subtype detail tables only for mature, query-heavy types.
- That preserves the current advantages of a generic entity system while allowing stronger structure where the domain has stabilized.

## App-managed database wiring

Current recommendation for the reviewed import-time DB issue was to remove module-level globals and keep explicit factories in `backend/app/db.py`.

A stronger long-term alternative is to create the SQLAlchemy engine during app bootstrap, store it on FastAPI app state, and expose sessions through a FastAPI dependency.

Why this may be worth doing later:
- It fits the app-factory direction better than process-global engine state.
- It makes per-app-instance DB wiring more explicit for tests and future runtime setup.
- It gives a cleaner place to manage engine lifecycle and disposal once DB-backed routes are added.

Why it was deferred now:
- Nothing in the scaffold currently consumes the database layer.
- Adding app-state and dependency wiring now would be extra abstraction before there is a real DB call path to justify it.
- The explicit factory approach already removes the current brittleness without introducing more lifecycle machinery.

## Frontend API schema validation

Current recommendation for the reviewed frontend API client issue was to keep a thin shared fetch helper that returns `unknown` and require endpoint-specific parsing, starting with the health endpoint.

A stronger long-term alternative is to introduce a schema validation library such as Zod at the network boundary and define explicit response schemas for API contracts.

Why this may be worth doing later:
- It would provide runtime validation and inferred TypeScript types from the same source.
- It would scale better once the frontend starts consuming multiple CRUD and search endpoints.
- It would make backend/frontend drift fail in a more standardized and inspectable way.

Why it was deferred now:
- The scaffold currently has only one real response contract.
- A schema library would add dependency and abstraction overhead before there is enough API surface to justify it.
- Endpoint-local parsing already removes the misleading unchecked cast without committing the project to a validation framework yet.

## Repeated frontend request-state pages

Current recommendation for the reviewed frontend CRUD pages was to leave the repeated `loading/error/ready` route pattern in place in pages such as [CampaignFormPage](/home/mikab4/projects/rpg_gm_helper/.worktrees/crud_entities_campaign_frontend/frontend/src/routes/CampaignFormPage.tsx) and [EntityFormPage](/home/mikab4/projects/rpg_gm_helper/.worktrees/crud_entities_campaign_frontend/frontend/src/routes/EntityFormPage.tsx).

A stronger long-term alternative is to introduce a small route-level helper or wrapper for request-state pages once more CRUD surfaces repeat the same shape.

Why this may be worth doing later:
- It would reduce repeated conditional rendering across CRUD routes.
- It would make route components easier to scan by pushing common request-state composition into one place.
- It would lower maintenance cost once more forms and detail pages follow the same fetch-state structure.

Why it was deferred now:
- The repetition is still small and obvious in v1.
- Extracting a shared abstraction too early risks hiding simple route behavior behind indirection.
- There are not enough route variants yet to prove the right reusable shape.

## Forms seeded from initial props

Current recommendation for the reviewed form components was to keep [CampaignForm](/home/mikab4/projects/rpg_gm_helper/.worktrees/crud_entities_campaign_frontend/frontend/src/components/CampaignForm.tsx) and [EntityForm](/home/mikab4/projects/rpg_gm_helper/.worktrees/crud_entities_campaign_frontend/frontend/src/components/EntityForm.tsx) state initialized from `initialValues`, because these forms currently mount fresh per route.

A stronger long-term alternative is to either remount forms explicitly with a stable `key` or add controlled resync behavior if future usage expects prop changes to refresh the form in place.

Why this may be worth doing later:
- It prevents stale form state bugs if a parent starts swapping records without remounting.
- It makes the form behavior more explicit for future reuse outside route-local mount cycles.
- It avoids hidden coupling between routing behavior and form correctness.

Why it was deferred now:
- Current usage mounts these forms fresh per route transition.
- Adding sync effects now would increase complexity and create extra state-reset edge cases without solving a live bug.
- The simpler mount-fresh assumption is still correct for the current CRUD flow.

## Campaign delete post-success flow

Current recommendation for the reviewed campaign delete flow was to keep the explicit post-delete confirmation state in [CampaignWorkspacePage](/home/mikab4/projects/rpg_gm_helper/.worktrees/crud_entities_campaign_frontend/frontend/src/routes/CampaignWorkspacePage.tsx) rather than immediately redirecting to `/campaigns`.

A stronger long-term alternative is to standardize destructive CRUD success flows around automatic navigation back to the parent list once the surrounding router/test setup makes that path boring and reliable.

Why this may be worth doing later:
- It is closer to the usual CRUD admin expectation after deleting a record.
- It would make campaign delete behave more like other parent-list flows in the app.
- It may reduce one extra confirmation surface if users prefer being returned directly to the registry.

Why it was deferred now:
- The current confirmation screen is a valid product choice and is not a correctness bug.
- Immediate redirect introduced router/test-environment issues in the current setup, so forcing it now would add complexity for limited product gain.
- The confirmation state is explicit and reliable while the app is still stabilizing its CRUD flows.


## Remove test sync_api_test_runtime_shim and replace with "Pure Async"

Instead of using asyncio.run() inside your api_request fixture and shimming the threads, make your entire test suite async.
 - Use pytest-asyncio.
 - Define your tests as async def test_....
 - Use an AsyncClient directly. This usually resolves the deadlocks because you aren't constantly jumping between sync and async contexts.

The change I’m proposing focuses on how the test runner talks to the app, not how the app is written.

Here is the breakdown of the "Giacomelli" approach to fixing this without the "magic" shim.

### 1. The Problem with the Current api_request
Currently, your fixture does this:
asyncio.run(send_request())

Every time you call api_request, you are starting a brand new event loop, running one request, and shutting it down. This is what's causing the deadlock. FastAPI is trying to manage a threadpool on an event loop that is constantly being killed and restarted by your test.

### 2. The Clean Solution: Async Tests, Sync App
You can make your tests async while leaving your FastAPI routes exactly as they are (def instead of async def).

FastAPI is designed to handle this. It will see your def route and automatically run it in a threadpool. By making the test suite async, we provide a stable, long-running event loop for that threadpool to talk to.

The "Giacomelli" Refactor
#### Step 1: Update the Fixture
Get rid of asyncio.run and the shim. Use a native async client.

```python
# conftest.py
@pytest.fixture
async def client(test_app):
    # This stays on ONE event loop for the duration of the test
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=test_app), 
        base_url="http://testserver"
    ) as ac:
        yield ac
```

#### Step 2: Update the Test
The test becomes async, but the app stays exactly the same.

```python
# test_campaigns.py
@pytest.mark.anyio  # Or pytest.mark.asyncio
async def test_create_campaign(client, test_owner):
    # The 'await' here only waits for the HTTP cycle.
    # Inside the app, your 'def' routes still run in threads!
    response = await client.post(
        "/api/campaigns",
        json={"owner_id": str(test_owner.id), "name": "Iron Vale"}
    )
    assert response.status_code == 201
```

### 3. Why this is better for Readability
No Voodoo: You can delete the 30 lines of monkeypatch "shim" code.

Realistic Simulation: You are now testing the app exactly as it behaves in production—using httpx to talk to an ASGI app.

Standard Tooling: Any new developer joining the team will understand pytest-asyncio and httpx. No one understands a custom shim that patches the internals of starlette.concurrency.

### The "Jan" Summary
By switching to an async test runner:

Production Code: Stays def (Sync). No changes.

App Logic: Stays blocking/standard. No changes.

Tests: Become async def. This is a standard practice in the FastAPI ecosystem.

You are effectively replacing a fragile, custom hack (the shim) with a standard, robust pattern (async test runner). That is how you pay down technical debt while keeping your architecture "Clean."

## Periodic retry for asset delete maintenance

Current implementation includes an explicit maintenance command for retrying assets left in `lifecycle_status='deleting'` after partial delete failures.

A stronger operational follow-up is to run that maintenance command periodically rather than relying only on manual execution or optional startup hooks.

Why this may be worth doing later:
- It would keep failed asset deletes from lingering indefinitely in long-running deployments.
- It would make recovery from transient filesystem or environment issues more automatic.
- It would bound the amount of temporary delete-recovery state that accumulates in `source_assets`.

Why it was deferred now:
- The current branch only needs the explicit retry path to make delete failures recoverable and observable.
- Adding a scheduler or background maintenance runner now would increase operational complexity beyond the current v1 needs.
- A periodic trigger mechanism is better chosen once the project decides how backend maintenance tasks should be hosted and scheduled.

## Maintenance command row claiming for asset deletes

Current implementation lets the retry maintenance command scan all assets in `lifecycle_status='deleting'` and attempt storage cleanup immediately.

That is acceptable for the current local filesystem backend because storage delete is idempotent, so a live delete request and the maintenance command can both try to delete the same file without usually corrupting state.

Why this may be worth tightening later:
- It currently allows duplicate work between an in-flight delete request and the maintenance command.
- It relies on storage-delete idempotency instead of making ownership explicit in the database.
- Future storage backends may not have the same harmless double-delete semantics as the current local filesystem implementation.

A stronger long-term alternative is to make the maintenance path claim rows before acting, for example with `SELECT ... FOR UPDATE SKIP LOCKED` and an age threshold on `delete_started_at` or `delete_last_error_at`.

Why it was deferred now:
- The current local storage delete implementation tolerates concurrent retries well enough for v1.
- Adding row claiming or lease-style coordination now would complicate the maintenance flow before there is evidence the simpler approach is operationally insufficient.
- The current branch already makes delete failures visible and retryable, which is the main v1 requirement.

## Centralize asset delete blockers

Current implementation determines whether a source asset can be deleted by checking a hard-coded list of dependent tables in the asset service.

That is acceptable for the current v1 shape, but it means every new table that references `source_assets` may require coordinated updates in multiple places:
- the delete-blocking guard in the service layer
- the DB trigger coverage for rejecting new references while `lifecycle_status='deleting'`
- tests that prove both the pre-delete blocker behavior and the commit-race behavior

Why this may be worth changing later:
- It spreads one business rule across multiple schema and service touchpoints.
- It creates a maintenance trap where a new `source_asset_id` dependent can be added without also updating delete coordination.
- It makes the delete policy harder to reason about as more asset-linked workflows are introduced.

A stronger long-term alternative is to centralize asset references in a dedicated table such as `source_asset_references`, with rows that identify the referencing record kind and id. Then delete-block checks can query one canonical source instead of knowing every dependent table by name.

Why it was deferred now:
- The current codebase has only a small number of asset-dependent tables, so the explicit approach is still understandable.
- Introducing a generalized asset-reference registry would be a real schema and workflow change, not a small refactor.
- The branch priority is to keep delete behavior correct and recoverable first, then centralize the rule once more asset-linked surfaces justify the extra structure.
