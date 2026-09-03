# Plans

Documents directly in this directory are current planning guidance.

Documents under [`archive/`](archive/) are historical records. They may describe completed, abandoned, or superseded work and must not be used as current guidance unless a current plan explicitly links to them.

When a plan stops being current, move it to `archive/`. Do not maintain an active-plan inventory or classify archived plans by lifecycle status.

Every current plan must begin with this discovery block immediately after its title:

```markdown
**Applies to:** affected features or domains
**Related code:** relevant directories, modules, or files
**Deferred design triggers:** `None` or `<option>: <reason>`
```

Keep all three fields short and specific enough that an agent can decide whether to read the full plan and whether a deferred design decision is active. Review the headings and `Trigger` fields in `docs/deferred_design_options.md` before setting the third field. Archived plans do not need this block.

When requested work satisfies or may satisfy a deferred-design trigger, flag it before choosing an architecture. Record whether the option is activated, rejected, or remains deferred in both the applicable plan and its reasoning document before implementation begins.

Every current implementation plan must also have a sibling reasoning document using the same filename with `-reasoning` before `.md`:

```text
feature-plan.md
feature-plan-reasoning.md
```

The reasoning document summarizes important decisions, trade-offs, rejected alternatives, and boundaries. It must use the same discovery-block format. This pairing requirement applies to current plans, not archived plans.

Do not duplicate implementation facts that are authoritative in code, migrations, generated artifacts, or tests. Reasoning documents should record consequential decisions, trade-offs, rejected alternatives, and boundaries that cannot be reliably recovered from the implementation. When a decision changes, replace or explicitly supersede outdated reasoning so current guidance does not contradict itself.

## Task Progress

Retain completed task sections while a plan remains current. Preserve each task's original intent and steps, mark its current status, and add a concise summary of what was implemented. Correct paths, schema descriptions, and other details that no longer match the repository.

Use `Planned`, `Next`, `In Progress`, `Blocked`, or `Complete` as task statuses. Unless a plan explicitly supports parallel work, identify only one task as `Next`.

Update the sibling reasoning document when implementation changes an architectural decision, trade-off, rejected alternative, or boundary. Routine implementation details belong in the plan rather than the reasoning summary.
