import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Outlet, RouterProvider, createMemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UnsavedChangesProvider } from "../../app/UnsavedChangesContext";
import { UnsavedChangesGuard } from "../../app/UnsavedChangesGuard";
import type { SourceAsset } from "../../types/assets";
import type { CampaignSession } from "../../types/sessions";
import type { CampaignWorkspaceContext } from "../CampaignWorkspacePage";
import { AssetDetailPage } from "../AssetDetailPage";
import { AssetEditPage } from "../AssetEditPage";
import { SessionDetailPage } from "../SessionDetailPage";
import { SessionFormPage } from "../SessionFormPage";

const mockUseOutletContext = vi.fn<() => CampaignWorkspaceContext>();
const apiMocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  deleteAsset: vi.fn(),
  deleteSession: vi.fn(),
  getAsset: vi.fn(),
  getSession: vi.fn(),
  listAssets: vi.fn(),
  listSessions: vi.fn(),
  updateAsset: vi.fn(),
  updateSession: vi.fn(),
}));

const {
  createSession,
  deleteAsset,
  deleteSession,
  getAsset,
  getSession,
  listAssets,
  listSessions,
  updateAsset,
  updateSession,
} = apiMocks;

const campaignSession: CampaignSession = {
  campaignId: "campaign-1",
  createdAt: "2026-08-06T00:00:00Z",
  id: "session-4",
  playedOn: "2026-08-04",
  sessionLabel: "The Sunken Archive",
  sessionNumber: 4,
  summary: "The party recovered the drowned atlas.",
  updatedAt: "2026-08-06T00:00:00Z",
};

const sourceAsset: SourceAsset = {
  campaignId: "campaign-1",
  createdAt: "2026-08-06T00:00:00Z",
  fileSizeBytes: 1200,
  id: "asset-1",
  lifecycleStatus: "active",
  mediaType: "application/pdf",
  metadata: {},
  originalFilename: "sunken-archive.pdf",
  sessionId: "session-4",
  storageStatus: "available",
  title: "Recovered archive",
  truthStatus: "canonical",
  updatedAt: "2026-08-06T00:00:00Z",
};

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useOutletContext: () => mockUseOutletContext() };
});

vi.mock("../../api/sessions", () => ({
  createSession: apiMocks.createSession,
  deleteSession: apiMocks.deleteSession,
  getSession: apiMocks.getSession,
  listSessions: apiMocks.listSessions,
  updateSession: apiMocks.updateSession,
}));

vi.mock("../../api/assets", () => ({
  deleteAsset: apiMocks.deleteAsset,
  getAsset: apiMocks.getAsset,
  listAssets: apiMocks.listAssets,
  updateAsset: apiMocks.updateAsset,
}));

function GuardedLayout() {
  return (
    <UnsavedChangesProvider>
      <UnsavedChangesGuard />
      <Outlet />
    </UnsavedChangesProvider>
  );
}

function renderRoute(initialEntry: string, children: Parameters<typeof createMemoryRouter>[0]) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <GuardedLayout />,
        children,
      },
    ],
    { initialEntries: [initialEntry] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("campaign session and asset CRUD routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a campaign-scoped session and opens its detail route", async () => {
    mockUseOutletContext.mockReturnValue({ campaign: campaignContext() });
    createSession.mockResolvedValue(campaignSession);
    const router = renderRoute("/campaigns/campaign-1/sessions/new", [
      { path: "campaigns/:campaignId/sessions/new", element: <SessionFormPage mode="create" /> },
      { path: "campaigns/:campaignId/sessions/:sessionId", element: <p>Session saved</p> },
    ]);

    fireEvent.change(await screen.findByLabelText("Session number"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Session title"), { target: { value: "The Sunken Archive" } });
    fireEvent.change(screen.getByLabelText("Date played"), { target: { value: "2026-08-04" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Session" }));

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledWith("campaign-1", {
        playedOn: "2026-08-04",
        sessionLabel: "The Sunken Archive",
        sessionNumber: 4,
        summary: null,
      });
    });
    expect(await screen.findByText("Session saved")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/campaigns/campaign-1/sessions/session-4");
  });

  it("rejects a malformed session number while creating a titled session", async () => {
    mockUseOutletContext.mockReturnValue({ campaign: campaignContext() });
    const router = renderRoute("/campaigns/campaign-1/sessions/new", [
      { path: "campaigns/:campaignId/sessions/new", element: <SessionFormPage mode="create" /> },
      { path: "campaigns/:campaignId/sessions/:sessionId", element: <p>Session saved</p> },
    ]);

    fireEvent.change(await screen.findByLabelText("Session number"), { target: { value: "five" } });
    fireEvent.change(screen.getByLabelText("Session title"), { target: { value: "The Sunken Archive" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Session" }));

    expect(await screen.findByText("Enter a whole-number session number.")).toBeInTheDocument();
    expect(screen.getByLabelText("Session number")).toHaveValue("five");
    expect(screen.getByLabelText("Session title")).toHaveValue("The Sunken Archive");
    expect(createSession).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/campaigns/campaign-1/sessions/new");
  });

  it("creates a titled session with a whitespace-only session number as null", async () => {
    mockUseOutletContext.mockReturnValue({ campaign: campaignContext() });
    createSession.mockResolvedValue(campaignSession);
    const router = renderRoute("/campaigns/campaign-1/sessions/new", [
      { path: "campaigns/:campaignId/sessions/new", element: <SessionFormPage mode="create" /> },
      { path: "campaigns/:campaignId/sessions/:sessionId", element: <p>Session saved</p> },
    ]);

    fireEvent.change(await screen.findByLabelText("Session number"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("Session title"), { target: { value: "The Sunken Archive" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Session" }));

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledWith("campaign-1", {
        playedOn: null,
        sessionLabel: "The Sunken Archive",
        sessionNumber: null,
        summary: null,
      });
    });
    expect(await screen.findByText("Session saved")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/campaigns/campaign-1/sessions/session-4");
  });

  it("updates a campaign-scoped session and clears its unsaved-change guard before navigation", async () => {
    mockUseOutletContext.mockReturnValue({ campaign: campaignContext() });
    getSession.mockResolvedValue(campaignSession);
    updateSession.mockResolvedValue({ ...campaignSession, summary: "Updated recap." });
    const router = renderRoute("/campaigns/campaign-1/sessions/session-4/edit", [
      { path: "campaigns/:campaignId/sessions/:sessionId/edit", element: <SessionFormPage mode="edit" /> },
      { path: "campaigns/:campaignId/sessions/:sessionId", element: <p>Session updated</p> },
    ]);

    fireEvent.change(await screen.findByLabelText("Public player summary / recap"), {
      target: { value: "Updated recap." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Session" }));

    await waitFor(() => {
      expect(getSession).toHaveBeenCalledWith("campaign-1", "session-4", expect.any(Object));
      expect(updateSession).toHaveBeenCalledWith("campaign-1", "session-4", {
        playedOn: "2026-08-04",
        sessionLabel: "The Sunken Archive",
        sessionNumber: 4,
        summary: "Updated recap.",
      });
    });
    expect(await screen.findByText("Session updated")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/campaigns/campaign-1/sessions/session-4");
  });

  it("rejects a malformed session number while editing a titled session", async () => {
    mockUseOutletContext.mockReturnValue({ campaign: campaignContext() });
    getSession.mockResolvedValue(campaignSession);
    const router = renderRoute("/campaigns/campaign-1/sessions/session-4/edit", [
      { path: "campaigns/:campaignId/sessions/:sessionId/edit", element: <SessionFormPage mode="edit" /> },
      { path: "campaigns/:campaignId/sessions/:sessionId", element: <p>Session updated</p> },
    ]);

    fireEvent.change(await screen.findByLabelText("Session number"), { target: { value: "five" } });
    fireEvent.change(screen.getByLabelText("Session title"), { target: { value: "The Sunken Archive revised" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Session" }));

    expect(await screen.findByText("Enter a whole-number session number.")).toBeInTheDocument();
    expect(screen.getByLabelText("Session number")).toHaveValue("five");
    expect(screen.getByLabelText("Session title")).toHaveValue("The Sunken Archive revised");
    expect(updateSession).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/campaigns/campaign-1/sessions/session-4/edit");
  });

  it("blocks navigation away from a dirty session form", async () => {
    mockUseOutletContext.mockReturnValue({ campaign: campaignContext() });
    const router = renderRoute("/campaigns/campaign-1/sessions/new", [
      { path: "campaigns/:campaignId/sessions/new", element: <SessionFormPage mode="create" /> },
      { path: "campaigns/:campaignId/sessions", element: <p>Sessions list</p> },
    ]);

    fireEvent.change(await screen.findByLabelText("Session title"), { target: { value: "Unfinished recap" } });
    fireEvent.click(screen.getByRole("link", { name: "Cancel" }));

    expect(await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/campaigns/campaign-1/sessions/new");
  });

  it("reads linked assets within the campaign-scoped session detail and deletes the session", async () => {
    mockUseOutletContext.mockReturnValue({ campaign: campaignContext() });
    getSession.mockResolvedValue(campaignSession);
    listAssets.mockResolvedValue([sourceAsset]);
    deleteSession.mockResolvedValue(undefined);
    const router = renderRoute("/campaigns/campaign-1/sessions/session-4", [
      { path: "campaigns/:campaignId/sessions/:sessionId", element: <SessionDetailPage /> },
      { path: "campaigns/:campaignId/sessions", element: <p>Sessions list</p> },
    ]);

    expect(await screen.findByRole("link", { name: "Recovered archive" })).toHaveAttribute(
      "href",
      "/campaigns/campaign-1/assets/asset-1",
    );
    expect(getSession).toHaveBeenCalledWith("campaign-1", "session-4", expect.any(Object));
    expect(listAssets).toHaveBeenCalledWith("campaign-1", expect.any(Object));

    fireEvent.click(screen.getByRole("button", { name: "Delete session" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteSession).toHaveBeenCalledWith("campaign-1", "session-4");
    });
    expect(await screen.findByText("Sessions list")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/campaigns/campaign-1/sessions");
  });

  it("updates campaign-scoped asset metadata and clears its unsaved-change guard before navigation", async () => {
    mockUseOutletContext.mockReturnValue({ campaign: campaignContext() });
    getAsset.mockResolvedValue(sourceAsset);
    listSessions.mockResolvedValue([campaignSession]);
    updateAsset.mockResolvedValue({ ...sourceAsset, title: "Annotated archive" });
    const router = renderRoute("/campaigns/campaign-1/assets/asset-1/edit", [
      { path: "campaigns/:campaignId/assets/:assetId/edit", element: <AssetEditPage /> },
      { path: "campaigns/:campaignId/assets/:assetId", element: <p>Asset updated</p> },
    ]);

    fireEvent.change(await screen.findByLabelText("Display title"), { target: { value: "Annotated archive" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Asset" }));

    await waitFor(() => {
      expect(getAsset).toHaveBeenCalledWith("campaign-1", "asset-1", expect.any(Object));
      expect(listSessions).toHaveBeenCalledWith("campaign-1", expect.any(Object));
      expect(updateAsset).toHaveBeenCalledWith("campaign-1", "asset-1", {
        sessionId: "session-4",
        title: "Annotated archive",
        truthStatus: "canonical",
      });
    });
    expect(await screen.findByText("Asset updated")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/campaigns/campaign-1/assets/asset-1");
  });

  it("blocks navigation away from a dirty asset metadata form", async () => {
    mockUseOutletContext.mockReturnValue({ campaign: campaignContext() });
    getAsset.mockResolvedValue(sourceAsset);
    listSessions.mockResolvedValue([campaignSession]);
    const router = renderRoute("/campaigns/campaign-1/assets/asset-1/edit", [
      { path: "campaigns/:campaignId/assets/:assetId/edit", element: <AssetEditPage /> },
      { path: "campaigns/:campaignId/assets/:assetId", element: <p>Asset detail</p> },
    ]);

    fireEvent.change(await screen.findByLabelText("Display title"), { target: { value: "Unfinished archive" } });
    fireEvent.click(screen.getByRole("link", { name: "Back To Asset" }));

    expect(await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/campaigns/campaign-1/assets/asset-1/edit");
  });

  it("deletes an asset through its campaign-scoped detail route", async () => {
    mockUseOutletContext.mockReturnValue({ campaign: campaignContext() });
    getAsset.mockResolvedValue(sourceAsset);
    listSessions.mockResolvedValue([campaignSession]);
    deleteAsset.mockResolvedValue(undefined);
    const router = renderRoute("/campaigns/campaign-1/assets/asset-1", [
      { path: "campaigns/:campaignId/assets/:assetId", element: <AssetDetailPage /> },
      { path: "campaigns/:campaignId/assets", element: <p>Assets list</p> },
    ]);

    fireEvent.click(await screen.findByRole("button", { name: "Delete Asset" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteAsset).toHaveBeenCalledWith("campaign-1", "asset-1");
    });
    expect(await screen.findByText("Assets list")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/campaigns/campaign-1/assets");
  });
});

function campaignContext(): CampaignWorkspaceContext["campaign"] {
  return {
    createdAt: "2026-08-06T00:00:00Z",
    description: "",
    id: "campaign-1",
    name: "The Shattered Coast",
    ownerId: "owner-1",
    updatedAt: "2026-08-06T00:00:00Z",
  };
}
