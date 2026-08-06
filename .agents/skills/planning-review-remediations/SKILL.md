---
name: planning-review-remediations
description: Use when a user supplies or pastes a code-review finding, review comment, review point, or requested review-feedback response. Default to a remediation plan without implementation; accept optional branch scope/design references and iterate until the user explicitly approves the plan and says to implement.
---

# Planning Review Remediations

Turn one review finding into an implementation-ready plan. The plan is a gate: review feedback is not authority to change code, and plan approval alone is not authority to implement.

## Input

Require a review finding. Accept optional reference-document paths as additional scope authority. If a referenced file cannot be read, ask for its contents or a valid path; never silently omit it.

Natural-language input is sufficient. Do not require a saved plan or rigid headings. If missing context makes a plan unsafe, ask one concise question before proposing it.

## Initial plan workflow

1. **REQUIRED SUB-SKILL:** Use `superpowers:receiving-code-review` to assess the finding rather than assuming it is correct.
2. Read applicable `AGENTS.md` instructions and their required source-of-truth documents. Read every user-supplied scope or design reference before deciding the plan.
3. Inspect only the files, contracts, tests, and nearby behavior needed to verify the finding. State a reasoned objection if it conflicts with an approved design or is not technically sound.
4. Produce a plan only. Include the verified success condition, exact files likely to change, lifecycle/error/cleanup behavior, a simpler alternative when adding meaningful complexity, and behavioral tests.
5. Do not implement, edit product code, create test code, modify configuration, run mutating application commands, or create a plan document unless the user separately requests that artifact.

## Plan revision loop

When the user supplies approval feedback or asks to revise the plan, treat it as a revision to the active finding only.

- Preserve the original finding, optional references, and approved architectural boundaries.
- Reinspect only newly relevant code or documents.
- Incorporate required changes, remove superseded statements, and return the full revised plan when requested.
- Do not reopen the full branch review or implement any part of the plan.
- If feedback is ambiguous or conflicts with scope references, explain the conflict and ask one targeted question.

Use `review-remediation-plan` only when the task is to evaluate a separately proposed remediation plan; this skill creates and iterates the plan from the finding.

## Approval gate

Remain in plan-only mode until the user gives both:

1. an unambiguous approval of the current plan; and
2. an explicit instruction to implement it.

Examples that authorize implementation: “Approved—implement it” and “I approve this plan; start implementation.” “Approved,” “write the plan doc,” “prepare the patch,” or “what would implementation involve?” do not authorize implementation.

After the gate opens, follow the repository's normal implementation, testing, and verification skills; do not treat this skill as implementation guidance.

## Red flags

- “This is obvious; I can fix it now.” → Verify and plan first.
- “The review says to change it.” → Review comments are evidence, not implementation authority.
- “The user approved the concept.” → Wait for an explicit implementation instruction.
- “A reference document is optional, so I can ignore it.” → Optional means the user may omit it; supplied references must be read.
- “I can make the tests now without implementing.” → Test code is implementation work; keep tests in the plan until the gate opens.
