# Assets Upload UI Design

## Goal

Make the campaign Assets page match the updated `docs/mockups/workspace-v1.html` upload flow while preserving the existing campaign-scoped API contracts and the existing Delete action in library rows.

## Interaction

- Initially show only the dashed drop zone with the upload icon and browse action.
- After a file is selected or dropped, replace the drop zone with a compact configuration card.
- The configuration card shows Display Title, Truth Status, and Link to Session in one desktop row.
- Selecting `Create a new session` reveals an inline session-title field.
- Cancel clears the selected file and restores the drop zone.
- A successful upload restores the drop zone and prepends the created asset to the library.

## Presentation

Use the mockup's purple dashed upload surface, bordered metadata card, compact library toolbar, file-type blocks, and metadata chips. The library keeps View and Delete controls; Delete is the one deliberate deviation from the static mockup because it already supports the required asset lifecycle workflow.

## Constraints

- Keep upload behavior as frontend orchestration of the existing session and asset endpoints.
- Do not introduce parse, preview, replacement, or relink behavior.
- Keep media-family filtering server-backed and search client-side.
