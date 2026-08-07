import { describe, expect, it } from "vitest";

import { getAssetStatusPresentation } from "../assets/presentation";

describe("asset status presentation", () => {
  it.each([
    ["active", "available", "File available", false],
    ["active", "missing", "File missing", false],
    ["deleting", "available", "Deletion in progress", true],
    ["deleting", "missing", "Deletion in progress", true],
  ] as const)("presents lifecycle %s and storage %s", (lifecycleStatus, storageStatus, label, isReadOnly) => {
    expect(getAssetStatusPresentation({ lifecycleStatus, storageStatus })).toEqual({ isReadOnly, label });
  });
});
