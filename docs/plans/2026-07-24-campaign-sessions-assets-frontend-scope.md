# Campaign Sessions And Assets Frontend Scope And Implementation Plan

> **For implementers:** Use `docs/mockups/workspace-v1.html` as the visual and interaction reference. It is a static prototype, not production code or a Tailwind dependency.

**Goal:** Add campaign-scoped Sessions and Assets to the established campaign workspace without changing the task-8 backend ownership model.

**Architecture:** This plan extends the layout established by [the existing-screens handoff](2026-07-24-workspace-layout-frontend-scope.md). Sessions and Assets become route-driven children of the selected campaign workspace. Their typed clients match the existing campaign-scoped APIs, and the combined new-session-plus-asset experience remains frontend orchestration of two backend calls.

## Prerequisite and scope boundary

Implement this only after the campaign workspace layout handoff is complete. It assumes the persistent campaign switcher, route-derived sidebar, Campaign Registry entry, and shared visual language already exist.

- Add Sessions and Assets as sidebar entries only when their routes exist.
- Do not reopen the shell/navigation decisions from the layout plan unless a backend contract changes; this is an extension, not a second redesign.
- Keep all session and asset reads/writes campaign-scoped. Do not introduce global picker pages or global backend APIs.

---

## Shared visual and interaction contract

- Retain the one dark, sticky application header; the warm-gold campaign switcher; the Campaign Registry entry; the parchment sidebar; and the route-derived active state from the layout plan.
- Extend the sidebar from Overview, Entities, and Relationships to include Sessions and Assets. Do not add a tab row or a second global navigation surface.
- Use Cinzel only for display titles such as Sessions and Assets; keep Inter for controls, rows, metadata, and body copy.
- Use the established parchment cards, compact page headers, purple focus/primary treatment, white 10px-radius controls, and responsive stacked workspace behavior.
- `Add session` follows the compact section-action dimensions. The asset drop-zone browse button is intentionally more substantial because it is the primary action inside that isolated upload surface.
- File rows use modest 14–16px padding, 38×42px colored file-type blocks, small metadata, and quiet outline `View` actions. A missing asset has a red `File missing` status chip and no Relink or replacement control.
- Sessions use the same header/action hierarchy and their campaign-scoped list/detail route; do not introduce a separate global Sessions screen.
- Assets provide one drop surface for drag/drop and browse, plus search and an API-supported media-family dropdown (Documents, Spreadsheets, Images). Do not infer semantic categories from filenames.
- Normal session and asset list/detail reads must not trigger parsing or expose parser status.

## Approved scope decisions

- Session and Asset routes exist only under `/campaigns/:campaignId/...` in v1.
- Match the existing campaign-scoped Session CRUD and multipart Asset API contracts exactly.
- The upload form may support upload-only, upload to an existing session, and new-session-then-upload. The last option calls `POST /sessions`, then multipart `POST /assets`; do not add a combined backend endpoint.
- If the asset upload fails after session creation, retain the created session identity and entered upload values so retrying does not create a duplicate session.
- Asset filters use supported media families. Keep missing assets visible with lifecycle/storage status and no parser, Sync, Analyze, Relink, or replacement behavior.
- Use full-page routes for individual Session and Asset details and edits. Asset detail is metadata-only until a separately scoped file-content endpoint exists.
- The Assets media-family dropdown is server-filtered. Add a campaign-scoped `media_family` query parameter to the asset-list contract, with the controlled values `document`, `spreadsheet`, and `image`; the backend owns the MIME-type-to-family mapping.
- The Session form maps its user-facing title to `session_label`. `session_number` and `session_label` are each optional, but the form requires at least one; Session details use `session_label` as their heading and fall back to `Session {session_number}`.
- Detail pages resolve their existing linked records with campaign-scoped list reads: Session detail lists assets and filters them by `session_id`; Asset detail lists sessions and matches its `session_id`. Do not add aggregate/detail endpoints for this v1 presentation.
- The upload surface accepts one file per submission, matching the existing multipart API. Do not add a multi-file queue or its extra partial-failure behavior.
- Partial-upload retry may retain the selected `File` only while the upload screen remains mounted. After navigation or refresh, retain the created Session identity and non-file values but require file reselection.
- The static mockup may show exploratory controls such as private notes, linked entities, and file download/view. They are not implementation scope unless a backend contract is added in a later plan.

## Route and component plan

### Prerequisite: add the campaign-scoped asset media-family filter

This backend contract must land before the Assets frontend is implemented.

1. Extend only `GET /campaigns/{campaign_id}/assets` with an optional `SourceAssetMediaFamily` `StrEnum`-validated `media_family` query parameter. Its values are `document`, `spreadsheet`, and `image`; omit it to return all campaign assets.
2. Keep MIME-type-to-family mapping backend-owned: PDFs, plain text, and Markdown are documents; CSV, XLS, and XLSX are spreadsheets; GIF, JPEG, PNG, and WebP are images. Do not infer a family from a filename.
3. An invalid media-family value returns FastAPI's ordinary `422` validation response. Do not add another endpoint or a derived `media_family` field to Asset responses; `media_type` remains the stored source fact.
4. Add backend API tests for each family, omitted-filter behavior, campaign scoping, and invalid input.

### Task 3: Add campaign-scoped sessions and assets routes plus typed clients

**Files:**

- Create: `frontend/src/api/sessions.ts`
- Create: `frontend/src/api/assets.ts`
- Create: `frontend/src/types/sessions.ts`
- Create: `frontend/src/types/assets.ts`
- Create: `frontend/src/routes/CampaignSessionsTab.tsx`
- Create: `frontend/src/routes/CampaignAssetsTab.tsx`
- Create: session/asset form and detail components only where existing form components cannot be reused
- Modify: `frontend/src/app/AppShell.tsx`
- Modify: `frontend/src/components/CampaignWorkspaceTabs.tsx` or its layout-plan replacement
- Modify: `frontend/src/app/routes.tsx`
- Modify: `frontend/src/styles.css`
- Test: `frontend/src/test/` focused API and route tests

1. Add `/campaigns/:campaignId/sessions` and `/campaigns/:campaignId/assets` as workspace children, then add their sidebar entries. Add `/campaigns/:campaignId/sessions/:sessionId`, `/campaigns/:campaignId/sessions/:sessionId/edit`, `/campaigns/:campaignId/assets/:assetId`, and `/campaigns/:campaignId/assets/:assetId/edit` as full-page workspace routes. Update the campaign-switcher path helper so switching campaigns preserves the Sessions or Assets workspace section.
2. Implement typed Session CRUD and multipart Asset client functions that match the approved backend contracts, including the planned campaign-scoped `media_family` asset-list filter.
3. Show loading, empty, error, delete, lifecycle, and storage states. Normal list/detail reads do not trigger parsing and do not expose parser status.
4. Implement one single-file asset upload surface with drag/drop and a browse button. Support upload-only, upload to an existing session, and new-session-then-upload modes through one upload flow. Register all Session and Asset new/edit forms with the established unsaved-changes guard.
5. Preserve partial-success state after a session is created but its asset upload fails, including the created session identity and entered values needed to retry only the upload.
6. Keep asset media-family filtering API-supported. Do not add a global assets/sessions API, a combined backend endpoint, a file-replacement endpoint, or a public parse action.

### Verification, documentation, and handoff

1. Add API-client and route tests for sessions, assets, multipart upload modes, partial-success retry, lifecycle/storage status visibility, and backend conflict messaging.
2. Add route tests proving Sessions and Assets are campaign-scoped workspace children, the campaign switcher preserves the current Sessions or Assets section when switching campaigns, linked-record detail reads remain campaign-scoped, and new/edit forms participate in the unsaved-changes guard.
3. Run `npm test -- --run`, `npm run lint`, `npm run format:check`, and `npm run build` from `frontend/`.
4. Update README only if visible navigation or setup instructions change. Keep the task-8 source-of-truth plans aligned with the campaign-scoped, parser-free UI contract.

## Explicit non-goals

- No global Sessions or Assets picker pages, global API, World model, shared-world UI, app-wide search, or extraction navigation.
- No parser status, parse trigger, preview/analysis action, parser retry UI, file replacement, or Relink flow.
- No combined session-and-asset backend endpoint.
- No redesign of established entity or relationship edit forms.
