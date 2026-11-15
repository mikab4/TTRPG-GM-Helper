# Deferred Design Options

These are not current technical debt. Reconsider an option only when its trigger occurs; until then, the simpler current design remains preferred.

## Asset-upload idempotency

**Trigger:** Duplicate uploads occur after recovery-storage failures, or the product requires a stronger guarantee than the accepted single-user local-first flow.

**Decision required:** Decide whether request-level idempotency is sufficient or session creation and upload must become one atomic product operation.

**Current default:** Keep the two-call frontend orchestration and accepted recovery limitation.

**Consider:** Add a server-recognized idempotency key to asset upload requests. Prefer this bounded change over a combined session-and-upload command unless atomic creation becomes a product requirement.

## World-owned reusable assets

**Trigger:** One canonical asset must be shared by multiple campaigns with campaign-local annotations, visibility, or interpretation.

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

## AI-first PostgreSQL-only pipeline

**Trigger:** Work is about to start on v1 Task 9 or any task in the cloud-ready asset pipeline plan, or work is requested on LLM extraction, evals, RAG, Google Docs/Sheets import, multi-user access, or player-facing data separation.

**Decision required:** Decide whether to adopt `docs/proposals/2026-11-11-ai-first-pipeline-alternative.md` in place of the MinIO, Redis Streams, MongoDB, and worker pipeline before building any of that infrastructure.

**Current default:** The current plans under `docs/plans/` remain authoritative. The proposal is not adopted.

**Consider:** Drop MongoDB, defer Redis, S3 storage, and the separate worker until hosting, keep parsed sections and jobs in PostgreSQL, import from Google Docs and Sheets, and build the AI layer first as a standalone toolkit. Adopting it requires the plan, reasoning, and `AGENTS.md` updates listed at the end of the proposal.

## Skill-usage logging

**Trigger:** The repository has more project skills than `py-db-tdd` and `verify-ui-against-mockup`, a skill appears to go unused, or a skill's `## Gotchas` list reaches its cap of about 8 entries.

**Decision required:** Decide whether usage data is needed to prune or rewrite skills, and whether a Claude-only signal is acceptable given that Codex does not invoke skills through a tool.

**Current default:** No logging; judge skill use and prune gotchas by hand when a skill is edited.

**Consider:** A Claude `PreToolUse` hook on `Skill`, and on `Read` of `.agents/skills/*/SKILL.md` to catch direct reads through the `.claude/skills` symlink, that appends the skill name and date to a gitignored log. Review the log, then remove or rewrite skills that never trigger and prune their gotchas.
