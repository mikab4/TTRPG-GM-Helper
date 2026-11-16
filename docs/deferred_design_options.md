# Deferred Design Options

These are not current technical debt. Reconsider an option only when its trigger occurs; until then, the simpler current design remains preferred.

## Asset-upload idempotency

**Trigger:** Duplicate uploads occur after recovery-storage failures, or the product requires a stronger guarantee than the accepted single-user local-first flow.

**Decision required:** Decide whether request-level idempotency is sufficient or session creation and upload must become one atomic product operation.

**Current default:** Keep the two-call frontend orchestration and accepted recovery limitation.

**Consider:** Add a server-recognized idempotency key to asset upload requests. Prefer this bounded change over a combined session-and-upload command unless atomic creation becomes a product requirement.

## World-owned reusable assets

**Trigger:** One canonical asset must be shared by multiple campaigns with campaign-local annotations, visibility, or interpretation, or work is about to start on users and membership (v1 Task 13) or on embedding tables (v1 Task 14). The tenant level must be decided before either, because moving the boundary later means migrating every table.

**Decision required:** Decide whether reusable assets introduce a world-level ownership boundary before changing campaign ownership or provenance rules.

**Current default:** Keep every source asset campaign-owned.

**Consider:** Introduce `World` as an ownership layer above campaigns and model campaign-to-world-asset associations. Do not use a `campaign_ids` array or duplicate canonical files.

## Entity subtype detail tables

**Trigger:** An entity subtype has stable fields that require relational validation, filtering, sorting, or indexing.

**Decision required:** Identify the stable fields and demonstrated query requirements before adding subtype-specific persistence or API contracts.

**Current default:** Keep one generic `Entity` model and store exploratory or sparse attributes in `metadata`.

**Consider:** Keep `Entity` as the canonical root and add a 1-to-1 detail table only for the mature subtype. Continue using `metadata` for exploratory or sparse attributes.

## Centralized asset-delete blockers

**Trigger:** Additional tables referencing `source_assets` make explicit service checks, database-trigger coverage, and tests difficult to maintain reliably.

**Decision required:** Decide whether stronger contract coverage is sufficient or reference coordination needs a new canonical representation.

**Current default:** Keep explicit foreign keys, deletion checks, database triggers, and tests aligned.

**Consider:** First add schema-level contract coverage that detects new asset references without matching deletion coordination. Consider a reference registry only if explicit foreign keys and checks remain unmanageable; a polymorphic registry would otherwise duplicate ownership information and weaken relational clarity.

## Hosted processing infrastructure

**Trigger:** The app is about to be hosted for more than one user, one user's slow parsing or extraction job delays other users, or the PostgreSQL job row and background task can no longer keep up.

**Decision required:** Decide which of S3-compatible storage, a separate worker service, and a queue are needed, and in what order, based on the problem actually observed.

**Current default:** Local disk behind `AssetStorage`, parsing and extraction as backend modules, and a PostgreSQL job row with a background task. MongoDB is dropped, not deferred.

**Consider:** Add an S3 backend to `AssetStorage` first. Split the worker out next. Add a queue such as Redis Streams only if the PostgreSQL job table becomes a bottleneck; a transactional outbox is needed only once a queue exists. The archived plan `docs/plans/archive/2026-08-08-cloud-ready-asset-intelligence-pipeline.md` describes that design.

## Skill-usage logging

**Trigger:** The repository has more project skills than `py-db-tdd` and `verify-ui-against-mockup`, a skill appears to go unused, or a skill's `## Gotchas` list reaches its cap of about 8 entries.

**Decision required:** Decide whether usage data is needed to prune or rewrite skills, and whether a Claude-only signal is acceptable given that Codex does not invoke skills through a tool.

**Current default:** No logging; judge skill use and prune gotchas by hand when a skill is edited.

**Consider:** A Claude `PreToolUse` hook on `Skill`, and on `Read` of `.agents/skills/*/SKILL.md` to catch direct reads through the `.claude/skills` symlink, that appends the skill name and date to a gitignored log. Review the log, then remove or rewrite skills that never trigger and prune their gotchas.
