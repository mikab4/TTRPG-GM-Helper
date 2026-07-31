import { fireEvent, render, screen, within } from "@testing-library/react";
import { RouterProvider, createMemoryRouter, type RouteObject } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

type MockJsonResponse = {
  body: unknown;
  ok?: boolean;
  status?: number;
};

type DeferredValue<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferredValue<T>(): DeferredValue<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function jsonResponse({ body, ok = true, status = 200 }: MockJsonResponse): Response {
  return {
    headers: new Headers({ "Content-Type": "application/json" }),
    json: () => Promise.resolve(body),
    ok,
    status,
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

const campaigns = [
  {
    id: "campaign-1",
    owner_id: "owner-1",
    name: "Shadows of Glass",
    description: "Urban intrigue campaign",
    created_at: "2026-04-08T12:00:00Z",
    updated_at: "2026-04-08T12:00:00Z",
  },
  {
    id: "campaign-2",
    owner_id: "owner-1",
    name: "Frozen North",
    description: "Arctic survival campaign",
    created_at: "2026-04-09T12:00:00Z",
    updated_at: "2026-04-09T12:00:00Z",
  },
];

function installApiMock(): void {
  vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const requestUrl = getRequestUrl(input);

      if (requestUrl.endsWith("/compatibility/entity-types")) {
        return Promise.resolve(jsonResponse({ body: { has_issues: false, issue_count: 0, issues: [] } }));
      }

      if (requestUrl.endsWith("/campaigns")) {
        return Promise.resolve(jsonResponse({ body: campaigns }));
      }

      const campaign = campaigns.find((candidate) => requestUrl.endsWith(`/campaigns/${candidate.id}`));
      if (campaign !== undefined) {
        return Promise.resolve(jsonResponse({ body: campaign }));
      }

      return Promise.resolve(jsonResponse({ body: [] }));
    }),
  );
}

async function renderLoadedCampaignRegistry(routes: RouteObject[], initialEntry: string) {
  const router = createMemoryRouter(routes, { initialEntries: [initialEntry] });

  render(<RouterProvider router={router} />);

  await screen.findByRole("link", { name: "Open workspace for Shadows of Glass" });

  return router;
}

describe("workspace-first shell routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.doUnmock("react-router-dom");
    vi.doUnmock("../components/CampaignWorkspaceTabs");
    vi.resetModules();
  });

  it("uses the campaign registry as the default entry point", async () => {
    installApiMock();
    const { routes } = await import("../app/routes");
    const router = await renderLoadedCampaignRegistry(routes, "/");

    expect(await screen.findByRole("heading", { name: "Campaigns" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
    expect(screen.queryByRole("link", { name: "World" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Session Notes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Extraction" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Search" })).not.toBeInTheDocument();
  });

  it("offers the registry and campaigns from the header switcher", async () => {
    installApiMock();
    const { routes } = await import("../app/routes");
    await renderLoadedCampaignRegistry(routes, "/campaigns");

    fireEvent.click(screen.getByRole("button", { name: "Select campaign" }));

    expect(screen.getByRole("menuitem", { name: "Campaign Registry" })).toHaveAttribute("href", "/campaigns");
    expect(screen.getByRole("menuitem", { name: "Shadows of Glass" })).toHaveAttribute("href", "/campaigns/campaign-1");
    expect(screen.getByRole("menuitem", { name: "Frozen North" })).toHaveAttribute("href", "/campaigns/campaign-2");
  });

  it("closes the switcher when the user presses outside it", async () => {
    installApiMock();
    const { routes } = await import("../app/routes");
    await renderLoadedCampaignRegistry(routes, "/campaigns");

    const campaignsHeading = screen.getByRole("heading", { name: "Campaigns" });
    fireEvent.click(screen.getByRole("button", { name: "Select campaign" }));
    expect(screen.getByRole("menu", { name: "Campaign switcher" })).toBeInTheDocument();

    fireEvent.pointerDown(campaignsHeading);

    expect(screen.queryByRole("menu", { name: "Campaign switcher" })).toBeNull();
  });

  it("targets the same workspace section when switching campaigns", async () => {
    installApiMock();
    const { routes } = await import("../app/routes");
    const router = createMemoryRouter(routes, { initialEntries: ["/campaigns/campaign-1/entities"] });

    render(<RouterProvider router={router} />);

    await screen.findByRole("heading", { name: "Entities" });
    fireEvent.click(screen.getByRole("button", { name: "Select campaign" }));
    expect(screen.getByRole("menuitem", { name: "Frozen North" })).toHaveAttribute("href", "/campaigns/campaign-2/entities");
  });

  it.each(["/campaigns/campaign-1/relationship-types", "/campaigns/campaign-1/relationship-types/new"])(
    "switches relationship-type routes to Relationships in the selected campaign",
    async (initialEntry) => {
      installApiMock();
      const { routes } = await import("../app/routes");
      const router = createMemoryRouter(routes, { initialEntries: [initialEntry] });

      render(<RouterProvider router={router} />);

      fireEvent.click(screen.getByRole("button", { name: "Select campaign" }));
      expect(await screen.findByRole("menuitem", { name: "Frozen North" })).toHaveAttribute(
        "href",
        "/campaigns/campaign-2/relationships",
      );
    },
  );

  it.each(["/campaigns/campaign-1/relationship-types", "/campaigns/campaign-1/relationship-types/new"])(
    "keeps Relationships active for relationship-type supporting routes",
    async (initialEntry) => {
      installApiMock();
      const { routes } = await import("../app/routes");
      const router = createMemoryRouter(routes, { initialEntries: [initialEntry] });

      render(<RouterProvider router={router} />);

      const workspaceSidebar = await screen.findByRole("navigation", { name: "Campaign Workspace" });
      expect(within(workspaceSidebar).getByRole("link", { name: "Relationships" })).toHaveAttribute("aria-current", "page");
    },
  );

  it("removes prior campaign workspace content while the selected campaign loads", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    const campaignTwoRequest = createDeferredValue<Response>();
    let activeCampaignId = "campaign-1";

    vi.doMock("react-router-dom", async (importOriginal) => {
      const reactRouterDom = await importOriginal<typeof import("react-router-dom")>();

      return {
        ...reactRouterDom,
        Outlet: ({ context }: { context: { campaign: { id: string; name: string } } }) => (
          <section>
            <p>{context.campaign.name} workspace content</p>
            <a href={`/campaigns/${context.campaign.id}/entities/new`}>New Entity</a>
            <button type="button">Delete current entity</button>
          </section>
        ),
        useParams: () => ({ campaignId: activeCampaignId }),
      };
    });
    vi.doMock("../components/CampaignWorkspaceTabs", () => ({
      CampaignWorkspaceTabs: () => null,
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const requestUrl = getRequestUrl(input);

        if (requestUrl.endsWith("/campaigns/campaign-1")) {
          return Promise.resolve(jsonResponse({ body: campaigns[0] }));
        }

        if (requestUrl.endsWith("/campaigns/campaign-2")) {
          return campaignTwoRequest.promise;
        }

        return Promise.resolve(jsonResponse({ body: [] }));
      }),
    );

    const { CampaignWorkspacePage } = await import("../routes/CampaignWorkspacePage");

    const { rerender } = render(<CampaignWorkspacePage />);

    expect(await screen.findByText("Shadows of Glass workspace content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New Entity" })).toHaveAttribute("href", "/campaigns/campaign-1/entities/new");
    expect(screen.getByRole("button", { name: "Delete current entity" })).toBeInTheDocument();

    activeCampaignId = "campaign-2";
    rerender(<CampaignWorkspacePage />);

    expect(await screen.findByRole("heading", { name: "Loading campaign" })).toBeInTheDocument();
    expect(screen.queryByText("Shadows of Glass workspace content")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "New Entity" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete current entity" })).not.toBeInTheDocument();

    campaignTwoRequest.resolve(jsonResponse({ body: campaigns[1] }));

    expect(await screen.findByText("Frozen North workspace content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New Entity" })).toHaveAttribute("href", "/campaigns/campaign-2/entities/new");
    expect(screen.queryByText("Shadows of Glass workspace content")).not.toBeInTheDocument();
  });

  it("updates the switcher when a campaign mutation refreshes the directory", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    const listedCampaigns = [...campaigns];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const requestUrl = getRequestUrl(input);

        if (requestUrl.endsWith("/compatibility/entity-types")) {
          return Promise.resolve(jsonResponse({ body: { has_issues: false, issue_count: 0, issues: [] } }));
        }

        if (requestUrl.endsWith("/campaigns")) {
          return Promise.resolve(jsonResponse({ body: listedCampaigns }));
        }

        return Promise.resolve(jsonResponse({ body: [] }));
      }),
    );

    const { useCampaignDirectory } = await import("../app/CampaignDirectoryContext");
    const { AppShell } = await import("../app/AppShell");

    function CampaignDirectoryRefreshButton() {
      const { refreshCampaigns } = useCampaignDirectory();

      return (
        <button type="button" onClick={() => void refreshCampaigns()}>
          Refresh campaign directory
        </button>
      );
    }

    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <AppShell />,
          children: [{ index: true, element: <CampaignDirectoryRefreshButton /> }],
        },
      ],
      { initialEntries: ["/"] },
    );

    render(<RouterProvider router={router} />);

    await screen.findByRole("button", { name: "Refresh campaign directory" });
    listedCampaigns.push({
      id: "campaign-3",
      owner_id: "owner-1",
      name: "Sunken Archive",
      description: "",
      created_at: "2026-04-10T12:00:00Z",
      updated_at: "2026-04-10T12:00:00Z",
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh campaign directory" }));

    fireEvent.click(screen.getByRole("button", { name: "Select campaign" }));
    expect(await screen.findByRole("menuitem", { name: "Sunken Archive" })).toHaveAttribute("href", "/campaigns/campaign-3");
  });
});
