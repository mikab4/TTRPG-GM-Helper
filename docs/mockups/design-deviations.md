# Frontend Design Deviations

`workspace-v1.html` is the authoritative frontend visual and interaction reference. This file records explicit approvals to differ from it; it is not a second design specification.

Do not record ordinary implementation details or differences that have not been approved. If a route, section, tab, state, or error path is absent from the mockup, obtain approval for the proposed mockup-consistent treatment before implementing it.

## Required Record

Each approved deviation must state:

- **Date:** approval date
- **Surface:** route, component, or interaction
- **Mockup baseline:** what the authoritative mockup specifies, or what it leaves unspecified
- **Approved deviation:** the exact visual or interaction difference
- **Rationale:** why matching the mockup is not appropriate or possible
- **Approved by:** responsible engineer
- **Mockup follow-up:** whether `workspace-v1.html` should be updated and who owns that follow-up

## Approved Deviations

None recorded.

## Baseline Reconciliation

The mockup became explicitly authoritative after parts of the frontend had already been implemented. Existing differences are not retroactively approved. Before changing an existing frontend surface, compare the touched area with the mockup and surface any pre-existing or proposed deviations to the responsible engineer. A complete visual-conformance audit is separate work and has not yet been performed.
