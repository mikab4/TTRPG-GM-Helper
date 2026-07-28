# Campaign Workspace Layout: Existing Screens Scope And Implementation Plan

> **For implementers:** Use `docs/mockups/workspace-v1.html` as the visual and interaction reference. It is a static prototype, not production code or a Tailwind dependency.

**Goal:** Reframe the existing campaign, overview, entity, and relationship frontend as a campaign-first workspace. This plan deliberately excludes new Sessions and Assets UI.

**Architecture:** The Campaign Registry is the default entry point and owns campaign creation. Selecting a campaign opens a campaign-scoped workspace with a persistent campaign switcher and a sidebar for Overview, Entities, and Relationships. All record reads and writes remain scoped to the selected campaign and use the existing typed API client plus local React state.

**Visual reference:** [workspace-v1.html](../mockups/workspace-v1.html). Preserve its dark header, warm-gold campaign switcher, parchment cards, Inter/Cinzel typography, purple primary actions, input/select treatment, and narrow sidebar. Do not add Tailwind, a component library, a state-management library, or a CSS framework.

## Scope boundary

This is the current-branch handoff. It implements original Tasks 1, 2, 2.1, and 4 against what already exists: the Campaign Registry, Overview, Entities, and Relationships.

- Do not add Sessions or Assets routes, typed clients, sidebar entries, upload controls, or placeholder screens in this phase.
- Reserve Sessions and Assets for [the follow-up handoff](2026-07-24-campaign-sessions-assets-frontend-scope.md). That plan extends this established shell rather than recreating it.
- Task 2.1 is included because its backend fix is necessary for reliable workspace use. The current branch already contains the app-scoped engine fix; retain its tests and do not reintroduce request-scoped engine creation.

## Implementation record

Completed in this branch:

- Campaign Registry entry, persistent campaign switcher, and route-derived workspace sidebar for Overview, Entities, and Relationships.
- Mockup-aligned workspace visual language and responsive composition.
- Local entity-name filtering, retained entity quick look, relationship entity/type AND filtering, and URL-backed relationship filter restoration.
- A selected-entity roster-card treatment for the open quick-look record.
- Workspace delete feedback and duplicate-submit protection for entities.
- Entity deletion cascades related relationship rows through matching ORM and database cascade configuration.
- Unsaved campaign, entity, and relationship form changes now block internal navigation and browser unload until saved or explicitly discarded.

Sessions and Assets remain deferred to the follow-up handoff; no frontend routes or controls for them were added here.

---

## Non-negotiable visual and interaction contract

The older dark-shell-plus-wide-horizontal-navigation treatment is superseded. Match the mockup’s hierarchy and proportions first; reuse existing code only where it can be restyled to meet this contract.

### Overall composition and campaign context

- Use a quiet stone-gray page background with one dark, sticky application header. The header is application context, not a second navigation bar.
- Center the workspace at approximately `1120px` maximum width. On desktop, use a fixed `250px` sidebar and one fluid main column, separated by about `24px`.
- The header uses the same column alignment: a small `Campaign Workspace` brand label above the sidebar column and the campaign switcher aligned over the main column.
- The header contains no World, Search, Extraction, Sessions, or Assets links. The campaign switcher and Campaign Registry entry are the only global navigation controls.
- The sidebar is one parchment card with only Overview, Entities, and Relationships navigation in this phase. Its active item has a white inset surface, a light purple outline/shadow, and deep-purple text. Do not add another tab row above the content.
- The current campaign name is the dominant header control. It uses Cinzel, bold weight, and warm gold (`#fde68a`) on the dark switcher surface, alongside a small green status dot and compact `Campaign` affordance.
- The switcher menu lists campaigns and includes an explicit `Campaign Registry` route. Selecting a campaign navigates to the same workspace section for the chosen campaign.

### Typography, controls, and responsive behavior

- Use Inter for controls, roster rows, body copy, metadata, and sidebar labels. Use Cinzel only for the campaign switcher name and display titles such as Entities and Relationships.
- Keep parchment cards near `#fdfcfb`, body ink near `#1c1917`, muted copy near `#78716c`, deep purple `#7e22ce`, and purple hover `#6b21a8`.
- Parchment cards use roughly `16px` radius, a subtle `#e7e5e4` border, and a restrained shadow. Page headers use a thin divider, 26px Cinzel title, and compact muted helper text.
- `Add entity` and `Add relationship` are compact: 26px high, 12px Inter label, 12px horizontal padding, 8px radius, and a deep-purple gradient. Place them at the right edge of their section header.
- Search fields and selects have white fills, 10px radii, 12px text, subtle gray borders, and purple focus rings. Keep entity search and relationship search/type controls compact and aligned in one desktop toolbar.
- At narrow widths, stack the header/workspace columns, make the sidebar navigation horizontally scrollable, and stack the entity quick-look panel beneath the roster. Do not hide critical navigation or turn the sidebar into a second header bar.
- Use the existing stylesheet and Lucide React icons. The mockup’s Unicode glyphs are placeholders. Do not import Tailwind or copy prototype JavaScript into React.

### Existing-view behavior and acceptance criteria

- **Entities:** use a searchable grid/roster. Selecting a card opens the existing quick-look summary beside the roster on desktop; it does not replace the roster. The panel retains its name, type, summary, relationship scent, close control, and `Open full record` path.
- **Relationships:** show searchable relationship cards. Search matches entity names; the relationship-type dropdown combines with it using AND semantics. Keep source/target names, type, and contextual copy scannable.
- There is exactly one app-level header and exactly one campaign-section navigation surface.
- The active campaign is warm gold in the dark switcher, not deep purple.
- A GM can identify the active campaign, active section, and primary action without scanning two navigation bars.
- Entity quick look remains beside the filtered roster after selection.
- Do not imply unavailable behavior: no parser status, Analyze/Sync action, global World model, app-wide Search, Relink action, Sessions, or Assets UI.

---

## Approved scope decisions

- Remove persistent `World`, `Sessions`, `Assets`, `Search`, and `Extraction` destinations. Sessions and Assets are deferred, while the others either duplicate a workspace section or represent deferred capability.
- Make `/campaigns` the practical application home and retain campaign creation there.
- Put campaign switching in the persistent header. Navigation is route-driven, not a visible-text replacement in React state, and must preserve the current workspace section.
- Keep an explicit Campaign Registry link in the switcher menu for returning to `/campaigns`.
- Reuse current entity and relationship create/edit forms and routes. Do not redesign them in this phase.
- Preserve the existing entity quick-look side panel and campaign-scoped detail/edit routes.
- Add local entity-name filtering plus relationship entity-name and relationship-type filtering over already-fetched campaign data. Persist relationship filters in URL query parameters. Do not add a backend search endpoint.

## Route and component plan

### Task 1: Reframe the application shell and registry entry

**Files:**

- Modify: `frontend/src/app/AppShell.tsx`
- Modify: `frontend/src/app/routes.tsx`
- Modify: `frontend/src/routes/OverviewPage.tsx` or replace its index route behavior
- Modify: `frontend/src/styles.css`
- Test: `frontend/src/test/` route tests

1. Make the Campaign Registry the default entry point; `/` may redirect to `/campaigns` or render the registry directly.
2. Remove persistent links for World, Session Notes, Extraction, and Search. Remove placeholder routes unless another implemented workflow still needs a non-persistent direct URL.
3. Add a campaign-switcher header using the existing campaign client, including `Campaign Registry` as a navigable item.
4. Navigate to the equivalent existing workspace section for the selected campaign. Protect unsaved form state; do not silently discard input.
5. Apply the mockup’s header, card, typography, button, select, and search-field styling through the project stylesheet.

### Task 2: Turn the current campaign workspace navigation into the sidebar

**Files:**

- Modify or replace: `frontend/src/components/CampaignWorkspaceTabs.tsx`
- Modify: `frontend/src/routes/CampaignWorkspacePage.tsx`
- Modify: `frontend/src/styles.css`
- Test: campaign workspace route tests

1. Replace the current horizontal campaign tab strip with the sidebar navigation.
2. Keep the active section route-derived so browser navigation and deep links work.
3. Include only Overview, Entities, and Relationships in this branch.
4. Preserve campaign edit/delete controls without making them compete with section navigation.

### Task 2.1: Preserve the app-scoped PostgreSQL engine and connection-pool fix

**Files:**

- Verify: `backend/app/db.py`
- Verify: `backend/app/api/dependencies.py`
- Verify: `backend/app/main.py`
- Test: `backend/tests/test_db.py` and focused API/bootstrap coverage

1. Keep one SQLAlchemy engine and session factory per backend process; `get_db_session()` obtains a request-scoped session from that shared factory and closes it after the response.
2. Keep test settings and engines explicit, isolated from the application engine, and disposed during teardown.
3. Dispose the shared engine during FastAPI shutdown.
4. Retain coverage that repeated dependency/session acquisition reuses the factory and repeated database-backed API requests do not exhaust connections.
5. `docker compose restart backend` remains only a temporary recovery for an already-exhausted process, never the documented fix.

### Task 4: Add lightweight retrieval controls to existing campaign views

**Files:**

- Modify: `frontend/src/routes/CampaignEntitiesTab.tsx`
- Modify: `frontend/src/routes/CampaignRelationshipsTab.tsx`
- Modify: `frontend/src/styles.css`
- Test: focused route/component tests

1. Add case-insensitive local entity-name filtering. The backend already returns entities alphabetically by name.
2. Preserve quick-look behavior while filtering: selecting a visible entity opens the side summary, and closing it returns to the same filtered roster.
3. Add a relationship entity-name picker/search that resolves a displayed name to its internal ID; never expose or require an ID.
4. Add an `All relationship types` dropdown populated from the campaign relationship-type descriptors.
5. Apply both relationship filters with AND semantics.
6. Keep selected entity ID and relationship type in URL search parameters so refresh, history, and copied links preserve the filtered view.
7. Reuse existing entity and relationship forms. Do not add a relationship quick-look panel.

### Verification, documentation, and handoff

1. Add tests for registry-as-entry routing, campaign switching to the same workspace section, sidebar active state, and direct workspace URLs.
2. Add tests for entity-name filtering, relationship entity/type AND filtering, and URL persistence.
3. Run `npm test -- --run`, `npm run lint`, `npm run format:check`, and `npm run build` from `frontend/`.
4. Run focused backend test coverage for Task 2.1 and `uv run ruff check` for any backend changes.
5. Update README only if visible navigation or setup instructions change. Keep the future Sessions/Assets plan linked from the Task 8 source-of-truth docs.

## Explicit non-goals

- No Sessions or Assets UI, routes, clients, upload flow, or sidebar entries.
- No World model, shared-world UI, global entity truth layer, app-wide search, or extraction navigation.
- No parser status, parse trigger, preview/analysis action, parser retry UI, file replacement, or Relink flow.
- No redesign of established entity or relationship edit forms.
