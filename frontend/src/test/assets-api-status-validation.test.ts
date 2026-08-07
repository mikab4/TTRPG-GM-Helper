import { afterEach, describe, expect, it, vi } from "vitest";

function assetPayload(lifecycleStatus: string, storageStatus: string) {
  return {
    campaign_id: "campaign-1",
    created_at: "2026-08-06T00:00:00Z",
    file_size_bytes: 1200,
    id: "asset-1",
    lifecycle_status: lifecycleStatus,
    media_type: "application/pdf",
    metadata: {},
    original_filename: "archive.pdf",
    session_id: null,
    storage_status: storageStatus,
    title: "Archive",
    truth_status: "canonical",
    updated_at: "2026-08-06T00:00:00Z",
  };
}

describe("asset API status validation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each([
    ["active", "available"],
    ["active", "missing"],
    ["deleting", "available"],
    ["deleting", "missing"],
  ])("accepts lifecycle %s with storage %s", async (lifecycleStatus, storageStatus) => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([assetPayload(lifecycleStatus, storageStatus)]) }),
    );

    const { listAssets } = await import("../api/assets");

    await expect(listAssets("campaign-1")).resolves.toHaveLength(1);
  });

  it.each([
    ["unknown", "available"],
    ["active", "unknown"],
  ])("rejects unsupported lifecycle/storage values", async (lifecycleStatus, storageStatus) => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([assetPayload(lifecycleStatus, storageStatus)]) }),
    );

    const { listAssets } = await import("../api/assets");

    await expect(listAssets("campaign-1")).rejects.toThrow("Invalid asset response payload.");
  });
});
