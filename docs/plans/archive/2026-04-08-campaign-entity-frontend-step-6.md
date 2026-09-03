# Campaign And Entity Frontend Step 6 Redesign Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the campaign and entity frontend into a dark arcane workspace that is still fast for CRUD, keeps campaign context visible, and prepares the UI for relationship-heavy workflows without changing backend ownership semantics yet.

**Architecture:** Keep the frontend as a thin React SPA with route-level pages, a plain typed API client, and local component state for request handling. Preserve backend ownership of domain rules and keep the current campaign-owned persistence model, but shift the information architecture and visual system toward a dual-equal, campaign-aware workspace.

**Tech Stack:** React, TypeScript, React Router, Vite, Vitest, Testing Library, FastAPI

---

## Summary

This step keeps the existing campaign/entity CRUD slice, but redesigns it around four UX goals:

- a dark arcane shell with parchment content panels
- a resilient overview that still provides value when the backend is offline
- dual-equal navigation where campaign work and world browsing are both first-class
- progressive disclosure for entity browsing through list, quick-look side panel, and full record

The backend remains campaign-first. The frontend should stop implying that this is the final long-term truth model, but it must not invent unsupported world/campaign persistence behavior.

## Key Changes

### Backend support for single-user owner discovery

- Add a minimal owner schema, service, and API route that returns the local default owner for v1.
- If no owner row exists yet, lazily create one with stable local defaults so the first campaign can be created from the frontend without a manual UUID bootstrap step.
- Keep this endpoint narrow and internal to the single-user v1 workflow rather than introducing full owner CRUD.

### Frontend information architecture

- Keep the existing CRUD routes and campaign-scoped entity detail URLs.
- Rename the top-level `Entities` navigation concept to `World` in the shell so cross-campaign browsing has explicit scope.
- Keep campaign workspace routes as the operational home for campaign-specific editing.
- Maintain internal campaign sub-navigation so a selected campaign behaves like a cockpit rather than a dead-end detail page.

### Frontend visual and interaction redesign

- Replace the warm notebook-admin shell with a dark arcane shell and parchment reading/editing surfaces.
- Adapt the shell/header composition toward the approved reference direction:
  - stronger dark header chrome
  - quick-find utility in the header
  - purple-gold accent treatment over parchment main surfaces
- Keep decorative typography limited to major headings; functional surfaces stay optimized for scanning.
- Redesign the overview around the approved layout:
  - context header with `Global View` and `Overview`
  - `Session Scratchpad`
  - `Recent Entities`
  - offline utility bar wording and server command callout
- Add local-only quick-draft behavior so the overview remains useful while disconnected.
- Reframe entity list content around relationship scent instead of generic summary wording.
- Add a quick-look side panel from entity lists so users can inspect a record without leaving the list context.
- Replace the campaign registry table with campaign cards so entering a workspace feels like opening a campaign surface rather than selecting a row in admin CRUD.
- Replace the campaign workspace entity table with richer roster rows that surface type and relationship scent before opening the full record.
- Preserve campaign-scoped full-record editing through the existing entity detail page.

### UX copy and scope clarity

- Use labels that match the GM mental model:
  - `Campaign Workspace`
  - `World Browser`
  - `Session Scratchpad`
  - `Recent Entities`
  - `Known Relationships`
  - `Appears In`
- Avoid generic or misleading labels that blur relationship facts into generic metadata buckets.
- Keep campaign ownership visible in world browsing so global discovery does not hide where edits apply.

### Deferred backend redesign boundary

- Do not redesign schemas or DB models for canonical world truth versus campaign-local truth in this step.
- Do not fake layered truth in the UI beyond wording and presentation.
- Leave room for future world/campaign layering by avoiding UI copy that claims campaign-owned records are the final permanent truth model.

## Tests And Scenarios

- Backend:
  - default owner endpoint returns an owner
  - default owner endpoint creates one when none exists
- Frontend API client:
  - campaign and entity request wiring
  - readable backend error handling
  - global entity create flow still calling campaign-scoped entity endpoint
- Frontend route/page tests:
  - overview shows a useful local surface while the backend is offline
  - overview quick-draft persists locally
  - campaign workspace overview and entities tabs still load correctly
  - campaign entity list supports quick-look side panel disclosure
  - global world browser still supports campaign filtering
  - global entity create flow still requires campaign selection
- Verification:
  - `uv run pytest` for touched backend tests
  - `uv run ruff check`
  - `npm run test -- --run`
  - `npm run lint`
  - `npm run format:check`
  - `npm run build`

## Assumptions And Defaults

- V1 is still single-user and local-first.
- The chosen visual direction is dark arcane workspace with parchment content panels.
- Campaign and world views are both first-class, but campaign work remains the primary operational context for editing.
- The frontend should look distinctive, but CRUD speed, orientation, and information scent still outrank spectacle.
- A narrow default-owner API is acceptable because the docs already assume one local owner and the frontend otherwise cannot create the first campaign.
- The current backend ownership model stays campaign-first for now.
- Canonical world truth plus campaign-local truth is explicitly deferred to a future backend/domain redesign.
- No additional frontend state framework is introduced in this step.
