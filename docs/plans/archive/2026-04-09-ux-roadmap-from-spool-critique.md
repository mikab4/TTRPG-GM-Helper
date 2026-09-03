# UX Roadmap From Spool-Style Critique

## Summary

This document turns the recent UX critique into a prioritized roadmap. The goal is not to chase polish for its own sake. The goal is to reduce interaction cost, improve information scent, and protect data consistency while keeping v1 aligned with the current backend model.

The roadmap is split into:

- `Now`: changes that improve the current campaign/entity slice directly
- `Next`: follow-on UX improvements that depend on the current slice but do not require a domain-model redesign
- `Later`: decisions that belong to later plan steps because they depend on relationships, search, or richer entity semantics

## Now

### 1. Make `New Entity` clearly primary on Overview

What it means:
- keep direct access to both `New Entity` and `New Campaign`
- give `New Entity` the dominant visual treatment
- keep `New Campaign` present but visibly secondary

Why now:
- this is the clearest high-intent action on the Overview
- it reduces decision cost without hiding options
- it matches likely usage frequency better than equal-weight actions

Advantage:
- low implementation cost with immediate UX payoff

Disadvantage:
- it encodes a usage assumption that may need revisiting if campaign creation turns out to be more frequent than expected

### 2. Keep quick look as the primary mid-session workflow

What it means:
- treat the side panel as the default place for “check a fact quickly”
- avoid adding unnecessary reasons to leave the list
- keep `Full Profile` and `Edit Entity` as explicit escalation paths

Why now:
- this is the strongest anti-pogo-sticking pattern already present in the UI
- it supports the “one hand free, five seconds of silence” use case better than page-hopping

Advantage:
- supports fast recognition and low interaction cost

Disadvantage:
- if the quick look becomes too sparse, users will still bounce into the full page too often

### 3. Tighten the full profile and edit page density

What it means:
- reduce oversized panels with too little content
- tighten vertical spacing and gutters
- bring related sections closer together so key facts are visible with less scrolling

Why now:
- current profile-style layouts are readable but slightly too roomy for a workspace tool
- this is a UX refinement, not a backend change

Advantage:
- improves scan speed and lowers scroll cost

Disadvantage:
- if overdone, the app can become cramped and lose the calm editorial feel

### 4. Constrain entity type choices

What it means:
- replace free-text `type` entry with a constrained set of allowed values for v1
- use a select or similarly explicit choice control

Why now:
- free-text types create filter fragmentation and poor data integrity
- this is a real product consistency issue, not just a nicer input widget

Advantage:
- cleaner filtering and more stable record vocabulary

Disadvantage:
- the first v1 type set must be chosen deliberately, because changing names later may require migration or normalization

Recommended v1 starter set:
- `NPC`
- `Location`
- `Artifact`
- `Faction`
- `Event`
- `Lore`

## Next

### 5. Add text-first filtering in the World browser

What it means:
- let users narrow the visible entity list by typing part of a name immediately
- keep campaign and type as secondary filters, not the only discovery path

Why next instead of now:
- it is valuable, but it should be done after the list interactions and type vocabulary are stable
- the right first version is a simple local/client-side filter over the already loaded list, not a large search system

Advantage:
- improves fact-finding speed without waiting for the full backend search step

Disadvantage:
- local filtering is only a bridge; it is not a substitute for real search later

### 6. Expand quick look content carefully

What it means:
- add the highest-value facts to the side panel
- prefer relationship scent, campaign context, and summary over broad record duplication

Why next:
- this depends on learning what facts users actually need most often
- adding too much too early will turn quick look into a cramped mini-profile

Advantage:
- increases the share of work that stays in-place

Disadvantage:
- if overloaded, quick look stops being quick

## Later

### 7. Relationship-aware entity surfaces

What it means:
- once relationship CRUD exists, entity lists, quick look, and profile pages should show relationship data in domain language
- examples:
  - `Brother of Rowan`
  - `Allied with the Obsidian Order`
  - `Seen in Campaign: Ashes of Karth`

Why later:
- this depends on Task 7 relationship APIs and the later relationship UX decisions

Advantage:
- strongest long-term gain for information scent

Disadvantage:
- easy to get wrong if the relationship model is still unstable

### 8. Type-sensitive forms

What it means:
- the entity form may later adapt based on type
- example:
  - `Location` may care about region/landmark metadata
  - `NPC` may care more about affiliations or titles

Why later:
- v1 still uses one generic entity model
- type-sensitive forms only become worthwhile once richer typed metadata or relationship semantics exist

Advantage:
- more relevant forms and less irrelevant input noise

Disadvantage:
- this adds UX and schema coupling, so it should not arrive before the data model can support it cleanly

### 9. Layered truth: world truth vs campaign-local truth

What it means:
- one future entity may have canonical world facts plus campaign-specific interpretation or notes

Why later:
- this is a backend/domain redesign, not a step 6 frontend refactor

Advantage:
- supports multi-campaign worlds honestly

Disadvantage:
- high model complexity and high risk if introduced before relationship/search workflows settle

## Recommendation

The recommended order is:

1. Make `New Entity` visually primary on Overview.
2. Tighten profile/edit density.
3. Constrain entity types.
4. Add text-first filtering in World.
5. Expand quick look only after those foundations are in place.

This order is intentionally boring. It prioritizes lower interaction cost and cleaner data before adding richer behavior.
