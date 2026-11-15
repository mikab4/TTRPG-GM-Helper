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

## No Third-Party Skill Packs

Superpowers and gstack are removed. Their planning, brainstorming, and review workflows overlap built-in agent features (plan modes, `/code-review`, `/review`, subagents) and spend context restating behavior current models already follow. Superpowers' main measured benefit came from its session-start prompt telling the agent to use skills, which `AGENTS.md` provides directly.

Accepted cost: generic discipline (such as test-first) is no longer injected every session. Mitigation: the repository-specific testing rules already sit in `AGENTS.md`, and formatting/lint are enforced by hooks.

Personal user-level skills and instructions (`~/.codex/skills/`, `~/.codex/AGENTS.md`, `~/.claude/CLAUDE.md`) are out of scope. The project does not depend on them, so sharing them between agents is personal setup, not repository tooling. Task 9 only removes the third-party packs.

Simpler alternative kept available: Tasks 1–5 alone give a working cross-agent setup; Tasks 6–8 add value but are optional.

## Skill Selection

New skills must add information or verification a model cannot derive alone. UI verification is prioritized because the mockup-authority rule is the strictest rule in `AGENTS.md` and currently has no check. Generic code-review and planning skills are rejected in favor of built-in features and `docs/plans/README.md`.

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
