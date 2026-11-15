# Repository Issues

Code fixes found while building agent skills. Each entry is a problem that code can prevent better than a skill instruction can, or a design point to reconsider later. Fix these after the skill work in `docs/plans/2026-11-15-cross-agent-tooling.md` is done.

## Alembic Revision IDs Are Not Enforced

**Where:** `backend/alembic/env.py`

**Problem:** Existing migrations use `YYYYMMDD_NNNN` revision IDs and `YYYYMMDD_NNNN_slug.py` file names (for example `20260502_0003_sessions_source_assets_reshape.py`). Nothing enforces this. Plain `uv run alembic revision -m "..."` creates a random hash ID, so any agent or human who forgets `--rev-id` breaks the pattern.

**Why fix it in code:** A skill instruction only helps when the skill is loaded. A code fix works every time, for every agent and human.

**Proposed fix:** Add a `process_revision_directives` callback in `env.py`. When no `--rev-id` is given, it sets the ID to today's date plus the next sequence number after the current head. Add a test that generates a revision and checks the ID format.

**Until fixed:** Pass `--rev-id YYYYMMDD_NNNN` by hand.

## No Check That Models Match Migrations

**Where:** `backend/tests/test_migrations.py`

**Problem:** Nothing fails when a SQLAlchemy model in `backend/app/models/` changes without a matching migration. Schema tests only check the columns they list, and the SQLite tests build tables from the models, so a missing migration can pass the whole suite and fail only against a real database.

**Why fix it in code:** A forgotten migration is easy to miss in review and costly to debug later. A test catches it on every run.

**Proposed fix:** Add a PostgreSQL test that upgrades to `head` and asserts `alembic.autogenerate.compare_metadata(...)` against `Base.metadata` returns no differences (the same check `uv run alembic check` runs, with `compare_type=True` already set in `env.py`). Expect a few known differences to whitelist, such as the `'{}'::jsonb` server defaults.

## Entities Tab Differs From the Mockup

**Where:** `frontend/src/routes/CampaignEntitiesTab.tsx`, `frontend/src/components/CampaignEntityRoster.tsx`, `frontend/src/components/EntityQuickLookPanel.tsx`, `frontend/src/components/CampaignWorkspaceTabs.tsx`, `frontend/src/styles.css`

**Problem:** The first `npm run mockup:compare -- entities` run (Task 7 of the cross-agent tooling plan) found these unapproved differences from the mockup's Entities view. None are recorded in `docs/mockups/design-deviations.md`. Re-run the command for exact values at each width.

- **Layout:** the mockup has a narrow list column and a wide detail card; the app has a wide list panel and a narrow quick-look panel. The mockup list has no surrounding panel. Page content in the app is narrower and shifted right.
- **Base type size:** the app's body text is 16px; the mockup's is 14px. Most cards, buttons, and text in the app are larger as a result.
- **Sidebar:** the app shows Overview and Relationships and has no Live Session item; count pills are missing; the label reads "Workspace navigation" instead of "Navigation"; icons and weights differ.
- **Header and actions:** the brand reads "Campaign Workspace" instead of "GM Command Center"; the add button reads "New Entity" (smaller) instead of "+ Add Entity"; the subtitle says "things" instead of "key items".
- **Entity list:** no search icon, different placeholder, and no category filter chips. Cards are taller: the type badge wraps under the name, summaries are 16px instead of 11px and wrap instead of truncating, and the app adds Edit/Delete links and relationship pills. Badges use purple pills instead of grey tags.
- **Detail pane:** the title uses Inter instead of Cinzel; the type badge and summary are not on one line above the title; Edit and Delete are a stacked button column at the bottom instead of small buttons top right; the app adds a Close button; the Description, Secret GM Notes, and Connected Entities sections are missing.

**Why fix it in code:** `AGENTS.md` requires the frontend to match the mockup unless a deviation is approved.

**Proposed fix:** Treat each bullet as a separate design change. For each, either match the mockup or record an approved deviation. Some gaps (secret notes, category filters, live session) need product behavior first.

## Mockup Comparison Covers Only the Entities Tab

**Where:** `frontend/scripts/mockup-compare/screens.ts`

**Problem:** `npm run mockup:compare` has one screen definition, `entities`. Every other screen can drift from the mockup unchecked, and the `verify-ui-against-mockup` skill has to build a definition first.

**Screens to add** (mockup view → app route component):

- `sessions`: `#sessions` → `CampaignSessionsTab`. Needs campaigns and sessions fixtures. Smallest next step.
- `session-detail`: `#session-detail` → `SessionDetailPage`.
- `session-edit`: `#session-edit` → `SessionFormPage` in edit mode.
- `assets`: `#assets` → `CampaignAssetsTab`. Needs assets and sessions fixtures; the largest screen.
- `asset-detail` and `asset-edit`: `#asset-detail`, `#asset-edit` → `AssetDetailPage`, `AssetEditPage`.

**Possible problems:**

- **Different structure:** the mockup edits an entity inside the detail pane (`#entity-editor-view`); the app uses a separate `EntityEditPage`. The mockup adds a relationship in a modal (`#relationship-modal`); the app uses `RelationshipFormPage`. Style measurements across different layouts are less useful, and the structural difference is itself an unapproved deviation.
- **No app route:** Live Session (`#live-session`) has no app screen to compare.
- **No mockup design:** the campaigns list, campaign form, Overview tab, Relationships tab, relationship types pages, and full entity profile page have no mockup view. `AGENTS.md` requires an approved design before there is anything to compare against.
- **Mockup sub-views:** the detail and edit views are hidden sections that the mockup's own scripts open. Each definition needs a `prepareMockup` step that opens the right view, and that step breaks if the mockup's markup or scripts change.
- **Fixtures need upkeep:** every screen adds fake API routes. They are typed with `frontend/src/types`, so missing fields fail the build, but a new API call in a component fails the run until it is faked in `screens.ts`.
- **Brittle selectors:** some mockup selectors are structural (for example `> div:nth-child(2)`) because the mockup uses inline styles. Mockup edits can break them; the run reports a missing selector instead of passing silently.
- **Missing app hooks:** some app elements may lack a stable class to select. Adding `data-ui` attributes changes application code and needs approval first.

**Proposed fix:** Add definitions one screen at a time, starting with `sessions`. For each new screen, log its differences in this file the same way as "Entities Tab Differs From the Mockup".
