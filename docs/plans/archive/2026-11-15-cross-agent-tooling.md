# Cross-Agent Tooling Implementation Plan

**Applies to:** AI agent instructions, skills, hooks, and permissions for Codex and Claude Code
**Related code:** `AGENTS.md`, `CLAUDE.md`, `.agents/`, `.codex/`, `.claude/`, `.githooks/`, `.gitignore`, `frontend/package.json`, `frontend/scripts/mockup-compare/`
**Deferred design triggers:** None

**Goal:** Make the repository's agent setup work identically in Codex and Claude Code from one shared source, drop third-party skill packs (superpowers, gstack), and keep only project-specific skills that add information a current model does not already have.

**Architecture:** Four layers, each with one job:

| Layer | Holds | Location |
|---|---|---|
| Always-on rules | Architecture, mockup authority, test and planning rules | `AGENTS.md` (Claude reads it through `CLAUDE.md` → `@AGENTS.md`) |
| Deterministic checks | Formatting and lint of changed files | Shared hook scripts in `.agents/hooks/`, wired by `.codex/hooks.json` and `.claude/settings.json`; `.githooks/pre-commit` |
| On-demand procedures | Repo-specific workflows, gotchas, verification | `.agents/skills/` (Claude reads it through the `.claude/skills` symlink) |
| Generic workflows | Planning, code review, exploration | Built-in agent features; no skill |

**Out of scope:** CI pipelines, new product behavior, MCP servers, and changes to the frontend or backend application code.

---

## Open Questions

Resolve each question at the start of the task that owns it, then record the answer in that task and, when it is a trade-off, in the reasoning document.

| # | Question | Decide in |
|---|---|---|
| Q1 | Does Claude Code accept Codex's `statusMessage` hook field, or must it be dropped from the Claude config? | Task 3 |
| Q2 | Which Codex allow-rules are general enough to commit to `.claude/settings.json`? | Task 4 |
| Q3 | What conventions do existing Alembic revisions and `backend/tests/test_migrations.py` follow? | Task 6 |
| Q4 | Which browser tool does UI verification use: a Playwright dev dependency, or the agent's own browser tooling? | Task 7 (resolved: Playwright) |

---

## Task 1: Shared Instructions

**Status:** Complete
**Estimate:** 15 minutes

1. Add root `CLAUDE.md` containing only `@AGENTS.md`.
2. Add `docs/agent-tooling.md` describing the four layers, where each file lives, and the rule "edit shared files under `.agents/`; never edit through the `.claude/` symlinks or duplicate them."
3. Add one line to `AGENTS.md` pointing to `docs/agent-tooling.md`.
4. Verify: start a Claude session and confirm the `AGENTS.md` rules are loaded (`/memory` lists the import).

**Summary:** Added `CLAUDE.md` (`@AGENTS.md`), `docs/agent-tooling.md` (layer table, file map, edit rule), and a pointer line under "Planning And Documentation" in `AGENTS.md`. The doc describes the target layout; paths created by later tasks are tagged "(added in Task N)" and those tags are removed when each task lands. Verified behaviorally instead of through `/memory`: a fresh headless session (`claude -p`) named `docs/mockups/workspace-v1.html` as the frontend reference and reported `AGENTS.md` loaded through the `CLAUDE.md` import.

## Task 2: Shared Skill Discovery

**Status:** Complete
**Estimate:** 20 minutes

1. Create the symlink `.claude/skills` → `../.agents/skills`. Supported checkouts are Linux, macOS, and WSL; native Windows Git is unsupported (see reasoning document). If Claude does not discover skills through a directory-level symlink, fall back to one symlink per skill (`.claude/skills/<name>` → `../../.agents/skills/<name>`).
2. In `planning-review-remediations/SKILL.md`, replace the `superpowers:receiving-code-review` sub-skill with inline steps: verify the finding against the code before accepting it, and push back with repository evidence when it is wrong. Merge with the existing "state a reasoned objection" step instead of repeating it.
3. Keep `agents/openai.yaml` files unchanged (Codex UI metadata; Claude ignores them).
4. Add the supported-checkout note to `docs/agent-tooling.md` and remove its "(added in Task 2)" tag.
5. Verify: `/planning-review-remediations`, `/review-remediation-plan`, and `/py-db-tdd` appear in Claude; `$planning-review-remediations` still works in Codex.

**Summary:** Added the relative symlink `.claude/skills` → `../.agents/skills`; the directory-level link works, so the per-skill fallback was not needed. In `planning-review-remediations/SKILL.md`, step 1 now says to verify the finding against current code before accepting it, and step 3 says to object with repository evidence (file:line, plan, or test); no `superpowers` references remain under `.agents/`. Added a "Supported Checkouts" section to `docs/agent-tooling.md` and removed its Task 2 tag. Verified headlessly: `claude -p "/review-remediation-plan ..."` loaded the skill's instructions, and `codex exec` listed all three skills.

## Task 3: Shared Stop Hooks

**Status:** Complete
**Estimate:** 60 minutes

1. `git mv` `.codex/hooks/run-backend-quality` and `.codex/hooks/run-frontend-quality` to `.agents/hooks/` and `chmod +x` both, so the execute bit is committed.
2. In both scripts:
   - `cd "$(git rev-parse --show-toplevel)"` before any work.
   - If `jq` is not on `PATH`, emit the fixed-string block `"jq is required for agent hooks. Install it: sudo apt install jq"` and exit, so a missing dependency is reported instead of silently skipping the checks.
   - Read stdin JSON once with `jq`; when `stop_hook_active` is `true`, emit `{"continue":true}` so a failing check cannot loop indefinitely.
   - Build every block response with `jq -n --arg` and append the last 30 lines of the Ruff, Prettier, or ESLint log to `reason` so the agent sees the diagnostics. Never interpolate log text into `echo`ed JSON.
   - Keep the existing file scope: all uncommitted and untracked files under `backend/` or `frontend/`, including the user's own edits.
3. Point `.codex/hooks.json` at `bash .agents/hooks/<script>` (Codex runs hooks from the repository root).
4. Add a `Stop` hook to `.claude/settings.json` that runs both scripts as `bash "$CLAUDE_PROJECT_DIR"/.agents/hooks/<script>` with a 60-second timeout and the same `statusMessage` values as Codex. Q1: Claude Code 2.1.325's hook schema includes an optional `statusMessage` string, so the field is kept; confirm the spinner text appears during step 5.
5. Verify in each tool (checks a–c as real agent turns, check d in a shell):
   - a. Unused import in a backend file and bad formatting in a frontend file: both fixed automatically, no block.
   - b. Undefined name in a backend file (Ruff F821): exactly one block whose `reason` shows the F821 line; the next stop goes through. In Codex, temporarily save the hook's stdin to a scratch file and confirm it contains `stop_hook_active`. If it does not, add a fallback that stores a hash of the failing log under `.git/agent-hook-state/<script>` and lets an identical repeated failure pass; record that in the reasoning document.
   - c. An ESLint error `--fix` cannot fix (e.g. `no-unused-vars`): same as b, with ESLint output.
   - d. `echo '{}' | env PATH=<PATH without jq> bash .agents/hooks/<script>`: one block with the install message.
6. Update documentation:
   - `docs/agent-tooling.md`: remove the "(added in Task 3)" tags, mark `.claude/settings.json` as "(permissions added in Task 4)", and note that the hooks require `jq` and check all uncommitted and untracked files, including the user's own edits.
   - `README.md`: add `jq` under **Requirements**.
   - This task: set status, add a summary, and record the Q1 result and the Codex `stop_hook_active` result.
   - Reasoning document "Hook Safety": update if the step 5 results change a recorded decision.

**Summary:** Moved both scripts to `.agents/hooks/` (committed executable) and put the shared setup in `.agents/hooks/hook-common.sh`: `cd` to the repository root, the missing-`jq` block, the `stop_hook_active` guard, and a `block_stop` helper that builds the JSON with `jq` and appends the last 30 log lines. Backend calls use `uv run -q` so uv's install output does not push Ruff diagnostics out of the 30-line tail. `.codex/hooks.json` and the new `.claude/settings.json` call `bash .agents/hooks/<script>` (Claude through `$CLAUDE_PROJECT_DIR`) with `statusMessage` and a 60-second timeout. Q1: the field is in Claude Code 2.1.325's hook schema and the settings load; the spinner text was not observed because verification ran headless.

Verification: checks a–d pass in a shell. Claude (`claude -p`): each hook blocked once with the F821 or `no-unused-vars` lines in `reason`; the second stop arrived with `stop_hook_active: true` and passed. Codex (`codex exec`): each hook blocked once, the F821 and `no-unused-vars` lines reached the session, and the second stop arrived with `stop_hook_active: true` and completed, so the hash-file fallback is not needed. Codex in a git worktree loads the main checkout's `.codex/hooks.json` (here `worktrees/main`, still calling `.codex/hooks/...`) and runs it from the worktree. `--dangerously-bypass-hook-trust` does not change which file is loaded. Codex was therefore verified through temporary shims at the old `.codex/hooks/` paths, removed afterward. After merging, Codex asks once to trust the changed hooks.

## Task 4: Permissions and Ignore Rules

**Status:** Complete
**Estimate:** 15 minutes

1. Resolve Q2. Q2: of the user-level Codex rules, only `uv run pytest` and `npm run test` are general. `uv run python` is excluded because it allows arbitrary code; the `UV_CACHE_DIR=...` rules are Codex-sandbox workarounds, and the rest are one-off or machine-specific paths.
2. Add to `permissions.allow` in `.claude/settings.json`, plain forms only (no `uv run --directory` or `npm --prefix` variants):
   - Backend: `uv run pytest`, `uv run ruff`, `uv run alembic current`, `uv run alembic history`, `uv run alembic heads`, `uv run alembic check`, `uv run alembic revision`.
   - Frontend: `npm run test`, `npm run lint`, `npm run format:check`, `npm run build`.
   - Not allowed, so they prompt: `uv run alembic upgrade` and `uv run alembic downgrade` (they mutate the configured database; downgrade can drop data).
3. Add `.claude/settings.local.json` and `.claude/worktrees/` to `.gitignore`.
4. Codex permissions stay out of scope: Codex approvals remain user-level because its sandbox and approval-policy model differs from Claude's allow rules, and the user-level rules already allow `uv run pytest` and `npm run test`.
5. Verify: in a fresh Claude session, `cd backend && uv run pytest -q` and `cd frontend && npm run lint` run without a permission prompt, and `uv run alembic upgrade head` prompts. If the compound `cd` forms prompt, revisit the rule forms.
6. Update documentation:
   - `docs/agent-tooling.md`: remove the "(permissions added in Task 4)" and "(Task 4)" tags.
   - Reasoning document: add a "Permissions" section recording why `alembic upgrade`/`downgrade` and `uv run python` are excluded and why Codex permissions stay user-level.
   - This task: set status and add a summary.

**Summary:** Added `permissions.allow` to `.claude/settings.json` with eleven `Bash(<command> *)` rules: `uv run pytest`, `uv run ruff`, `uv run alembic current|history|heads|check|revision`, and `npm run test|lint|format:check|build`. Added `.claude/settings.local.json` and `.claude/worktrees/` to `.gitignore`, removed the Task 4 tags from `docs/agent-tooling.md`, and added a "Permissions" section to the reasoning document. Verified with `claude -p --setting-sources project`: `cd backend && uv run pytest -q --collect-only`, `cd frontend && npm run lint`, and `cd frontend && npm run format:check` ran without a prompt (a bare command with no arguments matches the ` *` form), and `cd backend && uv run alembic upgrade head` was denied.

## Task 5: Slim `py-db-tdd`

**Status:** Complete
**Estimate:** 45 minutes

1. Remove generic testing guidance that a current model already follows: AAA layout, one rule per test, no logic in tests, naming style, DAMP over DRY, fixture scopes by cost, explicit dependencies over `autouse`, and not over-factoring simple cases.
2. Do not restate the "Backend Tests" rules in `AGENTS.md`; open the skill with one line saying it follows them. Add only what `AGENTS.md` lacks: factory fixtures (`owner_factory`, `campaign_factory`, etc.) and `db_session_factory()` in `backend/tests/conftest.py`, both bound to SQLite; model factory classes in `backend/tests/factories.py`; PostgreSQL fixtures (`postgres_test_container`, `postgres_test_settings`) in `conftest.py` backed by `backend/tests/pg_test_support.py`; and "unavailable Docker is a failure, not a skip." State the rule: tests use SQLite through the factories by default, and use the PostgreSQL fixtures only when the behavior depends on PostgreSQL (migrations, JSONB, PostgreSQL-only constraints). Also show the `db_session=` keyword that passes an open session into a factory fixture, and one short example test using `api_request` and factory fixtures.
3. Add a `## Gotchas` section with two one-line entries, each pointing to the fixture that holds the workaround:
   - Use `api_request` for API tests; a hand-built client hangs on sync FastAPI handlers (`sync_api_test_runtime_shim` in `conftest.py`).
   - Use `sqlite_engine` for SQLite tables; calling `Base.metadata.create_all` directly fails on `'{}'::jsonb` server defaults (`patched_jsonb_defaults` in `conftest.py`).
4. Record the gotcha rule for all skills in `docs/agent-tooling.md`:
   - Add a gotcha only when an agent actually hit the problem, it cost a debug cycle, and code (a fixture, a clear error, a lint rule, or a test) cannot prevent it. Otherwise fix the code.
   - Each entry is one line with a file pointer. Cap of about 8 per skill; at the cap, convert an entry to code or delete it.
   - Placement rule: a rule goes in `AGENTS.md` only if it applies to every task in its area and fits in one line; longer procedures, examples, and gotchas go in a skill. Each fact lives in one place.
5. Add one line to `AGENTS.md`: when an agent hits a repository-specific problem that cost a debug cycle, its final message proposes a code fix or a one-line gotcha for the matching skill, and it does not edit the skill without approval.
6. Rewrite the `description` to: "Use when writing, changing, or reviewing pytest tests under `backend/tests/`, including when a backend feature or bug fix needs new or updated tests." Use the same trigger wording in the `py-db-tdd` pointer line in `AGENTS.md`.
7. Add one line to the "Backend Tests" section of `AGENTS.md`: a backend behavior change or bug fix includes a test that fails without the change; write it first.
8. Verify:
   - a. `claude -p` with a backend bug-fix request loads `py-db-tdd` and writes the test first.
   - b. `codex exec` still lists `py-db-tdd`.
   - c. Every file path and fixture name in the skill exists (`grep` in `backend/tests/`).
   - d. `AGENTS.md` stays under 200 lines.
9. Update documentation: set this task's status and add a summary. Check that `docs/agent-tooling.md` describes the gotcha and placement rules.

**Summary:** Rewrote `.agents/skills/py-db-tdd/SKILL.md` from 12 rule sections to four short sections: a file map (`conftest.py`, `factories.py`, `pg_test_support.py`), SQLite-by-default with PostgreSQL only for migrations, JSONB, or PostgreSQL-only constraints, factory `db_session=` usage, and one API test example. It also has the two gotchas. The skill opens by deferring to the `AGENTS.md` Backend Tests rules instead of restating them. `AGENTS.md` (now 70 lines) gained the gotcha-proposal line, the new `py-db-tdd` trigger wording, and the test-first line. `docs/agent-tooling.md` gained "Where Rules Go" and "Skill Gotchas" sections. Verified: every path and fixture named in the skill exists. `claude -p --setting-sources project` with a backend bug-fix request loaded `py-db-tdd` and planned the failing test before the fix. `codex exec` lists `py-db-tdd`.

## Task 6: `new-alembic-migration` Skill

**Status:** Replaced (folded into `py-db-tdd`)
**Estimate:** 45 minutes

1. Resolve Q3 by reading `backend/alembic/versions/`, `backend/alembic/env.py`, and `backend/tests/test_migrations.py`.
2. Create `.agents/skills/new-alembic-migration/SKILL.md` covering: revision naming, data-preserving migrations (from `AGENTS.md`), required migration test coverage, and gotchas.
3. Verify: ask each agent to draft a trivial migration in a scratch branch and confirm it follows the skill.

**Summary:** Q3: revisions use `YYYYMMDD_NNNN` IDs and `YYYYMMDD_NNNN_slug.py` file names, always implement `downgrade()` (0003 copies data back), and are tested in `backend/tests/test_migrations.py` with schema checks after `upgraded_postgres_test_engine()` plus, for data reshapes, an upgrade-from-previous-revision backfill test. The separate skill was dropped: once the revision-ID fix in `docs/issues.md` lands, the only guidance not already in `AGENTS.md` or the existing migrations is which tests to write. That went into a "Migration Tests" section in `.agents/skills/py-db-tdd/SKILL.md`. Migration problems that code can fix are tracked in `docs/issues.md`. Step 3 was not run because no skill was created.

## Task 7: `verify-ui-against-mockup` Skill and `mockup:compare` Tool

**Status:** Complete

1. Resolve Q4. A new dev dependency requires recording the decision here and in the reasoning document before installation.
2. Create `.agents/skills/verify-ui-against-mockup/SKILL.md`: locate the matching view in `docs/mockups/workspace-v1.html`, run the frontend, capture screenshots, compare composition, typography, colors, spacing, and control placement, and list every difference.
3. For each difference, check `docs/mockups/design-deviations.md`; report unapproved differences instead of fixing them silently.
4. Verify on one existing screen.

**Decisions:** Q4: Playwright as a pinned dev dependency in `frontend/`. API responses are faked by route interception with fixtures typed by `frontend/src/types`; no backend or database runs. Default widths are 1440, 800, and 390, plus a `--width` band when a change touches a 640–768 px rule. The tool measures computed styles of mapped element pairs and saves screenshots; a missing selector or unfaked API request fails the run. Deterministic work lives in a tool in `frontend/scripts/mockup-compare/`; the skill holds only the judgment and reporting steps. Differences found on the trial screen go to `docs/issues.md`, not into app code.

**Summary:** Added `playwright` and `@types/node` (so `tsc` checks the script) to `frontend/devDependencies` and `npm run mockup:compare -- <screen> [--width <px>]`, which runs `frontend/scripts/mockup-compare/compare.ts` with Node's built-in TypeScript support. The tool starts Vite with `VITE_API_BASE_URL=/mockup-api`, serves fixtures from `fixtures.ts` (camelCase app types converted to the snake_case wire format), opens the app route and the mockup at each width, and writes `app.png`, `mockup.png`, and `report.md` to gitignored `frontend/.mockup-compare/<screen>/`. `screens.ts` holds each screen's route, fake API, and selector map; `app: null` and `mockup: null` mark elements that exist on one side only. Border colors with no border and `gap` on non-flex/grid elements are not reported. `tsconfig.scripts.json` is referenced from `tsconfig.json`, and ESLint and Prettier cover `scripts/`. The skill and a matching `AGENTS.md` pointer under Frontend Design Authority were added. Verified on the Entities tab (screen `entities`): the run completes with no errors, a broken selector and an unfaked request both fail it with exit code 1, and the unapproved differences are recorded in `docs/issues.md` under "Entities Tab Differs From the Mockup".

## Task 8: User-Level Cleanup (outside the repository)

**Status:** Complete
**Estimate:** 30 minutes

Not committed; recorded so both machines' agents end up consistent.

1. Remove the broken `~/.agents/skills/superpowers` symlink and the superpowers Codex plugin.
2. Remove the `gstack*` skills from `~/.codex/skills/`.
3. ~~Resolve Q6; move kept skills to a shared user-level location linked into both `~/.codex/skills/` and `~/.claude/skills/`.~~ Dropped: out of scope.
4. ~~Create `~/.claude/CLAUDE.md` with the Working Style rules from `~/.codex/AGENTS.md`.~~ Dropped: out of scope.

**Implemented:** Deleted the `~/.agents/skills/superpowers` symlink. The superpowers plugin was already gone. Deleted `~/.codex/skills/gstack/`, the `~/.codex/skills/gstack-*` symlinks, `~/.codex/disabled-skills/gstack/`, and the `~/gstack/` source clone. Steps 3 and 4 were dropped because user-level skills and personal instructions are personal setup that this project does not depend on; the project's skills and rules live in the repository. Former Q6 is removed with them.
