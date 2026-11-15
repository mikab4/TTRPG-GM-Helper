---
name: verify-ui-against-mockup
description: Use when planning, implementing, or reviewing a change to a frontend screen, to compare it with `docs/mockups/workspace-v1.html` and report every difference.
---

# Verify UI Against Mockup

Follow the "Frontend Design Authority" rules in `AGENTS.md`. This skill adds how to measure a screen against the mockup and how to report what you find.

## Steps

1. Find the screen in `frontend/scripts/mockup-compare/screens.ts`. If it is missing, add a definition: app route, fake API responses (typed fixtures in `fixtures.ts`), and a selector map pairing mockup elements with app elements. Use `app: null` for mockup elements the app lacks and `mockup: null` for app elements the mockup lacks.
2. From `frontend/`, run `npm run mockup:compare -- <screen>`. Add `--width <px>` when the change touches a mockup rule between 640 and 768 px (for example `--width 744` or `--width 680`).
3. If the report has an `## Errors` section or the command exits 1, fix the selector map or fixtures first. Differences are not trustworthy until errors are gone.
4. Open `app.png` and `mockup.png` for each width in `frontend/.mockup-compare/<screen>/`. Compare composition, hierarchy, proportions, and control placement; the measured table does not cover layout.
5. Check each difference against `docs/mockups/design-deviations.md`. Drop only those with a recorded approval.
6. Report the rest to the user grouped by element, with mockup and app values. Do not fix them silently; a fix is a design change that needs approval.

## Reading the Report

- Measured properties are computed styles plus rendered size. Only the first font in `font-family` is compared.
- Container rows that differ only in inherited `font-size` or `line-height` usually share one cause (the base font size). Report the cause once.
- `presence` rows are elements that exist on only one side. `visibility` rows are elements hidden on one side at that width.
- Fixtures copy the mockup's sample records, so differences in wording are real copy differences.

## Gotchas
