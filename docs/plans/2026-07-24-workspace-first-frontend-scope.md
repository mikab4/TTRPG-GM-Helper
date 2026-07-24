# Workspace-First Frontend Scope And Implementation Plan

> **For implementers:** Use `docs/mockups/workspace-v1.html` as the visual and interaction reference. It is a static prototype, not production code or a Tailwind dependency.

**Goal:** Reframe the v1 frontend as a campaign-first workspace, then add sessions and assets as sections of that workspace without changing the task-8 backend ownership model.

**Architecture:** The Campaign Registry is the default entry point and owns campaign creation. Selecting a campaign opens a campaign-scoped workspace with a persistent campaign switcher and a sidebar for Overview, Entities, Relationships, Sessions, and Assets. All record reads and writes remain scoped to the selected campaign and use the existing typed API client plus local React state.

**Visual reference:** [workspace-v1.html](../mockups/workspace-v1.html). Preserve its dark header, warm-gold campaign switcher, parchment cards, Inter/Cinzel typography, purple primary actions, input/select treatment, and narrow sidebar. Do not add Tailwind, a component library, a state-management library, or a CSS framework.

---

## Non-negotiable visual and interaction contract

The current application’s older dark-shell-plus-wide-horizontal-navigation treatment is superseded for this branch. Do not retain its global navigation rows, its duplicate section labels, or its broad rounded workspace surfaces just because those components already exist. Match the mockup’s hierarchy and proportions first; reuse existing code only where it can be restyled to meet this contract.

### Overall composition

- Use a quiet stone-gray page background with a single dark, sticky application header. The header is application context, not a second navigation bar.
- Center the workspace at approximately `1120px` maximum width. On desktop, use a fixed `250px` sidebar and one fluid main column, separated by about `24px`.
- The dark header uses the same column alignment: a small `Campaign Workspace` brand label above the sidebar column and the campaign switcher aligned over the main column.
- The header contains no World, Search, Extraction, Sessions, or Assets links. The campaign switcher and Campaign Registry entry are the only global navigation controls in this branch.
- The sidebar is one parchment card with workspace-section navigation only. Its active item has a white inset surface, a light purple outline/shadow, and deep-purple text. Do not add another tab row above the content.

### Campaign context

- The current campaign name is the dominant header control, not a breadcrumb substitute. It uses Cinzel, bold weight, and warm gold (`#fde68a`) on the dark switcher surface.
- Pair the name with a small green status dot and a compact `Campaign` affordance. Do not render the current campaign name purple on the dark header; purple there has inadequate visual hierarchy.
- The switcher menu lists campaigns and includes an explicit `Campaign Registry` route. In the production app, selection navigates to the same workspace section for the chosen campaign.
- Within content copy, the selected campaign may use deep purple (`#7e22ce`) on parchment; this is distinct from the warm-gold header treatment.

### Typography and color roles

- Use Inter for all controls, list rows, table-like data, body copy, metadata, and sidebar labels.
- Use Cinzel only for display hierarchy: the campaign switcher name and page titles such as Assets, Entities, Relationships, and Sessions. Do not use Cinzel for filters, row text, or form controls.
- Keep parchment cards near `#fdfcfb`, body ink near `#1c1917`, muted copy near `#78716c`, deep purple `#7e22ce`, and purple hover `#6b21a8`.
- Use purple for primary actions and focus states; use warm gold only for the campaign name and amber only for document/file-type accents. Do not make purple the default text color across the interface.

### Cards, controls, and spacing

- Parchment cards use roughly `16px` radius, a subtle `#e7e5e4` border, and a restrained shadow. Avoid the existing large 20–24px card radius and heavy decorative gradients.
- Page section headers use a thin bottom divider, a 26px Cinzel title, and compact muted helper text.
- Primary section actions (`Add entity`, `Add relationship`, `Add session`) are compact, not pill-like: 26px high, 12px Inter label, 12px horizontal padding, 8px radius, and a deep-purple gradient. They sit at the right edge of the section header.
- The asset drop-zone browse button is intentionally more substantial than those section actions because it is the primary action inside that isolated upload surface.
- Search fields and selects have white fills, 10px radii, 12px text, subtle gray borders, and purple focus rings. Keep entity search and relationship search/type controls compact and aligned in one toolbar on desktop.
- File rows have modest 14–16px padding, 38×42px colored file-type blocks, small metadata, and quiet outline `View` actions. A missing asset is visible with a red status chip but has no Relink or replacement action.

### View-specific behavior

- **Entities:** use a searchable grid/roster. Clicking a card opens the existing quick-look summary beside the roster on desktop; the roster stays visible. The quick-look card shows the entity’s name, type, summary, relationship scent, a close control, and an `Open full record` path. On small screens it stacks below the roster.
- **Relationships:** show searchable relationship cards. Search matches entity names; the relationship-type dropdown combines with it using AND semantics. Relationship cards keep source/target names, relationship type, and short contextual copy scannable.
- **Sessions:** keep the same header/action hierarchy and use the existing or new session list/detail route rather than introducing a separate global sessions screen.
- **Assets:** one drop surface supports drag/drop and browse. Keep search plus a media-family dropdown (Documents, Spreadsheets, Images), not semantic categories inferred from file names.

### Responsive and implementation constraints

- At narrow widths, stack the header/workspace columns, make sidebar section navigation horizontally scrollable, and stack the quick-look panel beneath the roster. Do not hide critical navigation or turn the sidebar into a second header bar.
- Use the existing stylesheet and Lucide React icons in production; the mockup’s Unicode glyphs are layout placeholders, not a production icon system.
- Do not import Tailwind or copy prototype JavaScript into React. The implementation must preserve route-driven navigation, typed API clients, and existing request-state patterns.

### Visual acceptance checklist

- There is exactly one app-level header and exactly one campaign-section navigation surface.
- The active campaign is warm gold in the dark switcher, not deep purple.
- A GM can identify the active campaign, active section, and primary action without scanning two navigation bars.
- Add buttons are visibly smaller than the asset browse button.
- Entity quick look remains beside the roster after selection and does not replace the list.
- No unavailable backend behavior is implied: no parser status, Analyze/Sync action, global World model, app-wide Search, or Relink action.

---

## Approved scope decisions

- Remove the global `World`, `Sessions`, `Assets`, `Search`, and `Extraction` navigation destinations from the persistent shell. They either duplicate a workspace section or represent deferred capability.
- Make `/campaigns` the practical application home and retain its campaign creation affordance.
- Do not create separate top-level Sessions or Assets picker pages. Sessions and Assets exist only under `/campaigns/:campaignId/...` in v1.
- Put campaign switching in the persistent header. Selecting a campaign must navigate to the same workspace section for the selected campaign; it must not merely replace visible text in React state.
- Keep an explicit Campaign Registry link in the switcher menu for returning to `/campaigns`.
- Use sidebar navigation only for selected-campaign sections: Overview, Entities, Relationships, Sessions, and Assets. Do not duplicate these labels in another tab bar.
- Reuse the current entity and relationship create/edit forms and routes. Do not redesign those forms in this branch; revisit only after the sessions/assets flow is complete.
- Preserve the existing entity quick-look side panel: selecting an entity from the campaign roster must continue to open its summary without navigating away. Keep campaign-scoped entity detail/edit and relationship edit routes as the deeper inspection paths.
- Add in-list entity-name search, relationship entity-name search, and relationship-type filtering as simple local filters over the campaign-scoped data already fetched by those views. Persist selected relationship filters in URL query parameters. Do not add a backend search endpoint for these controls.
- Asset type filtering must use API-supported media families (for example documents, spreadsheets, images), not inferred semantic categories such as Maps or Handouts.
- Keep missing assets visible with a local `File missing` status. Do not show Relink, replacement-upload, parser status, Sync, Analyze, or other unsupported operations.
- The Assets upload surface may support both drag-and-drop and a `Choose file or source` button, but they must invoke one upload flow. For the `new session + asset` option, call `POST /sessions` and then multipart `POST /assets`; retain form data after partial success.

## Route and component plan

### Task 1: Reframe the application shell and registry entry

**Files:**

- Modify: `frontend/src/app/AppShell.tsx`
- Modify: `frontend/src/app/routes.tsx`
- Modify: `frontend/src/routes/OverviewPage.tsx` or replace its index route behavior
- Modify: `frontend/src/styles.css`
- Test: `frontend/src/test/` route tests

1. Make the Campaign Registry the default navigational entry point; `/` may redirect to `/campaigns` or render the registry directly.
2. Remove persistent links for World, Session Notes, Extraction, and Search. Remove their placeholder routes unless another implemented workflow still needs a non-persistent direct URL.
3. Add a campaign-switcher header surface that lists campaigns using the existing campaign client. Include `Campaign Registry` as a navigable item.
4. On selection, navigate to the equivalent workspace section for the chosen campaign. If the current page has unsaved form state, use the existing/standard unsaved-change protection before navigation; do not silently discard form input.
5. Apply the mockup’s header, card, typography, button, select, and search-field styling using the project stylesheet.

### Task 2: Turn the campaign workspace navigation into the sidebar

**Files:**

- Modify or replace: `frontend/src/components/CampaignWorkspaceTabs.tsx`
- Modify: `frontend/src/routes/CampaignWorkspacePage.tsx`
- Modify: `frontend/src/styles.css`
- Test: campaign workspace route tests

1. Replace the current horizontal campaign tab strip with the mockup’s sidebar navigation.
2. Keep the active section route-derived, not component-local state, so browser navigation and deep links work.
3. Preserve the existing campaign edit/delete controls without making them compete with section navigation.
4. Add the Sessions and Assets sidebar entries once their routes exist.

### Task 2.1: Fix PostgreSQL connection-pool exhaustion

**Problem confirmed during workspace testing:** `get_db_session()` currently calls
`get_db_session_factory()` for every API request. That factory creates a new SQLAlchemy
engine each time. Closing the request session returns its connection to that newly-created
engine's pool, but the engine and pool remain alive. After enough requests PostgreSQL rejects
new connections with `FATAL: sorry, too many clients already`; the API then fails every request
and the frontend shows `Failed to fetch` throughout the workspace.

**Files:**

- Modify: `backend/app/db.py`
- Modify: `backend/app/api/dependencies.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_db.py` and focused API/bootstrap coverage

1. Create the SQLAlchemy engine and session factory once per backend process, rather than once
   per request. `get_db_session()` must obtain a request-scoped session from that shared factory
   and close it after the response.
2. Keep test configuration explicit: test settings/engines must remain isolated from the
   application process's production engine and must be disposed during test teardown.
3. Dispose the shared engine during FastAPI shutdown so a deliberate backend restart releases
   pooled connections promptly.
4. Add coverage that multiple dependency/session acquisitions reuse the application factory and
   do not create a fresh engine/pool per request. Retain a focused API smoke test that makes
   repeated database-backed requests without connection exhaustion.
5. `docker compose restart backend` is an acceptable temporary local recovery for an already
   exhausted process, but is not the permanent fix and must not be documented as one.

### Task 3: Add campaign-scoped sessions and assets routes plus typed clients

**Files:**

- Create: `frontend/src/api/sessions.ts`
- Create: `frontend/src/api/assets.ts`
- Create: `frontend/src/types/sessions.ts`
- Create: `frontend/src/types/assets.ts`
- Create: `frontend/src/routes/CampaignSessionsTab.tsx`
- Create: `frontend/src/routes/CampaignAssetsTab.tsx`
- Create: session/asset form and detail components only where existing form components cannot be reused
- Modify: `frontend/src/app/routes.tsx`
- Test: `frontend/src/test/` focused API and route tests

1. Match the existing campaign-scoped Session CRUD and multipart Asset API contracts exactly.
2. Add `/campaigns/:campaignId/sessions` and `/campaigns/:campaignId/assets` routes as workspace children. Add detail/edit routes only where the existing route design requires dedicated inspection/editing pages.
3. Show loading, empty, error, delete, lifecycle, and storage states. Normal list/detail reads must not trigger parsing and must not expose parser status.
4. In Assets, implement one upload surface with drag/drop plus a browse button. Support upload-only, upload to an existing session, and new-session-then-upload modes.
5. For failed asset upload after session creation, preserve the created session identity and entered upload values so the asset upload can be retried without creating another session.
6. Do not add a global assets/sessions API, a combined backend endpoint, a file-replacement endpoint, or a public parse action.

### Task 4: Add lightweight retrieval controls to existing campaign views

**Files:**

- Modify: `frontend/src/routes/CampaignEntitiesTab.tsx`
- Modify: `frontend/src/routes/CampaignRelationshipsTab.tsx`
- Modify: `frontend/src/styles.css`
- Test: focused route/component tests

1. Add case-insensitive local entity-name filtering to the campaign entity roster. The backend already returns entities alphabetically by name.
2. Preserve `EntityQuickLookPanel` behavior while filtering: selecting a visible entity opens the existing side summary, and closing it returns the GM to the same filtered roster state.
3. Add a relationship entity-name picker/search that resolves a displayed entity name to its internal ID. The GM never sees or enters an ID.
4. Add an `All relationship types` dropdown populated from the campaign’s relationship type descriptors.
5. Apply both relationship filters with AND semantics: a result must involve the selected entity and match the selected relationship type.
6. Keep the selected entity ID and relationship type in URL search parameters so refresh, browser history, and copied links preserve the filtered view.
7. Reuse the existing entity and relationship forms for all create/edit actions in this branch. Do not add a relationship quick-look panel unless it receives its own approved interaction design.

### Task 5: Test, document, and verify

**Files:**

- Modify: `README.md` only if visible navigation/setup instructions change
- Modify: the task-8 source-of-truth plans listed below
- Test: `frontend/src/test/`

1. Add tests for registry-as-entry routing, campaign switching to the same workspace section, sidebar active state, and direct workspace URLs.
2. Add tests for entity name filtering; relationship entity/type filtering with AND semantics; and URL persistence of relationship filters.
3. Add API-client and route tests for sessions, assets, multipart upload modes, partial-success retry, lifecycle/storage status visibility, and backend conflict messaging.
4. Run `npm test -- --run`, `npm run lint`, `npm run format:check`, and `npm run build` from `frontend/`.

## Explicit non-goals

- No World model, shared-world UI, or global entity truth layer.
- No app-wide search or extraction navigation before the corresponding backend workflows exist.
- No parser status, parse trigger, preview/analysis action, or parser retry UI in task 8.
- No file replacement/relink workflow until the backend defines how original storage replacement preserves checksum, provenance, and parse-cache validity.
- No redesign of the established entity or relationship edit forms in this branch.

## Source-of-truth updates required by this decision

- `docs/plans/2026-03-31-rpg-gm-helper-v1.md`: Task 8 frontend routing now follows this document.
- `docs/plans/2026-04-17-task-8-backend-design-sessions-source-assets.md`: frontend integration remains campaign-scoped and parser-free.
- `docs/plans/2026-04-17-task-8-backend-design-sessions-source-assets-reasoning.md`: campaign-first navigation is a UI decision, not a backend ownership redesign.
