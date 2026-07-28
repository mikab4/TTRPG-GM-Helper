import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => {
  const reactRouterDom = await importOriginal<typeof import("react-router-dom")>();
  return { ...reactRouterDom, useNavigate: () => navigateMock };
});

type MockJsonResponse = {
  body?: unknown;
  ok: boolean;
  status?: number;
};

const campaign = {
  id: "campaign-1",
  owner_id: "owner-1",
  name: "Shadows of Glass",
  description: "Urban intrigue campaign",
  created_at: "2026-04-08T12:00:00Z",
  updated_at: "2026-04-08T12:00:00Z",
};

function jsonResponse({ body, ok, status = 200 }: MockJsonResponse): Response {
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

function installCampaignApiMock() {
  const fetchSpy = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = getRequestUrl(input);

    if (requestUrl.endsWith("/compatibility/entity-types")) {
      return Promise.resolve(jsonResponse({ body: { has_issues: false, issue_count: 0, issues: [] }, ok: true }));
    }

    if (requestUrl.endsWith("/campaigns/campaign-1") && init?.method === "DELETE") {
      return Promise.resolve(jsonResponse({ ok: true, status: 204 }));
    }

    if (requestUrl.endsWith("/campaigns/campaign-1")) {
      return Promise.resolve(jsonResponse({ body: campaign, ok: true }));
    }

    if (requestUrl.endsWith("/campaigns")) {
      return Promise.resolve(jsonResponse({ body: [campaign], ok: true }));
    }

    return Promise.resolve(jsonResponse({ body: [], ok: true }));
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

describe("campaign delete route integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
    navigateMock.mockReset();
  });

  it("removes the registry row after a confirmed successful deletion", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    installCampaignApiMock();
    const { routes } = await import("../app/routes");
    const router = createMemoryRouter(routes, { initialEntries: ["/campaigns"] });

    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete Shadows of Glass" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete campaign" }));

    await waitFor(() => {
      expect(screen.queryByText("Shadows of Glass")).not.toBeInTheDocument();
    });
  });

  it("navigates to the registry after a confirmed overview deletion", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
    installCampaignApiMock();
    const { routes } = await import("../app/routes");
    const router = createMemoryRouter(routes, { initialEntries: ["/campaigns/campaign-1"] });

    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete Campaign" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete campaign" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/campaigns");
    });
  });
});
