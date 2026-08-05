import { afterEach, describe, expect, it, vi } from "vitest";

describe("getCampaignSwitcherPath", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("maps relationship type management to Relationships in the selected campaign", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    const { getCampaignSwitcherPath } = await import("../app/AppShell");

    expect(getCampaignSwitcherPath("/campaigns/campaign-1/relationship-types", "campaign-2")).toBe(
      "/campaigns/campaign-2/relationships",
    );
  });

  it("keeps the selected workspace section when switching campaigns", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    const { getCampaignSwitcherPath } = await import("../app/AppShell");

    expect(getCampaignSwitcherPath("/campaigns/campaign-1/sessions/session-1/edit", "campaign-2")).toBe(
      "/campaigns/campaign-2/sessions",
    );
    expect(getCampaignSwitcherPath("/campaigns/campaign-1/assets/asset-1", "campaign-2")).toBe(
      "/campaigns/campaign-2/assets",
    );
  });
});
