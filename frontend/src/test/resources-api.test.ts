import { afterEach, describe, expect, it, vi } from "vitest";

describe("frontend resource APIs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("loads the default owner", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "0ea5d4df-868d-4643-b788-404c1c8bc85e",
            email: "gm@example.com",
            display_name: "Local GM",
            created_at: "2026-04-08T12:00:00Z",
            updated_at: "2026-04-08T12:00:00Z",
          }),
      }),
    );

    const { getDefaultOwner } = await import("../api/owners");

    await expect(getDefaultOwner()).resolves.toMatchObject({
      id: "0ea5d4df-868d-4643-b788-404c1c8bc85e",
      email: "gm@example.com",
      displayName: "Local GM",
    });
  });

  it("lists campaigns from the campaign collection endpoint", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal("fetch", fetchSpy);

    const { listCampaigns } = await import("../api/campaigns");

    await listCampaigns();

    const firstCall = fetchSpy.mock.calls[0] as [string, RequestInit] | undefined;

    expect(firstCall).toBeDefined();
    expect(firstCall?.[0]).toBe("http://example.test/api/campaigns");
    expect(firstCall?.[1]).toMatchObject({
      headers: {
        Accept: "application/json",
      },
      method: "GET",
    });
  });

  it("creates entities through the campaign-scoped endpoint", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "5dc2d3f5-0f84-48c2-b728-7c89fb30d04b",
          campaign_id: "c53594e5-c721-46dc-8f88-70273d8de676",
          type: "person",
          name: "Ilya",
          summary: "Magistrate",
          metadata: {},
          source_asset_id: null,
          provenance_excerpt: null,
          provenance_data: {},
          created_at: "2026-04-08T12:00:00Z",
          updated_at: "2026-04-08T12:00:00Z",
        }),
    });

    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal("fetch", fetchSpy);

    const { createEntity } = await import("../api/entities");

    await expect(
      createEntity("c53594e5-c721-46dc-8f88-70273d8de676", {
        type: "person",
        name: "Ilya",
        summary: "Magistrate",
        metadata: {},
      }),
    ).resolves.toMatchObject({ sourceAssetId: null });

    const firstCall = fetchSpy.mock.calls[0] as [string, RequestInit] | undefined;

    expect(firstCall).toBeDefined();
    expect(firstCall?.[0]).toBe("http://example.test/api/campaigns/c53594e5-c721-46dc-8f88-70273d8de676/entities");
    expect(firstCall?.[1]).toMatchObject({
      body: JSON.stringify({
        type: "person",
        name: "Ilya",
        summary: "Magistrate",
        metadata: {},
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  });

  it("creates relationships from source-asset response payloads", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "relationship-1",
            campaign_id: "campaign-1",
            source_entity_id: "entity-1",
            target_entity_id: "entity-2",
            relationship_type: "knows",
            relationship_family: "social",
            relationship_family_label: "Social",
            forward_label: "knows",
            reverse_label: "known by",
            is_symmetric: false,
            lifecycle_status: "current",
            visibility_status: "public",
            certainty_status: "confirmed",
            notes: null,
            confidence: null,
            source_asset_id: null,
            provenance_excerpt: null,
            provenance_data: {},
            created_at: "2026-04-08T12:00:00Z",
            updated_at: "2026-04-08T12:00:00Z",
          }),
      }),
    );

    const { createRelationship } = await import("../api/relationships");

    await expect(
      createRelationship("campaign-1", {
        sourceEntityId: "entity-1",
        targetEntityId: "entity-2",
        relationshipType: "knows",
        lifecycleStatus: "current",
        visibilityStatus: "public",
        certaintyStatus: "confirmed",
        notes: null,
      }),
    ).resolves.toMatchObject({ sourceAssetId: null });
  });

  it("surfaces backend error details as readable messages", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers({ "Content-Type": "application/json" }),
        json: () => Promise.resolve({ detail: "Campaign not found." }),
      }),
    );

    const { getCampaign } = await import("../api/campaigns");

    await expect(getCampaign("missing-campaign")).rejects.toThrow("Campaign not found.");
  });

  it("lists campaign relationship types with campaign context", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            key: "bodyguard_of",
            label: "bodyguard of",
            family: "social",
            family_label: "Social",
            reverse_label: "guarded by",
            is_symmetric: false,
            allowed_source_types: ["person"],
            allowed_target_types: ["person"],
            is_custom: true,
            created_at: "2026-04-11T12:00:00Z",
            updated_at: "2026-04-11T12:00:00Z",
          },
        ]),
    });

    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal("fetch", fetchSpy);

    const { listRelationshipTypes } = await import("../api/relationshipTypes");

    await expect(listRelationshipTypes("campaign-1")).resolves.toMatchObject([
      {
        key: "bodyguard_of",
        label: "bodyguard of",
        family: "social",
        familyLabel: "Social",
        reverseLabel: "guarded by",
        isCustom: true,
      },
    ]);

    const firstCall = fetchSpy.mock.calls[0] as [string, RequestInit] | undefined;
    expect(firstCall?.[0]).toBe("http://example.test/api/relationship-types?campaign_id=campaign-1");
  });

  it("rejects malformed relationship type arrays instead of coercing members to strings", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              key: "bodyguard_of",
              label: "bodyguard of",
              family: "social",
              family_label: "Social",
              reverse_label: "guarded by",
              is_symmetric: false,
              allowed_source_types: [42],
              allowed_target_types: ["person"],
              is_custom: true,
              created_at: "2026-04-11T12:00:00Z",
              updated_at: "2026-04-11T12:00:00Z",
            },
          ]),
      }),
    );

    const { listRelationshipTypes } = await import("../api/relationshipTypes");

    await expect(listRelationshipTypes("campaign-1")).rejects.toThrow("Invalid relationship type response payload.");
  });

  it("lists relationship families from the backend metadata endpoint", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { value: "family", label: "Family" },
          { value: "organization", label: "Organization" },
        ]),
    });

    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal("fetch", fetchSpy);

    const { listRelationshipFamilies } = await import("../api/relationshipFamilies");

    await expect(listRelationshipFamilies()).resolves.toEqual([
      { value: "family", label: "Family" },
      { value: "organization", label: "Organization" },
    ]);

    const firstCall = fetchSpy.mock.calls[0] as [string, RequestInit] | undefined;
    expect(firstCall?.[0]).toBe("http://example.test/api/relationship-families");
  });

  it("lists sessions and creates an asset with the campaign-scoped contracts", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "asset-1",
            campaign_id: "campaign-1",
            session_id: "session-1",
            title: "Harbor map",
            truth_status: "uncertain",
            media_type: "image/png",
            original_filename: "harbor.png",
            file_size_bytes: 1200,
            lifecycle_status: "active",
            storage_status: "available",
            metadata: {},
            created_at: "2026-04-08T12:00:00Z",
            updated_at: "2026-04-08T12:00:00Z",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal("fetch", fetchSpy);

    const { listSessions } = await import("../api/sessions");
    const { createAsset, listAssets } = await import("../api/assets");

    await listSessions("campaign-1");
    await expect(
      createAsset("campaign-1", {
        file: new File(["map"], "harbor.png", { type: "image/png" }),
        sessionId: "session-1",
        title: "Harbor map",
        truthStatus: "uncertain",
      }),
    ).resolves.toMatchObject({ storageStatus: "available" });
    await listAssets("campaign-1", { mediaFamily: "image" });

    expect(fetchSpy.mock.calls[0]?.[0]).toBe("http://example.test/api/campaigns/campaign-1/sessions");
    expect(fetchSpy.mock.calls[1]?.[0]).toBe("http://example.test/api/campaigns/campaign-1/assets");
    const assetRequest = fetchSpy.mock.calls[1]?.[1] as RequestInit | undefined;
    expect(assetRequest).toMatchObject({ method: "POST" });
    expect(assetRequest?.body).toBeInstanceOf(FormData);
    expect(fetchSpy.mock.calls[2]?.[0]).toBe("http://example.test/api/campaigns/campaign-1/assets?media_family=image");
  });
});
