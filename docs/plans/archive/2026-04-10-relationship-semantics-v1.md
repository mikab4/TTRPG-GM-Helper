# Relationship Semantics V1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add v1 backend relationship semantics, CRUD, and campaign-scoped custom relationship types with catalog-driven validation.

**Architecture:** Keep one generic `Relationship` record model and one generic `Entity` model, then layer relationship meaning in backend code through a built-in catalog plus campaign custom type definitions. Store only asserted relationships in v1, expose catalog metadata through the API, and validate source/target entity type pairs in backend services.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Pydantic, pytest, Ruff

---

## Summary

Implement the relationship-semantic backend slice for step 7:

- move entity validation to the new top-level type set: `person`, `location`, `organization`, `item`, `event`, `deity`, `other`
- add relationship assertion-state fields: lifecycle, visibility, certainty
- add a backend-owned relationship type catalog with built-ins plus campaign custom types
- add relationship CRUD routes and relationship-type catalog routes
- keep `confidence` as extraction/provenance scoring, not semantic truth
- defer inferred relationships and half-sibling modeling

## Key Changes

- Add `relationship_type_definitions` as a campaign-scoped custom catalog table.
- Extend `entity_relationships` with:
  - `lifecycle_status`
  - `visibility_status`
  - `certainty_status`
- Add backend catalog metadata for:
  - family
  - forward label
  - reverse label
  - symmetry
  - allowed source entity types
  - allowed target entity types
- Add backend services for:
  - listing built-in and custom relationship types together
  - creating/updating/deleting custom relationship types
  - validating relationship assertions against the catalog
  - symmetric and directional duplicate detection
- Add API routes for:
  - `GET /api/relationship-types`
  - `POST/PATCH/DELETE /api/campaigns/{campaign_id}/relationship-types/...`
  - `POST/GET/PATCH/DELETE /api/campaigns/{campaign_id}/relationships/...`

## Public API / Contract Notes

- Relationship responses include:
  - `relationship_family`
  - `forward_label`
  - `reverse_label`
  - `is_symmetric`
- Custom relationship types appear in the same API response shape as built-ins.
- Custom relationship type keys are normalized from labels and immutable after creation.
- Semantic custom type fields may change only while unused.

## Test Plan

- Entity API accepts the new top-level entity types.
- Relationship type listing includes built-ins and campaign custom types.
- Custom relationship types:
  - create successfully
  - reject semantic edits after first use
  - reject deletion while in use
- Relationship CRUD:
  - create with catalog metadata in the response
  - reject cross-campaign references
  - reject invalid source/target type pairs
  - reject inverse duplicates for symmetric types
  - support get/update/delete flows
  - support type and family list filtering
- Migration coverage:
  - new table exists
  - new relationship status columns exist
- ORM coverage:
  - new relationship state fields persist
  - custom relationship type JSON defaults persist

## Assumptions

- `leader_of` remains organization-only; territorial political authority uses `governs`.
- `spouse_of` stays under `romance`, not `family`.
- `lives_in` and `based_in` stay separate.
- `located_in` handles location containment.
- Inference is deferred; only asserted relationships are canonical in v1.
- Half-sibling nuance stays in notes for now.
