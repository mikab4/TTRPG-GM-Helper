import { describe, expect, it } from "vitest";

import { getAssetStatusPresentation } from "../assets/presentation";

describe("asset status presentation", () => {
  it.each([
    ["active", "available", "File available", false, "available"],
    ["active", "missing", "File missing", false, "missing"],
    ["deleting", "available", "Deletion in progress", true, "deleting"],
    ["deleting", "missing", "Deletion in progress", true, "deleting"],
  ] as const)("presents lifecycle %s and storage %s", (lifecycleStatus, storageStatus, label, isReadOnly, tone) => {
    expect(getAssetStatusPresentation({ lifecycleStatus, storageStatus })).toEqual({ isReadOnly, label, tone });
  });
});
