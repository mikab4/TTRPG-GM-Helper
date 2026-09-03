# Campaign And Entity Frontend Step 6 Reasoning

## Why This Step Needs A Small Backend Addition

The agreed step 6 scope is frontend CRUD, but the current backend contract has one missing piece for a working UI: creating a campaign requires `owner_id`, and the frontend has no supported way to discover a valid owner identifier.

The docs already assume a single local owner in v1. Because of that, the smallest honest fix is not a frontend workaround like a hidden environment variable or a pasted UUID field. The smallest honest fix is a narrow backend endpoint that exposes the local owner the frontend is already supposed to assume exists.

## Why Not Solve Owner Selection In The Frontend

Several alternatives are weaker:

- Hard-code a UUID in the frontend
  - fragile and environment-specific
  - hides a backend dependency in UI code
- Add a campaign form field for `owner_id`
  - technically works
  - terrible UX for a single-user local app
- Require manual seed scripts before the UI works
  - increases setup friction
  - makes the first campaign flow look broken

The default-owner endpoint is simpler than all of those once the actual user workflow is considered.

## Why The Frontend Stays A Thin SPA

React is already being used as a client-side routed application, so the question is not whether this is an SPA. It already is. The real question is how much application logic belongs in the frontend.

For this project, a thin SPA is the correct choice because:

- backend APIs already encode campaign ownership and validation rules
- extraction, provenance, and later review flows belong in backend services
- adding frontend stores or workflow-heavy abstractions now would increase complexity without solving a current problem

This step should therefore use:

- route-level pages
- local component state
- typed request helpers
- explicit loading and error states

It should avoid:

- Redux
- React Query
- Zustand
- app-wide domain stores

## Why The Design Direction Changed

The earlier notebook-admin direction was coherent, but it no longer matches the product intent. The user wants the app to feel like a GM cockpit rather than a restrained admin shell. That is not just a matter of “more polish.” It changes how the UI should orient the user under pressure.

The new design direction is:

- dark shell for navigation and status
- parchment work surfaces for reading and editing
- a stronger purple-gold editorial treatment in the shell and header
- stronger mood without turning the app into a decorative fantasy mockup
- layout and labels shaped around information scent and interaction cost

This shift is justified because the app’s use case is not generic business CRUD. A GM often needs to find and connect facts quickly while under conversational time pressure.

The approved reference also clarified that “dark arcane workspace” was not only about color. It implied:

- a more assertive top header
- a quick-find utility surface in the shell
- campaign cards as entry points into workspaces
- roster-style campaign entity browsing instead of generic tables

Those choices preserve the route structure and CRUD behavior while moving the interface closer to the intended product identity.

## Why The Information Architecture Is Dual-Equal But Campaign-Aware

The user expects future cross-campaign world data, so a purely campaign-first frontend would eventually feel too narrow. At the same time, the current backend still treats campaign as the ownership boundary, and campaign work is still the most natural editing context in v1.

That creates a real tension:

- if the UI is only campaign-first, global discovery will be bolted on later
- if the UI is only global-first, users pay higher interaction cost when doing campaign-specific work

The compromise is a dual-equal frontend:

- campaign workspace for focused operational work
- world browser for cross-campaign discovery

This is not the same as giving both areas generic equal weight. They need different jobs and clearer scope language.

## Why The Overview Must Stay Useful Offline

Showing only a backend failure state on the first screen is poor product behavior for a local-first tool. Even when the backend is down, the app can still help the user:

- keep a quick draft
- preserve a recent trail
- communicate system state without blocking all value

This is a direct response to the “experience rot” problem the user called out. The overview should degrade gracefully instead of becoming a stop sign.

The chosen implementation goes a bit further than the original redesign draft by borrowing the approved wording and composition style:

- `Session Scratchpad` instead of a generic draft panel
- `Recent Entities` instead of a generic recent-record list
- a dedicated offline utility bar plus command callout instead of only a backend status badge

That gives the page a clearer first-use shape while still keeping the content locally resilient.

## Why Relationship Scent Belongs In The List And Side Panel

The app is heading toward relationship-heavy entity browsing. If relationship-like data is hidden behind vague labels or only visible on deep pages, the user has to click too much and infer too much.

Showing relationship scent in list views and quick-look panels supports:

- faster recognition
- lower interaction cost
- cleaner transition to future relationship CRUD and history

This is why the redesign uses progressive disclosure:

- list for scanning
- side panel for quick reading
- full page for editing

## Why Backend Layered Truth Is Deferred

The user is explicitly interested in a future where a character can have canonical world truth plus campaign-local truth. That model will likely require backend schema and service changes. However, it would be premature to redesign the domain model now because:

- current v1 backend work is still campaign-owned CRUD
- relationship, note, extraction, and search workflows are not fully settled yet
- an early “world canon vs campaign overlay” schema would be high-risk to get wrong

The right compromise is:

- redesign the frontend now so it stops implying a flat forever-model
- keep the backend campaign-first for this step
- defer layered-truth persistence design until the product rules are clearer

This keeps the app honest today while preserving room for the future model the user wants.

## How The Latest UX Critique Changes The Priority Order

The recent Spool-style critique does not invalidate the current redesign. It changes the order of the next improvements.

The most important confirmed points are:

- `New Entity` should be visually more primary than `New Campaign` on the Overview if entity creation is the more common action.
- quick look is the key anti-pogo-sticking surface and should stay the main inspection path for most mid-session work.
- profile and edit pages should become denser if large gutters and oversized sections increase scroll cost.
- entity `type` should not remain free text if the app expects stable filtering and future relationship-aware browsing.

The critique also surfaced one idea that is correct but should be deferred:

- type-sensitive forms are a later concern, not a step 6 concern, because the current generic entity model does not yet justify per-type form branching.

This leads to a practical priority order after the current redesign slice:

1. make `New Entity` clearly primary and `New Campaign` clearly secondary
2. tighten the full profile and edit page density
3. constrain entity type choices
4. add text-first filtering in the world browser
5. expand quick look only after the above foundations are stable

That sequence is intentionally conservative. It improves interaction cost and information scent first, then adds richer behavior later.
