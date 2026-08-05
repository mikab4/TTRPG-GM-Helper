import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

type MockJsonResponse = {
  ok: boolean;
  status?: number;
  body?: unknown;
};

function jsonResponse(response: MockJsonResponse): Response {
  return {
    headers: new Headers({ "Content-Type": "application/json" }),
    json: () => Promise.resolve(response.body),
    ok: response.ok,
    status: response.status ?? 200,
  } as Response;
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

describe("campaign and entity frontend routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
    window.localStorage.clear();
  });

  it("renders the campaigns page with fetched campaigns", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          body: [
            {
              id: "campaign-1",
              owner_id: "owner-1",
              name: "Shadows of Glass",
              description: "Urban intrigue campaign",
              created_at: "2026-04-08T12:00:00Z",
              updated_at: "2026-04-08T12:00:00Z",
            },
          ],
        }),
      ),
    );

    const { routes } = await import("../app/routes");
    const router = createMemoryRouter(routes, {
      initialEntries: ["/campaigns"],
    });

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("heading", { name: "Campaigns" })).toHaveClass("font-cinzel");
    expect(screen.getByRole("link", { name: "New Campaign" })).toBeInTheDocument();
    expect(await screen.findByText("Shadows of Glass")).toBeInTheDocument();
    expect(screen.queryByText("Urban intrigue campaign")).toBeNull();
    expect(screen.queryByText(/Last Updated/i)).toBeNull();
    expect(screen.queryByRole("heading", { name: "Campaign List" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open workspace for Shadows of Glass" })).toHaveAttribute(
      "href",
      "/campaigns/campaign-1",
    );
    expect(screen.getByRole("button", { name: "Delete Shadows of Glass" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
  });

  it("renders the campaign card itself as the workspace link", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          body: [
            {
              id: "campaign-1",
              owner_id: "owner-1",
              name: "Shadows of Glass",
              description: "Urban intrigue campaign",
              created_at: "2026-04-08T12:00:00Z",
              updated_at: "2026-04-08T12:00:00Z",
            },
          ],
        }),
      ),
    );

    const { routes } = await import("../app/routes");
    const router = createMemoryRouter(routes, {
      initialEntries: ["/campaigns"],
    });

    render(<RouterProvider router={router} />);

    const campaignLink = await screen.findByRole("link", {
      name: "Open workspace for Shadows of Glass",
    });

    expect(campaignLink).toHaveAttribute("href", "/campaigns/campaign-1");
    expect(screen.getByText("Shadows of Glass").closest("a")).toBe(campaignLink);
  });

  it("renders the campaign workspace overview by default", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          body: {
            id: "campaign-1",
            owner_id: "owner-1",
            name: "Shadows of Glass",
            description: "Urban intrigue campaign",
            created_at: "2026-04-08T12:00:00Z",
            updated_at: "2026-04-08T12:00:00Z",
          },
        }),
      ),
    );

    const { routes } = await import("../app/routes");
    const router = createMemoryRouter(routes, {
      initialEntries: ["/campaigns/campaign-1"],
    });

    const { container } = render(<RouterProvider router={router} />);

    expect(document.querySelector(".shell-header-content")).not.toBeNull();
    expect(screen.queryByRole("link", { name: "Back to Registry" })).toBeNull();
    const workspaceSidebar = await screen.findByRole("navigation", { name: "Campaign Workspace" });
    expect(workspaceSidebar).toHaveClass("campaign-workspace-sidebar");
    expect(within(workspaceSidebar).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(within(workspaceSidebar).getByRole("link", { name: "Entities" })).toBeInTheDocument();
    expect(within(workspaceSidebar).getByRole("link", { name: "Relationships" })).toBeInTheDocument();
    expect(within(workspaceSidebar).getByRole("link", { name: "Sessions" })).toHaveAttribute(
      "href",
      "/campaigns/campaign-1/sessions",
    );
    expect(within(workspaceSidebar).getByRole("link", { name: "Assets" })).toHaveAttribute(
      "href",
      "/campaigns/campaign-1/assets",
    );
    expect(screen.getByRole("heading", { name: "Campaign Summary" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent Activity" })).toBeInTheDocument();
    expect(screen.getByText("No recent activity is available yet.")).toBeInTheDocument();
    expect(screen.queryByText("Syncing with chronological log...")).toBeNull();
    expect(screen.getByRole("heading", { name: "Quick Notes" })).toBeInTheDocument();
    expect(screen.getByText("Urban intrigue campaign")).toBeInTheDocument();
    expect(container.querySelector(".campaign-workspace")).not.toBeNull();
    expect(container.querySelector(".workspace-surface")).toBeNull();
    expect(screen.queryByText("Create a campaign workspace before adding campaign-specific entities.")).toBeNull();
    expect(
      screen.queryByText("Keep campaign descriptions short and practical in v1 so the table remains easy to scan."),
    ).toBeNull();
    expect(
      screen.queryByText(
        "This is the campaign cockpit summary: enough orientation to stay in flow now, with room for notes, relationships, and extraction surfaces later.",
      ),
    ).toBeNull();
  });

  it("filters campaign relationships by URL-backed entity and type selections", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    const fetchSpy = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const requestUrl = getRequestUrl(input);

      if (requestUrl.endsWith("/campaigns/campaign-1")) {
        return Promise.resolve(
          jsonResponse({
            ok: true,
            body: {
              id: "campaign-1",
              owner_id: "owner-1",
              name: "Shadows of Glass",
              description: "Urban intrigue campaign",
              created_at: "2026-04-08T12:00:00Z",
              updated_at: "2026-04-08T12:00:00Z",
            },
          }),
        );
      }

      if (requestUrl.endsWith("/campaigns/campaign-1/entities")) {
        return Promise.resolve(
          jsonResponse({
            ok: true,
            body: [
              {
                id: "entity-1",
                campaign_id: "campaign-1",
                type: "person",
                name: "Rowan",
                summary: "Harbor ruler",
                metadata: {},
                source_asset_id: null,
                provenance_excerpt: null,
                provenance_data: {},
                created_at: "2026-04-08T12:00:00Z",
                updated_at: "2026-04-08T12:00:00Z",
              },
              {
                id: "entity-2",
                campaign_id: "campaign-1",
                type: "location",
                name: "Blackharbor",
                summary: "Port city",
                metadata: {},
                source_asset_id: null,
                provenance_excerpt: null,
                provenance_data: {},
                created_at: "2026-04-08T12:00:00Z",
                updated_at: "2026-04-08T12:00:00Z",
              },
              {
                id: "entity-3",
                campaign_id: "campaign-1",
                type: "location",
                name: "Ash Provinces",
                summary: "Regional territory",
                metadata: {},
                source_asset_id: null,
                provenance_excerpt: null,
                provenance_data: {},
                created_at: "2026-04-08T12:00:00Z",
                updated_at: "2026-04-08T12:00:00Z",
              },
              {
                id: "entity-4",
                campaign_id: "campaign-1",
                type: "organization",
                name: "Harbor Watch",
                summary: "City guard",
                metadata: {},
                source_asset_id: null,
                provenance_excerpt: null,
                provenance_data: {},
                created_at: "2026-04-08T12:00:00Z",
                updated_at: "2026-04-08T12:00:00Z",
              },
            ],
          }),
        );
      }

      if (requestUrl.endsWith("/campaigns/campaign-1/relationships")) {
        return Promise.resolve(
          jsonResponse({
            ok: true,
            body: [
              {
                id: "relationship-1",
                campaign_id: "campaign-1",
                source_entity_id: "entity-1",
                target_entity_id: "entity-2",
                relationship_type: "governs",
                relationship_family: "political",
                relationship_family_label: "Political",
                forward_label: "governs",
                reverse_label: "governed by",
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
              },
              {
                id: "relationship-2",
                campaign_id: "campaign-1",
                source_entity_id: "entity-3",
                target_entity_id: "entity-2",
                relationship_type: "located_in",
                relationship_family: "location",
                relationship_family_label: "Location",
                forward_label: "is located in",
                reverse_label: "contains",
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
              },
              {
                id: "relationship-3",
                campaign_id: "campaign-1",
                source_entity_id: "entity-1",
                target_entity_id: "entity-4",
                relationship_type: "leader_of",
                relationship_family: "political",
                relationship_family_label: "Political",
                forward_label: "leads",
                reverse_label: "is led by",
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
              },
            ],
          }),
        );
      }

      if (requestUrl.includes("/relationship-types?campaign_id=campaign-1")) {
        return Promise.resolve(
          jsonResponse({
            ok: true,
            body: [
              {
                key: "governs",
                label: "governs",
                family: "political",
                family_label: "Political",
                reverse_label: "governed by",
                is_symmetric: false,
                allowed_source_types: ["person", "organization"],
                allowed_target_types: ["location", "organization"],
                is_custom: false,
                created_at: null,
                updated_at: null,
              },
            ],
          }),
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${requestUrl}`));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { routes } = await import("../app/routes");
    const router = createMemoryRouter(routes, {
      initialEntries: ["/campaigns/campaign-1/relationships?entity_id=entity-1&relationship_type=governs"],
    });

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("heading", { name: "Relationships" })).toHaveClass("font-cinzel");
    expect(await screen.findByText("Rowan governs Blackharbor")).toBeInTheDocument();
    expect(screen.queryByText("Ash Provinces is located in Blackharbor")).toBeNull();
    expect(screen.queryByText("Rowan leads Harbor Watch")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Filter by entity" })).toHaveValue("Rowan");
    expect(screen.getByRole("combobox", { name: "Filter by relationship type" })).toHaveValue("governs");
    expect(screen.getAllByText("Current · Public · Confirmed")).toHaveLength(1);
    expect(screen.queryByText("political · Current · Public · Confirmed")).toBeNull();
    expect(screen.getByRole("link", { name: "New Relationship" })).toHaveAttribute(
      "href",
      "/campaigns/campaign-1/relationships/new",
    );
    expect(screen.getByRole("link", { name: "Relationship Type Management" })).toHaveAttribute(
      "href",
      "/campaigns/campaign-1/relationship-types",
    );
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Relationship Type Workbench" })).toBeNull();
    expect(screen.queryByText("person, organization -> location, organization")).toBeNull();
  });

  it("guides relationship creation by group first and filters entity choices to valid types", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    const fetchSpy = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = getRequestUrl(input);

      if (requestUrl.endsWith("/campaigns/campaign-1")) {
        return Promise.resolve(
          jsonResponse({
            ok: true,
            body: {
              id: "campaign-1",
              owner_id: "owner-1",
              name: "Shadows of Glass",
              description: "Urban intrigue campaign",
              created_at: "2026-04-08T12:00:00Z",
              updated_at: "2026-04-08T12:00:00Z",
            },
          }),
        );
      }

      if (requestUrl.endsWith("/campaigns/campaign-1/entities")) {
        return Promise.resolve(
          jsonResponse({
            ok: true,
            body: [
              {
                id: "entity-1",
                campaign_id: "campaign-1",
                type: "person",
                name: "Rowan",
                summary: "Harbor ruler",
                metadata: {},
                source_asset_id: null,
                provenance_excerpt: null,
                provenance_data: {},
                created_at: "2026-04-08T12:00:00Z",
                updated_at: "2026-04-08T12:00:00Z",
              },
              {
                id: "entity-2",
                campaign_id: "campaign-1",
                type: "location",
                name: "Blackharbor",
                summary: "Trade city",
                metadata: {},
                source_asset_id: null,
                provenance_excerpt: null,
                provenance_data: {},
                created_at: "2026-04-08T12:00:00Z",
                updated_at: "2026-04-08T12:00:00Z",
              },
              {
                id: "entity-3",
                campaign_id: "campaign-1",
                type: "organization",
                name: "Harbor Watch",
                summary: "City watch",
                metadata: {},
                source_asset_id: null,
                provenance_excerpt: null,
                provenance_data: {},
                created_at: "2026-04-08T12:00:00Z",
                updated_at: "2026-04-08T12:00:00Z",
              },
              {
                id: "entity-4",
                campaign_id: "campaign-1",
                type: "event",
                name: "Night of Cinders",
                summary: "Disaster",
                metadata: {},
                source_asset_id: null,
                provenance_excerpt: null,
                provenance_data: {},
                created_at: "2026-04-08T12:00:00Z",
                updated_at: "2026-04-08T12:00:00Z",
              },
            ],
          }),
        );
      }

      if (requestUrl.endsWith("/relationship-families")) {
        return Promise.resolve(
          jsonResponse({
            ok: true,
            body: [
              { value: "family", label: "Family" },
              { value: "social", label: "Social" },
              { value: "political", label: "Political" },
            ],
          }),
        );
      }

      if (requestUrl.includes("/relationship-types?campaign_id=campaign-1")) {
        return Promise.resolve(
          jsonResponse({
            ok: true,
            body: [
              {
                key: "governs",
                label: "governs",
                family: "political",
                family_label: "Political",
                reverse_label: "governed by",
                is_symmetric: false,
                allowed_source_types: ["person", "organization"],
                allowed_target_types: ["location", "organization"],
                is_custom: false,
                created_at: null,
                updated_at: null,
              },
              {
                key: "member_of",
                label: "member of",
                family: "social",
                family_label: "Social",
                reverse_label: "has member",
                is_symmetric: false,
                allowed_source_types: ["person"],
                allowed_target_types: ["organization"],
                is_custom: false,
                created_at: null,
                updated_at: null,
              },
              {
                key: "sibling_of",
                label: "sibling of",
                family: "family",
                family_label: "Family",
                reverse_label: "sibling of",
                is_symmetric: true,
                allowed_source_types: ["person"],
                allowed_target_types: ["person"],
                is_custom: false,
                created_at: null,
                updated_at: null,
              },
            ],
          }),
        );
      }

      if (requestUrl.endsWith("/campaigns/campaign-1/relationships") && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse({
            ok: true,
            body: {
              id: "relationship-1",
              campaign_id: "campaign-1",
              source_entity_id: "entity-1",
              target_entity_id: "entity-2",
              relationship_type: "governs",
              relationship_family: "political",
              relationship_family_label: "Political",
              forward_label: "governs",
              reverse_label: "governed by",
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
            },
          }),
        );
      }

      throw new Error(`Unhandled request URL: ${requestUrl}`);
    });

    vi.stubGlobal("fetch", fetchSpy);

    const { routes } = await import("../app/routes");
    const router = createMemoryRouter(routes, {
      initialEntries: ["/campaigns/campaign-1/relationships/new"],
    });

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("heading", { name: "New Relationship" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Source Entity"), {
      target: { value: "entity-1" },
    });

    const groupSelect = screen.getByLabelText("Relationship Group");
    expect(within(groupSelect).getByRole("option", { name: "Political" })).toBeInTheDocument();
    expect(within(groupSelect).getByRole("option", { name: "Social" })).toBeInTheDocument();
    expect(within(groupSelect).getByRole("option", { name: "Family" })).toBeInTheDocument();

    fireEvent.change(groupSelect, {
      target: { value: "political" },
    });

    const relationshipTypeSelect = screen.getByLabelText(/Relationship Type/i);
    expect(within(relationshipTypeSelect).getByRole("option", { name: "governs" })).toBeInTheDocument();
    expect(within(relationshipTypeSelect).queryByRole("option", { name: "member of" })).toBeNull();

    fireEvent.change(relationshipTypeSelect, {
      target: { value: "governs" },
    });

    const targetEntitySelect = screen.getByLabelText("Target Entity");
    expect(within(targetEntitySelect).getByRole("option", { name: "Blackharbor" })).toBeInTheDocument();
    expect(within(targetEntitySelect).getByRole("option", { name: "Harbor Watch" })).toBeInTheDocument();
    expect(within(targetEntitySelect).queryByRole("option", { name: "Night of Cinders" })).toBeNull();

    fireEvent.change(targetEntitySelect, {
      target: { value: "entity-2" },
    });

    expect(within(screen.getByLabelText("Source Entity")).queryByRole("option", { name: "Blackharbor" })).toBeNull();
    expect(within(screen.getByLabelText("Source Entity")).queryByRole("option", { name: "Night of Cinders" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Create Relationship" }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://example.test/api/campaigns/campaign-1/relationships",
        expect.objectContaining({ method: "POST" }),
      );
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/campaigns/campaign-1/relationships");
    });
  });

  it("keeps an incompatible saved relationship visible on edit and warns instead of clearing it", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const requestUrl = getRequestUrl(input);

        if (requestUrl.endsWith("/campaigns/campaign-1")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: {
                id: "campaign-1",
                owner_id: "owner-1",
                name: "Shadows of Glass",
                description: "Urban intrigue campaign",
                created_at: "2026-04-08T12:00:00Z",
                updated_at: "2026-04-08T12:00:00Z",
              },
            }),
          );
        }

        if (requestUrl.endsWith("/campaigns/campaign-1/entities")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: [
                {
                  id: "source-internal-42",
                  campaign_id: "campaign-1",
                  type: "person",
                  name: "Rowan",
                  summary: "Harbor ruler",
                  metadata: {},
                  source_asset_id: null,
                  provenance_excerpt: null,
                  provenance_data: {},
                  created_at: "2026-04-08T12:00:00Z",
                  updated_at: "2026-04-08T12:00:00Z",
                },
                {
                  id: "target-internal-84",
                  campaign_id: "campaign-1",
                  type: "person",
                  name: "Blackharbor",
                  summary: "Now modeled incorrectly for compatibility testing",
                  metadata: {},
                  source_asset_id: null,
                  provenance_excerpt: null,
                  provenance_data: {},
                  created_at: "2026-04-08T12:00:00Z",
                  updated_at: "2026-04-08T12:00:00Z",
                },
                {
                  id: "entity-3",
                  campaign_id: "campaign-1",
                  type: "organization",
                  name: "Harbor Watch",
                  summary: "City watch",
                  metadata: {},
                  source_asset_id: null,
                  provenance_excerpt: null,
                  provenance_data: {},
                  created_at: "2026-04-08T12:00:00Z",
                  updated_at: "2026-04-08T12:00:00Z",
                },
              ],
            }),
          );
        }

        if (requestUrl.endsWith("/campaigns/campaign-1/entities/entity-1") && init?.method === "DELETE") {
          return Promise.resolve(
            jsonResponse({
              ok: false,
              status: 500,
              body: { detail: "Entity deletion failed." },
            }),
          );
        }

        if (requestUrl.endsWith("/relationship-families")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: [
                { value: "family", label: "Family" },
                { value: "social", label: "Social" },
                { value: "political", label: "Political" },
              ],
            }),
          );
        }

        if (requestUrl.includes("/relationship-types?campaign_id=campaign-1")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: [
                {
                  key: "governs_internal",
                  label: "governs",
                  family: "political",
                  family_label: "Political",
                  reverse_label: "governed by",
                  is_symmetric: false,
                  allowed_source_types: ["person", "organization"],
                  allowed_target_types: ["location", "organization"],
                  is_custom: false,
                  created_at: null,
                  updated_at: null,
                },
              ],
            }),
          );
        }

        if (requestUrl.endsWith("/campaigns/campaign-1/relationships/relationship-1")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: {
                id: "relationship-1",
                campaign_id: "campaign-1",
                source_entity_id: "source-internal-42",
                target_entity_id: "target-internal-84",
                relationship_type: "governs_internal",
                relationship_family: "political",
                relationship_family_label: "Political",
                forward_label: "governs",
                reverse_label: "governed by",
                is_symmetric: false,
                lifecycle_status: "current",
                visibility_status: "public",
                certainty_status: "confirmed",
                notes: "Persisted before the target type changed.",
                confidence: null,
                source_asset_id: null,
                provenance_excerpt: null,
                provenance_data: {},
                created_at: "2026-04-08T12:00:00Z",
                updated_at: "2026-04-08T12:00:00Z",
              },
            }),
          );
        }

        throw new Error(`Unhandled request URL: ${requestUrl}`);
      }),
    );

    const { routes } = await import("../app/routes");
    const router = createMemoryRouter(routes, {
      initialEntries: ["/campaigns/campaign-1/relationships/relationship-1/edit"],
    });

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("heading", { name: "Edit Relationship" })).toBeInTheDocument();
    expect(
      screen.getByText(/This saved relationship no longer matches the current entity or type rules/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Source Entity")).toHaveValue("source-internal-42");
    expect(screen.getByLabelText("Target Entity")).toHaveValue("target-internal-84");
    expect(screen.getByLabelText("Relationship Group")).toHaveValue("political");
    expect(screen.getByLabelText(/Relationship Type/i)).toHaveValue("governs_internal");
    expect(screen.getByRole("option", { name: /governs \(saved, now incompatible\)/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Blackharbor \(saved, now incompatible\)/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete Relationship" }));

    const deleteDialog = await screen.findByRole("dialog", { name: "Delete Rowan governs Blackharbor?" });
    expect(deleteDialog).not.toHaveTextContent("source-internal-42");
    expect(deleteDialog).not.toHaveTextContent("target-internal-84");
    expect(deleteDialog).not.toHaveTextContent("governs_internal");
  });

  it("shows the add custom type helper next to relationship type selection", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const requestUrl = getRequestUrl(input);

        if (requestUrl.includes("/compatibility/entity-types")) {
          return Promise.resolve(jsonResponse({ ok: true, body: { has_issues: false, issue_count: 0, issues: [] } }));
        }

        if (requestUrl.endsWith("/campaigns/campaign-1")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: {
                id: "campaign-1",
                owner_id: "owner-1",
                name: "Shadows of Glass",
                description: "Urban intrigue campaign",
                created_at: "2026-04-08T12:00:00Z",
                updated_at: "2026-04-08T12:00:00Z",
              },
            }),
          );
        }

        if (requestUrl.endsWith("/campaigns/campaign-1/entities")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: [
                {
                  id: "entity-1",
                  campaign_id: "campaign-1",
                  type: "person",
                  name: "Rowan",
                  summary: "Harbor ruler",
                  metadata: {},
                  source_asset_id: null,
                  provenance_excerpt: null,
                  provenance_data: {},
                  created_at: "2026-04-08T12:00:00Z",
                  updated_at: "2026-04-08T12:00:00Z",
                },
                {
                  id: "entity-2",
                  campaign_id: "campaign-1",
                  type: "location",
                  name: "Blackharbor",
                  summary: "Port city",
                  metadata: {},
                  source_asset_id: null,
                  provenance_excerpt: null,
                  provenance_data: {},
                  created_at: "2026-04-08T12:00:00Z",
                  updated_at: "2026-04-08T12:00:00Z",
                },
              ],
            }),
          );
        }

        if (requestUrl.endsWith("/relationship-families")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: [
                { value: "family", label: "Family" },
                { value: "social", label: "Social" },
                { value: "political", label: "Political" },
              ],
            }),
          );
        }

        if (requestUrl.includes("/relationship-types?campaign_id=campaign-1")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: [
                {
                  key: "bodyguard_of",
                  label: "bodyguard of",
                  family: "social",
                  family_label: "Social",
                  reverse_label: "guarded by",
                  is_symmetric: false,
                  allowed_source_types: ["person"],
                  allowed_target_types: ["person", "location"],
                  is_custom: true,
                  created_at: "2026-04-11T12:00:00Z",
                  updated_at: "2026-04-11T12:00:00Z",
                },
              ],
            }),
          );
        }

        throw new Error(`Unhandled request URL: ${requestUrl}`);
      }),
    );

    const { routes } = await import("../app/routes");
    const router = createMemoryRouter(routes, {
      initialEntries: ["/campaigns/campaign-1/relationships/new"],
    });

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("heading", { name: "New Relationship" })).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Add custom type/i })).toHaveAttribute(
      "href",
      "/campaigns/campaign-1/relationship-types/new",
    );
  });

  it("keeps campaign quick notes locally across remounts", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          body: {
            id: "campaign-1",
            owner_id: "owner-1",
            name: "Shadows of Glass",
            description: "Urban intrigue campaign",
            created_at: "2026-04-08T12:00:00Z",
            updated_at: "2026-04-08T12:00:00Z",
          },
        }),
      ),
    );

    const { routes } = await import("../app/routes");
    const router = createMemoryRouter(routes, {
      initialEntries: ["/campaigns/campaign-1"],
    });

    const { unmount } = render(<RouterProvider router={router} />);

    const quickNotes = await screen.findByRole("textbox", { name: "Quick Notes" });
    fireEvent.change(quickNotes, {
      target: { value: "Remember the king's brother knows the east gate signal." },
    });

    await waitFor(() => {
      expect(window.localStorage.getItem("gm-workspace:campaign-quick-notes:campaign-1")).toBe(
        "Remember the king's brother knows the east gate signal.",
      );
    });

    unmount();

    const remountRouter = createMemoryRouter(routes, {
      initialEntries: ["/campaigns/campaign-1"],
    });

    render(<RouterProvider router={remountRouter} />);

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Quick Notes" })).toHaveValue(
        "Remember the king's brother knows the east gate signal.",
      );
    });
  });

  it("exposes edit and delete actions from the campaign overview", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    const fetchSpy = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = getRequestUrl(input);

      if (requestUrl.endsWith("/campaigns/campaign-1") && init?.method !== "DELETE") {
        return Promise.resolve(
          jsonResponse({
            ok: true,
            body: {
              id: "campaign-1",
              owner_id: "owner-1",
              name: "Shadows of Glass",
              description: "Urban intrigue campaign",
              created_at: "2026-04-08T12:00:00Z",
              updated_at: "2026-04-08T12:00:00Z",
            },
          }),
        );
      }

      if (requestUrl.endsWith("/campaigns/campaign-1") && init?.method === "DELETE") {
        return Promise.resolve(
          jsonResponse({
            ok: true,
            status: 204,
          }),
        );
      }

      if (requestUrl.endsWith("/campaigns")) {
        return Promise.resolve(
          jsonResponse({
            ok: true,
            body: [],
          }),
        );
      }

      throw new Error(`Unhandled request URL: ${requestUrl}`);
    });

    vi.stubGlobal("fetch", fetchSpy);

    const { routes } = await import("../app/routes");
    const router = createMemoryRouter(routes, {
      initialEntries: ["/campaigns/campaign-1"],
    });

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("link", { name: "Edit Campaign" })).toHaveAttribute("href", "/campaigns/campaign-1/edit");
    expect(screen.getByRole("button", { name: "Delete Campaign" })).toBeInTheDocument();
  });

  it("renders campaign-scoped entities inside the campaign workspace", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const requestUrl = getRequestUrl(input);

        if (requestUrl.endsWith("/campaigns/campaign-1")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: {
                id: "campaign-1",
                owner_id: "owner-1",
                name: "Shadows of Glass",
                description: "Urban intrigue campaign",
                created_at: "2026-04-08T12:00:00Z",
                updated_at: "2026-04-08T12:00:00Z",
              },
            }),
          );
        }

        if (requestUrl.endsWith("/campaigns/campaign-1/entities")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: [
                {
                  id: "entity-1",
                  campaign_id: "campaign-1",
                  type: "npc",
                  name: "Magistrate Ilya",
                  summary: "City official",
                  metadata: {},
                  source_asset_id: null,
                  provenance_excerpt: null,
                  provenance_data: {},
                  created_at: "2026-04-08T12:00:00Z",
                  updated_at: "2026-04-08T12:00:00Z",
                },
              ],
            }),
          );
        }

        if (requestUrl.endsWith("/campaigns/campaign-1/entities/entity-1") && init?.method === "DELETE") {
          return Promise.resolve(
            jsonResponse({
              ok: false,
              status: 500,
              body: { detail: "Entity deletion failed." },
            }),
          );
        }

        throw new Error(`Unhandled request URL: ${requestUrl}`);
      }),
    );

    const { routes } = await import("../app/routes");
    const router = createMemoryRouter(routes, {
      initialEntries: ["/campaigns/campaign-1/entities"],
    });

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("heading", { name: "Entities" })).toBeInTheDocument();
    expect(await screen.findByText("Magistrate Ilya")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit Campaign" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete Campaign" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Entity Roster" })).toBeNull();
    expect(screen.getByRole("link", { name: "New Entity" })).toBeInTheDocument();
    expect(screen.getByText("NPC")).toBeInTheDocument();
    expect(screen.getByText("City official")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit Magistrate Ilya" })).toHaveAttribute(
      "href",
      "/campaigns/campaign-1/entities/entity-1/edit",
    );
    expect(screen.queryByRole("button", { name: "Quick look Magistrate Ilya" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open" })).toBeNull();
  });

  it("opens a quick-look side panel from the campaign workspace entity list", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const requestUrl = getRequestUrl(input);

        if (requestUrl.endsWith("/campaigns/campaign-1")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: {
                id: "campaign-1",
                owner_id: "owner-1",
                name: "Shadows of Glass",
                description: "Urban intrigue campaign",
                created_at: "2026-04-08T12:00:00Z",
                updated_at: "2026-04-08T12:00:00Z",
              },
            }),
          );
        }

        if (requestUrl.endsWith("/campaigns/campaign-1/entities")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: [
                {
                  id: "entity-1",
                  campaign_id: "campaign-1",
                  type: "npc",
                  name: "Magistrate Ilya",
                  summary: "Brother of Rowan, magistrate of the lower ward.",
                  metadata: {},
                  source_asset_id: "asset-1",
                  provenance_excerpt: null,
                  provenance_data: {},
                  created_at: "2026-04-08T12:00:00Z",
                  updated_at: "2026-04-08T12:00:00Z",
                },
              ],
            }),
          );
        }

        throw new Error(`Unhandled request URL: ${requestUrl}`);
      }),
    );

    const { routes } = await import("../app/routes");
    const router = createMemoryRouter(routes, {
      initialEntries: ["/campaigns/campaign-1/entities"],
    });

    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByText("Magistrate Ilya"));

    expect(screen.getByRole("heading", { level: 4, name: "Magistrate Ilya" }).closest("article")).toHaveClass(
      "entity-roster-card-selected",
    );

    const quickLookPanel = await screen.findByRole("complementary", { name: "Entity quick look" });
    expect(quickLookPanel.className).toContain("quick-look-panel-paper");

    expect(within(quickLookPanel).getByRole("heading", { name: "Summary" })).toBeInTheDocument();
    expect(within(quickLookPanel).queryByRole("heading", { name: "Source Asset" })).toBeNull();
    expect(within(quickLookPanel).queryByText("asset-1")).toBeNull();
    expect(within(quickLookPanel).queryByRole("heading", { name: "Core Details" })).toBeNull();
    expect(within(quickLookPanel).queryByRole("heading", { name: "Appears In" })).toBeNull();
    expect(
      within(quickLookPanel).queryByText(
        "npc record in active use. Open the full record for campaign notes, editing, and deeper provenance.",
      ),
    ).toBeNull();
    expect(within(quickLookPanel).getByText("Brother of Rowan, magistrate of the lower ward.")).toBeInTheDocument();
    expect(within(quickLookPanel).getByRole("link", { name: "Full Profile" })).toHaveAttribute(
      "href",
      "/campaigns/campaign-1/entities/entity-1",
    );
    expect(within(quickLookPanel).getByRole("link", { name: "Relationship Management" })).toHaveAttribute(
      "href",
      "/campaigns/campaign-1/relationships?entity_id=entity-1",
    );
    expect(within(quickLookPanel).getByRole("link", { name: "Edit Entity" })).toHaveAttribute(
      "href",
      "/campaigns/campaign-1/entities/entity-1/edit",
    );
    expect(within(quickLookPanel).getByRole("button", { name: "Delete Entity" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.getByRole("heading", { level: 4, name: "Magistrate Ilya" }).closest("article")).not.toHaveClass(
      "entity-roster-card-selected",
    );
  });

  it("filters campaign entities by name without closing the quick look", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const requestUrl = getRequestUrl(input);

        if (requestUrl.endsWith("/campaigns/campaign-1")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: {
                id: "campaign-1",
                owner_id: "owner-1",
                name: "Shadows of Glass",
                description: "Urban intrigue campaign",
                created_at: "2026-04-08T12:00:00Z",
                updated_at: "2026-04-08T12:00:00Z",
              },
            }),
          );
        }

        if (requestUrl.endsWith("/campaigns/campaign-1/entities")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: [
                {
                  id: "entity-1",
                  campaign_id: "campaign-1",
                  type: "person",
                  name: "Captain Rowan",
                  summary: "Harbor ruler",
                  metadata: {},
                  source_asset_id: null,
                  provenance_excerpt: null,
                  provenance_data: {},
                  created_at: "2026-04-08T12:00:00Z",
                  updated_at: "2026-04-08T12:00:00Z",
                },
                {
                  id: "entity-2",
                  campaign_id: "campaign-1",
                  type: "location",
                  name: "Blackharbor",
                  summary: "Port city",
                  metadata: {},
                  source_asset_id: null,
                  provenance_excerpt: null,
                  provenance_data: {},
                  created_at: "2026-04-08T12:00:00Z",
                  updated_at: "2026-04-08T12:00:00Z",
                },
              ],
            }),
          );
        }

        return Promise.resolve(jsonResponse({ ok: true, body: [] }));
      }),
    );

    const { routes } = await import("../app/routes");
    const router = createMemoryRouter(routes, {
      initialEntries: ["/campaigns/campaign-1/entities"],
    });

    render(<RouterProvider router={router} />);

    const entitySearch = await screen.findByRole("searchbox", { name: "Search entity names" });
    fireEvent.change(entitySearch, { target: { value: "CAPTAIN" } });

    expect(screen.getByText("Captain Rowan")).toBeInTheDocument();
    expect(screen.queryByText("Blackharbor")).toBeNull();

    fireEvent.click(screen.getByText("Captain Rowan"));
    expect(await screen.findByRole("complementary", { name: "Entity quick look" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.getByRole("searchbox", { name: "Search entity names" })).toHaveValue("CAPTAIN");
    expect(screen.getByText("Captain Rowan")).toBeInTheDocument();
    expect(screen.queryByText("Blackharbor")).toBeNull();
  });

  it("renders relationship type inventory on its own campaign route", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    let createdTypeVisible = false;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const requestUrl = getRequestUrl(input);

        if (requestUrl.endsWith("/campaigns/campaign-1")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: {
                id: "campaign-1",
                owner_id: "owner-1",
                name: "Shadows of Glass",
                description: "Urban intrigue campaign",
                created_at: "2026-04-08T12:00:00Z",
                updated_at: "2026-04-08T12:00:00Z",
              },
            }),
          );
        }

        if (requestUrl.endsWith("/campaigns/campaign-1/relationship-types") && init?.method === "POST") {
          const requestBody = typeof init.body === "string" ? init.body : "";
          const parsedBody = JSON.parse(requestBody) as { label: string };

          if (parsedBody.label === "governs") {
            return Promise.resolve(
              jsonResponse({
                ok: false,
                status: 422,
                body: {
                  detail: "Relationship type label already exists for this campaign.",
                },
              }),
            );
          }

          createdTypeVisible = true;
          return Promise.resolve(
            jsonResponse({
              ok: true,
              status: 201,
              body: {
                key: "bodyguard_of",
                label: "bodyguard of",
                family: "social",
                family_label: "Social",
                reverse_label: "guarded by",
                is_symmetric: false,
                allowed_source_types: ["person"],
                allowed_target_types: ["person", "organization"],
                is_custom: true,
                created_at: "2026-04-12T12:00:00Z",
                updated_at: "2026-04-12T12:00:00Z",
              },
            }),
          );
        }

        if (requestUrl.endsWith("/campaigns/campaign-1/relationship-types/bodyguard_of") && init?.method === "PATCH") {
          const requestBody = typeof init.body === "string" ? init.body : "";
          const parsedBody = JSON.parse(requestBody) as { label?: string };

          if (parsedBody.label === "governs") {
            return Promise.resolve(
              jsonResponse({
                ok: false,
                status: 422,
                body: {
                  detail: "Relationship type label already exists for this campaign.",
                },
              }),
            );
          }

          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: {
                key: "bodyguard_of",
                label: parsedBody.label ?? "bodyguard of",
                family: "social",
                family_label: "Social",
                reverse_label: "guarded by",
                is_symmetric: false,
                allowed_source_types: ["person"],
                allowed_target_types: ["person", "organization"],
                is_custom: true,
                created_at: "2026-04-12T12:00:00Z",
                updated_at: "2026-04-12T12:00:00Z",
              },
            }),
          );
        }

        if (requestUrl.endsWith("/relationship-families")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: [
                { value: "family", label: "Family" },
                { value: "social", label: "Social" },
                { value: "political", label: "Political" },
              ],
            }),
          );
        }

        if (requestUrl.includes("/relationship-types?campaign_id=campaign-1")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: createdTypeVisible
                ? [
                    {
                      key: "bodyguard_of",
                      label: "bodyguard of",
                      family: "social",
                      family_label: "Social",
                      reverse_label: "guarded by",
                      is_symmetric: false,
                      allowed_source_types: ["person"],
                      allowed_target_types: ["person", "organization"],
                      is_custom: true,
                      created_at: "2026-04-12T12:00:00Z",
                      updated_at: "2026-04-12T12:00:00Z",
                    },
                    {
                      key: "governs",
                      label: "governs",
                      family: "political",
                      family_label: "Political",
                      reverse_label: "governed by",
                      is_symmetric: false,
                      allowed_source_types: ["person", "organization"],
                      allowed_target_types: ["location", "organization"],
                      is_custom: false,
                      created_at: null,
                      updated_at: null,
                    },
                  ]
                : [
                    {
                      key: "governs",
                      label: "governs",
                      family: "political",
                      family_label: "Political",
                      reverse_label: "governed by",
                      is_symmetric: false,
                      allowed_source_types: ["person", "organization"],
                      allowed_target_types: ["location", "organization"],
                      is_custom: false,
                      created_at: null,
                      updated_at: null,
                    },
                  ],
            }),
          );
        }

        throw new Error(`Unhandled request URL: ${requestUrl}`);
      }),
    );

    const { routes } = await import("../app/routes");
    const router = createMemoryRouter(routes, {
      initialEntries: ["/campaigns/campaign-1/relationship-types"],
    });

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("heading", { name: "Relationship Type Management" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back To Relationships" })).toHaveAttribute(
      "href",
      "/campaigns/campaign-1/relationships",
    );
    expect(screen.getAllByRole("link", { name: "Create custom type" })[0]).toHaveAttribute(
      "href",
      "/campaigns/campaign-1/relationship-types/new",
    );
    expect(screen.getByRole("heading", { name: "Custom Relationship Types" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Built-in Relationship Types" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Allowed Source Type")).toBeNull();
  });

  it("renders the entity full profile on the main entity route", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const requestUrl = getRequestUrl(input);

        if (requestUrl.endsWith("/campaigns/campaign-1")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: {
                id: "campaign-1",
                owner_id: "owner-1",
                name: "Shadows of Glass",
                description: "Urban intrigue campaign",
                created_at: "2026-04-08T12:00:00Z",
                updated_at: "2026-04-08T12:00:00Z",
              },
            }),
          );
        }

        if (requestUrl.endsWith("/campaigns/campaign-1/entities/entity-1")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: {
                id: "entity-1",
                campaign_id: "campaign-1",
                type: "npc",
                name: "Magistrate Ilya",
                summary: "Brother of Rowan, magistrate of the lower ward.",
                metadata: {},
                source_asset_id: null,
                provenance_excerpt: null,
                provenance_data: {},
                created_at: "2026-04-08T12:00:00Z",
                updated_at: "2026-04-08T12:00:00Z",
              },
            }),
          );
        }

        throw new Error(`Unhandled request URL: ${requestUrl}`);
      }),
    );

    const { routes } = await import("../app/routes");
    const router = createMemoryRouter(routes, {
      initialEntries: ["/campaigns/campaign-1/entities/entity-1"],
    });

    const { container } = render(<RouterProvider router={router} />);

    expect(await screen.findByRole("heading", { name: "Magistrate Ilya" })).toBeInTheDocument();
    expect(container.querySelector(".workspace-surface")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Summary" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit Entity" })).toHaveAttribute(
      "href",
      "/campaigns/campaign-1/entities/entity-1/edit",
    );
    const relationshipsAction = screen
      .getAllByRole("link", { name: "Relationships" })
      .find((link) => link.classList.contains("secondary-button"));
    expect(relationshipsAction).toHaveAttribute("href", "/campaigns/campaign-1/relationships?entity_id=entity-1");
    expect(screen.getByRole("button", { name: "Delete Entity" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Back To Campaign" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save Entity" })).toBeNull();
  });

  it("keeps the campaign sidebar on the entity edit route", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const requestUrl = getRequestUrl(input);

        if (requestUrl.endsWith("/campaigns/campaign-1")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: {
                id: "campaign-1",
                owner_id: "owner-1",
                name: "Shadows of Glass",
                description: "Urban intrigue campaign",
                created_at: "2026-04-08T12:00:00Z",
                updated_at: "2026-04-08T12:00:00Z",
              },
            }),
          );
        }

        if (requestUrl.endsWith("/campaigns/campaign-1/entities")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: [
                {
                  id: "entity-1",
                  campaign_id: "campaign-1",
                  type: "person",
                  name: "Magistrate Ilya",
                  summary: "Brother of Rowan, magistrate of the lower ward.",
                  metadata: {},
                  source_asset_id: null,
                  provenance_excerpt: null,
                  provenance_data: {},
                  created_at: "2026-04-08T12:00:00Z",
                  updated_at: "2026-04-08T12:00:00Z",
                },
              ],
            }),
          );
        }

        if (requestUrl.endsWith("/campaigns/campaign-1/relationships")) {
          return Promise.resolve(jsonResponse({ ok: true, body: [] }));
        }

        if (requestUrl.endsWith("/campaigns/campaign-1/entities/entity-1")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: {
                id: "entity-1",
                campaign_id: "campaign-1",
                type: "npc",
                name: "Magistrate Ilya",
                summary: "Brother of Rowan, magistrate of the lower ward.",
                metadata: {},
                source_asset_id: null,
                provenance_excerpt: null,
                provenance_data: {},
                created_at: "2026-04-08T12:00:00Z",
                updated_at: "2026-04-08T12:00:00Z",
              },
            }),
          );
        }

        throw new Error(`Unhandled request URL: ${requestUrl}`);
      }),
    );

    const { routes } = await import("../app/routes");
    const router = createMemoryRouter(routes, {
      initialEntries: ["/campaigns/campaign-1/entities/entity-1/edit"],
    });

    const { container } = render(<RouterProvider router={router} />);

    expect(await screen.findByRole("heading", { name: "Edit Entity" })).toBeInTheDocument();
    expect(container.querySelector(".workspace-surface")).not.toBeNull();
    expect(screen.getByRole("navigation", { name: "Campaign Workspace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Entity" })).toBeInTheDocument();
    expect(screen.getByLabelText("Type")).toHaveDisplayValue("NPC (legacy)");
    expect(screen.getByRole("option", { name: "Organization" })).toBeInTheDocument();
  });

  it("keeps the campaign-scoped new entity page free of plan-document wording", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const requestUrl = getRequestUrl(input);

        if (requestUrl.endsWith("/campaigns/campaign-1")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: {
                id: "campaign-1",
                owner_id: "owner-1",
                name: "Shadows of Glass",
                description: "Urban intrigue campaign",
                created_at: "2026-04-08T12:00:00Z",
                updated_at: "2026-04-08T12:00:00Z",
              },
            }),
          );
        }

        return Promise.resolve(jsonResponse({ ok: true, body: [] }));
      }),
    );

    const { routes } = await import("../app/routes");
    const router = createMemoryRouter(routes, {
      initialEntries: ["/campaigns/campaign-1/entities/new"],
    });

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("heading", { name: "New Entity" })).toBeInTheDocument();
    expect(screen.queryByText("Create a new entity directly inside this campaign workspace.")).toBeNull();
    expect(
      screen.queryByText("Metadata stays hidden in step 6 to keep the entity editor focused on the core CRUD path."),
    ).toBeNull();
  });

  it("shows a user-facing error when entity delete fails from the edit page", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const requestUrl = getRequestUrl(input);

        if (requestUrl.endsWith("/campaigns/campaign-1")) {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: {
                id: "campaign-1",
                owner_id: "owner-1",
                name: "Shadows of Glass",
                description: "Urban intrigue campaign",
                created_at: "2026-04-08T12:00:00Z",
                updated_at: "2026-04-08T12:00:00Z",
              },
            }),
          );
        }

        if (requestUrl.endsWith("/campaigns/campaign-1/entities/entity-1") && init?.method !== "DELETE") {
          return Promise.resolve(
            jsonResponse({
              ok: true,
              body: {
                id: "entity-1",
                campaign_id: "campaign-1",
                type: "npc",
                name: "Magistrate Ilya",
                summary: "Brother of Rowan, magistrate of the lower ward.",
                metadata: {},
                source_asset_id: null,
                provenance_excerpt: null,
                provenance_data: {},
                created_at: "2026-04-08T12:00:00Z",
                updated_at: "2026-04-08T12:00:00Z",
              },
            }),
          );
        }

        if (requestUrl.endsWith("/campaigns/campaign-1/entities/entity-1") && init?.method === "DELETE") {
          return Promise.resolve(
            jsonResponse({
              ok: false,
              status: 404,
              body: {
                detail: "Entity no longer exists.",
              },
            }),
          );
        }

        throw new Error(`Unhandled request URL: ${requestUrl}`);
      }),
    );

    const { routes } = await import("../app/routes");
    const router = createMemoryRouter(routes, {
      initialEntries: ["/campaigns/campaign-1/entities/entity-1/edit"],
    });

    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete Entity" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Entity no longer exists.");
    expect(screen.getByRole("button", { name: "Delete Entity" })).toBeEnabled();
  });
});
