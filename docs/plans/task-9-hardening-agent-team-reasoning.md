# Task 9 Hardening: Agent Team Plan — Reasoning

**Applies to:** why the Task 9 fixes are split into these branches and merged in this order
**Related code:** `backend/alembic/`, `backend/app/models/`, `backend/tests/`
**Deferred design triggers:** None. "Centralized asset-delete blockers" stays deferred

## Migrations run in one serial lane

Four fixes add a migration (#5, #12, #4, #9). Three ways to schedule them were compared.

| Scheme | Result |
|--------|--------|
| Parallel branches, each off the current head | Two heads on `main`. `upgrade head` then fails, which breaks every PostgreSQL test and backend startup. Rejected |
| Parallel branches with pre-assigned IDs and a fixed chain | A branch whose `down_revision` is not on its base cannot run `upgrade head`, so its agent cannot run PostgreSQL tests without a temporary `down_revision` that someone must rewrite at rebase. #4 and #9 conflict in `models/relationship.py` anyway. Rejected |
| One long-lived branch for all four | #9 is blocked on a decision and would hold back the other three. Rejected |
| Serial lane, pre-assigned IDs, each branch cut after the previous merges | Chosen. The cost is little: the four fixes are one small, two medium, and one large |

Placeholder migrations merged early to reserve the chain were also rejected. The Compose backend applies migrations at startup, so the engineer's real database would be stamped past revisions whose real bodies never ran.

## The metadata check lands first

#7 goes first, as a gate, so #12 and #4 get an automatic model-versus-migration check. Landing it last would surface mismatches across several merged branches at once.

Boundary: Alembic autogenerate does not compare `CHECK` constraints, triggers, or functions. The gate does not cover #9 or #5. Those rely on their own tests.

## #8 is grouped with #7, and its stated fix is incomplete

Both own `env.py`. The callback in Task 9's fix does not run for plain `alembic revision` unless `revision_environment = true` is set, which makes revision generation need a database. A static naming test gives the same guarantee without that cost and is added in either case. Auto-generated IDs would not help parallel work: two branches off one head would generate the same ID.

Decided 2026-11-16: the callback is not added. #8 is closed by the naming test.

## #6 goes before #1 on one branch

#6 adds tests for behavior that works today. They are the safety net for #1, which rewrites the same function, and for #10, which changes entity and campaign deletes from ORM-driven to database-cascade-driven.

## #9 is last

It has the most open questions. Constraints declared in the models are enforced in the SQLite tests, where the compatibility tests deliberately insert legacy entity types. A `CHECK` on `entities.type` also makes the entity-type compatibility feature dead code while v1 Task 13 still expects it. And the migration must refuse to run on legacy rows, which stops the backend from starting, so the engineer has to clean the real database first.

Decided 2026-11-16: #9 constrains the status columns only. `entities.type` stays unconstrained until the compatibility feature is retired, which removes the legacy-row and dead-code problems above.

## Only the integrator edits the v1 plan

`AGENTS.md` asks each piece of work to update its task in the current plan. All 14 fixes are adjacent rows of one table, so per-branch edits would conflict on every merge. Agents report; the integrator edits.

## Trade-off accepted

The inverse-pair race for symmetric relationship types stays open after #4. Symmetry of built-in types is defined in code, so a plain unique constraint cannot express it.
