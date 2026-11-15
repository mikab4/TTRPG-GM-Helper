# Cross-Agent Tooling Reasoning

**Applies to:** AI agent instructions, skills, hooks, and permissions for Codex and Claude Code
**Related code:** `AGENTS.md`, `CLAUDE.md`, `.agents/`, `.codex/`, `.claude/`, `.githooks/`, `.gitignore`
**Deferred design triggers:** None

## One Source, Two Agents

`AGENTS.md`, `.agents/skills/`, and the hook scripts stay canonical. Claude reaches them through `CLAUDE.md` (`@AGENTS.md`) and a `.claude/skills` symlink; hook configs in `.codex/` and `.claude/` are thin wiring.

Rejected: separate copies per agent. They drift, and the repository's rules would differ by tool.

`CLAUDE.md` imports `AGENTS.md` instead of being a symlink so Claude-only notes can be added later without touching the shared file.

### Skill Symlink and Supported Checkouts

Claude reaches `.agents/skills/` through a committed `.claude/skills` symlink. Supported checkouts are Linux, macOS, and WSL. Native Windows Git is unsupported because it checks symlinks out as plain text files unless Developer Mode and `core.symlinks` are enabled.

Rejected: a committed copy with a pre-commit drift check (duplicates every skill in git for a platform not in use); a per-clone setup script (a manual step that new clones and worktrees skip); a local Claude plugin (more wiring, prefixed skill names, unverified support for paths outside the plugin). Revisit the committed-copy option if a native Windows checkout becomes necessary.

## Rules Go Where They Are Reliably Applied

Rules that must hold in every session live in `AGENTS.md`, because agents do not reliably invoke skills (published evals report agents skipping available skills in roughly half of cases). Skills hold on-demand procedures and repository gotchas. Anything a script can check is a hook.

A rule goes in `AGENTS.md` only if it applies to every task in its area and fits in one line; each fact lives in one place, so skills do not restate `AGENTS.md`. `AGENTS.md` loads every session and each line costs attention on every task (Anthropic best practices recommend under 200 lines), and context files with unnecessary requirements lower task success (Gloaguen et al., ICLR 2026). Skills hold longer procedures, examples, and gotchas, and `AGENTS.md` points to each skill, which raised skill use from 44% to 95%+ in Vercel's evals.

Rejected: moving skill content into `AGENTS.md` to avoid skipped skills (grows the always-on cost for every task), and keeping `AGENTS.md` rules duplicated in skills (double context cost and drift).

## No Third-Party Skill Packs

Superpowers and gstack are removed. Their planning, brainstorming, and review workflows overlap built-in agent features (plan modes, `/code-review`, `/review`, subagents) and spend context restating behavior current models already follow. Superpowers' main measured benefit came from its session-start prompt telling the agent to use skills, which `AGENTS.md` provides directly.

Accepted cost: generic discipline is no longer injected every session. Neither harness requires test-first, and the `AGENTS.md` testing rules covered how tests look, not whether they are written. Mitigation: a one-line test-first rule in `AGENTS.md` (Task 5), and hooks enforce formatting and lint. Rejected for now: a Stop hook that blocks when `backend/app/` changes without `backend/tests/` changes, because test-first has real exceptions (refactors, config) and the hook would misfire; revisit with new research if agents keep skipping tests.

Personal user-level skills and instructions (`~/.codex/skills/`, `~/.codex/AGENTS.md`, `~/.claude/CLAUDE.md`) are out of scope. The project does not depend on them, so sharing them between agents is personal setup, not repository tooling. Task 8 only removes the third-party packs.

Simpler alternative kept available: Tasks 1–5 alone give a working cross-agent setup; Tasks 6–7 add value but are optional.

## Skill Selection

New skills must add information or verification a model cannot derive alone. UI verification is prioritized because the mockup-authority rule is the strictest rule in `AGENTS.md` and currently has no check. Generic code-review and planning skills are rejected in favor of built-in features and `docs/plans/README.md`.

Rejected: a separate `new-alembic-migration` skill (Task 6). Applying migrations needs no agent (`compose.yaml` sets `AUTO_APPLY_MIGRATIONS`; local runs use `alembic upgrade head`). For writing them, the revision-ID convention is better enforced in `backend/alembic/env.py` (tracked in `docs/issues.md`), data preservation is already an `AGENTS.md` rule, and `downgrade()` follows from the existing revisions. The remaining gap, which migration tests to write, is a few lines in `py-db-tdd`, which already loads for backend tests.

Rejected: a `close-plan-task` skill. Its steps (set status, add a summary, correct paths, update the reasoning document) restate the `AGENTS.md` plan-completion rule, which already loads every session, so the skill would add context cost without new information. If plans drift (for example, more than one `Next` task), add a script check instead.

Deferred: skill-usage logging. With two project skills, use is visible without a log, and a `Skill`-tool hook records only Claude. It is tracked in `docs/deferred_design_options.md` under "Skill-usage logging".

### UI Verification: Tool Plus Thin Skill

Deterministic work (capture, fake API, style measurement) is code in `frontend/scripts/mockup-compare/` so it gets type checks, lint, and package resolution, and humans can run it without an agent. The skill holds only the judgment steps: reading screenshots for composition, checking `design-deviations.md`, and reporting. Playwright is a pinned dev dependency so Codex and Claude run the same check. Faked API data keeps runs deterministic and keeps test records out of the dev database; typing fixtures with `frontend/src/types` makes API drift a build error. Measured computed styles catch exact color, size, and spacing differences that screenshots alone miss. Differences found on existing screens go to `docs/issues.md`, because `design-deviations.md` records approvals only and this plan does not change application code.

Rejected: each agent's own browser tooling (a different procedure per agent); unpinned `npx playwright` (version drift); a real backend with seeded data (slow, writes to the dev database); screenshot-only judgment (unreliable on exact values); pixel diff (flags every content difference and adds a second dependency); the selector map in the skill folder (no package resolution, type checks, or lint there); fixing differences inside Task 7 (outside this plan's scope, and each fix needs design approval).

### Skill Gotchas

A problem goes into a skill's `## Gotchas` only when code cannot prevent it. A fixture, a clear error, a lint rule, or a test reaches every agent and human on every run; a skill entry helps only when the skill is loaded. Entries are one line with a file pointer, capped at about 8 per skill.

New gotchas are captured through an `AGENTS.md` rule: the agent proposes a code fix or gotcha in its final message after a costly repository-specific problem, and the user approves it. The rule is in `AGENTS.md` because it is always loaded, and approval keeps the list small.

Rejected: a separate `gotchas.md` linked from the skill (agents often skip linked files); comments in `conftest.py` only (seen only when that code is opened); a check only at plan-task completion (misses unplanned work); manual capture only (depends on the user remembering).

## Hook Safety

Stop hooks must not block indefinitely, so they stop blocking when the agent reports `stop_hook_active`. Diagnostics go in the block `reason` because stderr is not reliably shown to the agent.

JSON is read and written with `jq`, now a listed requirement. Log text in `reason` needs real escaping; hand-built `echo` JSON breaks on quotes and newlines. Rejected: `python3` one-liners (system Python is not guaranteed; the backend's Python is managed by `uv`) and manual escaping (error-prone). A missing `jq` blocks once with an install message, because a hook that exits non-zero is treated as a non-blocking error and the checks would be skipped with little notice.

The loop guard relies on `stop_hook_active` in both agents. Both agents send the field (verified in Task 3), so the hash-of-last-failure fallback was not built.

Hook scripts are committed executable and still invoked through `bash`, so they work whether or not the execute bit survives.

Scope stays at all uncommitted and untracked files, so the hooks may reformat or block on the user's own edits. Rejected: tracking only files the agent edited, which needs a turn-start snapshot hook in both agents plus state files, for a problem not yet observed.

Codex in a git worktree reads the main checkout's `.codex/hooks.json` and runs it with the worktree as the working directory, and it trusts hooks per file path and content hash. Hook changes therefore reach Codex only after they are merged into the main checkout and re-trusted. Scripts must keep working when run from any checkout, which the `git rev-parse --show-toplevel` `cd` provides.

## Permissions

`.claude/settings.json` allows only test, lint, format-check, build, and read-only or file-creating Alembic commands. Commands that mutate the configured database (`alembic upgrade`, `alembic downgrade`) still prompt, because downgrade can drop data and `AGENTS.md` requires preserving existing data. `uv run python` is excluded even though Codex allows it at user level, because it runs arbitrary code and would make every other rule meaningless. Rules use plain command forms only; Claude checks each part of a compound command, so `cd backend && uv run pytest` matches without `--directory` or `--prefix` variants.

Codex permissions stay user-level. Codex approvals come from its sandbox and approval policy rather than allow rules, and the user-level rules already allow `uv run pytest` and `npm run test`. Rejected for now: a project-level Codex rules file, which would add a second list to keep in sync without a demonstrated need.
