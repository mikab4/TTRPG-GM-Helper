# Agent Tooling

Codex and Claude Code share one source of agent instructions, skills, and hooks. Decisions and trade-offs are in [`plans/2026-11-15-cross-agent-tooling-reasoning.md`](plans/2026-11-15-cross-agent-tooling-reasoning.md).

## Rule

Edit shared files under `.agents/` and `AGENTS.md`. Never edit them through the `.claude/` symlinks, and never duplicate them into agent-specific folders.

## Supported Checkouts

Linux, macOS, and WSL. On Windows, clone inside WSL: native Windows Git checks out the `.claude/skills` symlink as a plain text file, and Claude then finds no skills.

## Layers

| Layer | Holds | Codex reads | Claude Code reads |
|---|---|---|---|
| Always-on rules | Architecture, mockup authority, test and planning rules | `AGENTS.md` | `CLAUDE.md`, which imports `@AGENTS.md` |
| Deterministic checks | Formatting and lint of changed files | `.codex/hooks.json` → `.agents/hooks/` | `.claude/settings.json` → `.agents/hooks/` |
| On-demand procedures | Repo-specific workflows, gotchas, verification | `.agents/skills/` | `.claude/skills` → `../.agents/skills` symlink |
| Generic workflows | Planning, code review, exploration | Built-in features | Built-in features |

The git pre-commit hook in `.githooks/pre-commit` runs for both agents and for humans.

## Stop Hooks

- Require `jq`. Without it, each hook blocks once with an install message.
- Check every uncommitted and untracked file under `backend/` and `frontend/`, including your own edits, not only files the agent changed.
- Block at most once per turn; the next stop passes (`stop_hook_active`).
- Codex in a git worktree loads the **main checkout's** `.codex/hooks.json` but runs it from the worktree. Until a hook change is merged into the main checkout, Codex in a worktree runs the old hook commands. After the merge, Codex asks to trust the changed hooks once.

## File Map

| Path | Purpose |
|---|---|
| `AGENTS.md` | Canonical always-on rules |
| `CLAUDE.md` | Claude entry point; only `@AGENTS.md` plus any future Claude-only notes |
| `.agents/skills/<name>/SKILL.md` | Canonical skills |
| `.agents/skills/<name>/agents/openai.yaml` | Codex UI metadata; Claude ignores it |
| `.agents/hooks/` | Shared Stop hook scripts; `hook-common.sh` holds the shared setup |
| `.codex/config.toml`, `.codex/hooks.json` | Codex wiring only |
| `.claude/settings.json` | Claude hook wiring and shared permissions |
| `.claude/settings.local.json` | Personal Claude settings; gitignored |
