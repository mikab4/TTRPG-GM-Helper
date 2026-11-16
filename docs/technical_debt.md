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

## Entities tab differs from the mockup

**Priority:** Medium

**Where:** `frontend/src/routes/CampaignEntitiesTab.tsx`, `frontend/src/components/CampaignEntityRoster.tsx`, `frontend/src/components/EntityQuickLookPanel.tsx`, `frontend/src/components/CampaignWorkspaceTabs.tsx`, `frontend/src/styles.css`

`AGENTS.md` requires the frontend to match the mockup unless a deviation is approved. The first `npm run mockup:compare -- entities` run found these unapproved differences from the mockup's Entities view. None are recorded in `docs/mockups/design-deviations.md`. Re-run the command for exact values at each width.

| Area | Difference |
|------|------------|
| Layout | The mockup has a narrow list column and a wide detail card; the app has a wide list panel and a narrow quick-look panel. The mockup list has no surrounding panel. Page content in the app is narrower and shifted right |
| Base type size | The app's body text is 16px; the mockup's is 14px. Most cards, buttons, and text in the app are larger as a result |
| Sidebar | The app shows Overview and Relationships and has no Live Session item; count pills are missing; the label reads "Workspace navigation" instead of "Navigation"; icons and weights differ |
| Header and actions | The brand reads "Campaign Workspace" instead of "GM Command Center"; the add button reads "New Entity" (smaller) instead of "+ Add Entity"; the subtitle says "things" instead of "key items" |
| Entity list | No search icon, different placeholder, and no category filter chips. Cards are taller: the type badge wraps under the name, summaries are 16px instead of 11px and wrap instead of truncating, and the app adds Edit/Delete links and relationship pills. Badges use purple pills instead of grey tags |
| Detail pane | The title uses Inter instead of Cinzel; the type badge and summary are not on one line above the title; Edit and Delete are a stacked button column at the bottom instead of small buttons top right; the app adds a Close button; the Description, Secret GM Notes, and Connected Entities sections are missing |

**Recommended action:** Treat each row as a separate design change. For each, either match the mockup or record an approved deviation. Some gaps (secret notes, category filters, live session) need product behavior first.

**Done when:** `npm run mockup:compare -- entities` reports no difference that is not recorded in `docs/mockups/design-deviations.md`.

## Mockup comparison covers only the Entities tab

**Priority:** Low

**Where:** `frontend/scripts/mockup-compare/screens.ts`

`npm run mockup:compare` has one screen definition, `entities`. Every other screen can drift from the mockup unchecked, and the `verify-ui-against-mockup` skill has to build a definition first.

Screens to add:

| Screen | Mockup view → app route component | Notes |
|--------|-----------------------------------|-------|
| `sessions` | `#sessions` → `CampaignSessionsTab` | Needs campaigns and sessions fixtures. Smallest next step |
| `session-detail` | `#session-detail` → `SessionDetailPage` | |
| `session-edit` | `#session-edit` → `SessionFormPage` in edit mode | |
| `assets` | `#assets` → `CampaignAssetsTab` | Needs assets and sessions fixtures; the largest screen |
| `asset-detail`, `asset-edit` | `#asset-detail`, `#asset-edit` → `AssetDetailPage`, `AssetEditPage` | |

Possible problems:

| Problem | Detail |
|---------|--------|
| Different structure | The mockup edits an entity inside the detail pane (`#entity-editor-view`); the app uses a separate `EntityEditPage`. The mockup adds a relationship in a modal (`#relationship-modal`); the app uses `RelationshipFormPage`. Style measurements across different layouts are less useful, and the structural difference is itself an unapproved deviation |
| No app route | Live Session (`#live-session`) has no app screen to compare |
| No mockup design | The campaigns list, campaign form, Overview tab, Relationships tab, relationship types pages, and full entity profile page have no mockup view. `AGENTS.md` requires an approved design before there is anything to compare against |
| Mockup sub-views | The detail and edit views are hidden sections that the mockup's own scripts open. Each definition needs a `prepareMockup` step that opens the right view, and that step breaks if the mockup's markup or scripts change |
| Fixtures need upkeep | Every screen adds fake API routes. They are typed with `frontend/src/types`, so missing fields fail the build, but a new API call in a component fails the run until it is faked in `screens.ts` |
| Brittle selectors | Some mockup selectors are structural (for example `> div:nth-child(2)`) because the mockup uses inline styles. Mockup edits can break them; the run reports a missing selector instead of passing silently |
| Missing app hooks | Some app elements may lack a stable class to select. Adding `data-ui` attributes changes application code and needs approval first |

**Recommended action:** Add definitions one screen at a time, starting with `sessions`. For each new screen, record its differences in this file the same way as "Entities tab differs from the mockup".

**Done when:** Every screen that has a mockup view has a definition in `screens.ts`, and its differences are either fixed, approved, or listed here.
