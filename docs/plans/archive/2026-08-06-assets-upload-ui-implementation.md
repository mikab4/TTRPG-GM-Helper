# Assets Upload UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align the campaign Assets upload page with the updated workspace mockup while retaining the existing Delete action.

**Architecture:** Keep the existing campaign-scoped typed API calls and local form state. Render one of two upload surfaces based on whether a file is selected: the initial drop zone or the configuration card. Continue to use existing session creation and multipart asset upload behavior.

**Tech Stack:** React, TypeScript, Vitest, CSS

---

### Task 1: Cover the upload-state transition

**Files:**
- Modify: `frontend/src/routes/CampaignAssetsTab.tsx`
- Create or modify: focused frontend route test under `frontend/src/test/`

**Step 1: Write the failing test**

Render the Assets route, select a file, and assert that the initial drop-zone heading disappears while the configuration-card heading and its Display Title, Truth Status, and Link to Session fields appear.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run <focused-test>` from `frontend/`

Expected: FAIL because the current form keeps the fields visible below the drop zone.

**Step 3: Write minimal implementation**

Render the drop zone only when no file is selected. Render the metadata configuration card only after a file is selected; retain the existing form submission and new-session state behavior.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run <focused-test>` from `frontend/`

Expected: PASS.

### Task 2: Match the mockup presentation and cancellation behavior

**Files:**
- Modify: `frontend/src/routes/CampaignAssetsTab.tsx`
- Modify: `frontend/src/styles.css`
- Test: focused frontend route test under `frontend/src/test/`

**Step 1: Write the failing test**

Assert that canceling a selected file restores the drop zone and removes the metadata form.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run <focused-test>` from `frontend/`

Expected: FAIL because the current screen has no cancellation state.

**Step 3: Write minimal implementation**

Add a cancellation handler that clears file-only upload state and the native file input. Add scoped CSS for the mockup’s upload icon, dashed surface, metadata panel, three-column controls, compact toolbar, file-type blocks, and status chips; preserve responsive behavior and row Delete controls.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run <focused-test>` from `frontend/`

Expected: PASS.

### Task 3: Verify the page

**Files:**
- Verify: `frontend/src/routes/CampaignAssetsTab.tsx`
- Verify: `frontend/src/styles.css`

**Step 1: Run focused tests**

Run: `npm test -- --run <focused-test>` from `frontend/`

Expected: PASS.

**Step 2: Run frontend quality checks**

Run: `npm run lint && npm run format:check && npm run build` from `frontend/`

Expected: all commands exit successfully.
