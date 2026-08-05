import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UnsavedChangesProvider } from "../../app/UnsavedChangesContext";
import type { SourceAsset } from "../../types/assets";
import type { CampaignSession } from "../../types/sessions";
import type { CampaignWorkspaceContext } from "../CampaignWorkspacePage";

const mockUseOutletContext = vi.fn<() => CampaignWorkspaceContext>();
const listAssets = vi.fn<() => Promise<SourceAsset[]>>(() => Promise.resolve([]));
const listSessions = vi.fn<() => Promise<CampaignSession[]>>(() => Promise.resolve([]));
const getAsset = vi.fn<() => Promise<SourceAsset>>(() => Promise.resolve(uploadedAsset));
const createAsset = vi.fn<() => Promise<SourceAsset>>(() => Promise.resolve(uploadedAsset));
const createSession = vi.fn<() => Promise<CampaignSession>>(() => Promise.resolve(linkedSession));

const uploadedAsset: SourceAsset = {
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
  title: "Session 04 — The Sunken Archive",
  truthStatus: "canonical",
  updatedAt: "2026-08-06T00:00:00Z",
};

const linkedSession: CampaignSession = {
  campaignId: "campaign-1",
  createdAt: "2026-08-06T00:00:00Z",
  id: "session-4",
  playedOn: "2026-08-04",
  sessionLabel: "The Sunken Archive",
  sessionNumber: 4,
  summary: null,
  updatedAt: "2026-08-06T00:00:00Z",
};

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useOutletContext: () => mockUseOutletContext() };
});

vi.mock("../../api/assets", () => ({
  createAsset,
  deleteAsset: vi.fn(),
  getAsset,
  listAssets,
}));

vi.mock("../../api/sessions", () => ({
  createSession,
  listSessions,
}));

function renderAssetsTab() {
  mockUseOutletContext.mockReturnValue({
    campaign: {
      createdAt: "2026-08-06T00:00:00Z",
      description: "",
      id: "campaign-1",
      name: "The Shattered Coast",
      ownerId: "owner-1",
      updatedAt: "2026-08-06T00:00:00Z",
    },
  });

  return import("../CampaignAssetsTab").then(({ CampaignAssetsTab }) =>
    render(
      <UnsavedChangesProvider>
        <MemoryRouter>
          <CampaignAssetsTab />
        </MemoryRouter>
      </UnsavedChangesProvider>,
    ),
  );
}

function renderAssetDetailPage() {
  mockUseOutletContext.mockReturnValue({
    campaign: {
      createdAt: "2026-08-06T00:00:00Z",
      description: "",
      id: "campaign-1",
      name: "The Shattered Coast",
      ownerId: "owner-1",
      updatedAt: "2026-08-06T00:00:00Z",
    },
  });

  return import("../AssetDetailPage").then(({ AssetDetailPage }) =>
    render(
      <MemoryRouter initialEntries={["/campaigns/campaign-1/assets/asset-1"]}>
        <Routes>
          <Route path="/campaigns/:campaignId/assets/:assetId" element={<AssetDetailPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
}

function renderAssetEditPage() {
  mockUseOutletContext.mockReturnValue({
    campaign: {
      createdAt: "2026-08-06T00:00:00Z",
      description: "",
      id: "campaign-1",
      name: "The Shattered Coast",
      ownerId: "owner-1",
      updatedAt: "2026-08-06T00:00:00Z",
    },
  });

  return import("../AssetEditPage").then(({ AssetEditPage }) =>
    render(
      <StrictMode>
        <UnsavedChangesProvider>
          <MemoryRouter initialEntries={["/campaigns/campaign-1/assets/asset-1/edit"]}>
            <Routes>
              <Route path="/campaigns/:campaignId/assets/:assetId/edit" element={<AssetEditPage />} />
            </Routes>
          </MemoryRouter>
        </UnsavedChangesProvider>
      </StrictMode>,
    ),
  );
}

describe("CampaignAssetsTab", () => {
  beforeEach(() => {
    listAssets.mockResolvedValue([]);
    listSessions.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("replaces the drop zone with the metadata configuration after a file is selected", async () => {
    await renderAssetsTab();
    await screen.findByText("No assets match this view.");

    expect(screen.getByRole("heading", { name: "Add Assets to The Shattered Coast" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Configure Asset Metadata" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Display title")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Choose asset file"), {
      target: { files: [new File(["map"], "Coastal_Cave_Map.pdf", { type: "application/pdf" })] },
    });

    expect(screen.queryByRole("heading", { name: "Add Assets to The Shattered Coast" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Configure Asset Metadata" })).toBeInTheDocument();
    expect(screen.getByLabelText("Display title")).toHaveValue("Coastal Cave Map");
    expect(screen.getByLabelText("Truth status")).toBeInTheDocument();
    expect(screen.getByLabelText("Link to session")).toBeInTheDocument();
  });

  it("restores the drop zone when metadata configuration is cancelled", async () => {
    await renderAssetsTab();
    await screen.findByText("No assets match this view.");

    fireEvent.change(screen.getByLabelText("Choose asset file"), {
      target: { files: [new File(["map"], "Coastal_Cave_Map.pdf", { type: "application/pdf" })] },
    });

    expect(screen.getByRole("heading", { name: "Configure Asset Metadata" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Add Assets to The Shattered Coast" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: "Configure Asset Metadata" })).not.toBeInTheDocument();
  });

  it("creates a numbered and dated session before uploading its linked asset", async () => {
    await renderAssetsTab();
    await screen.findByText("No assets match this view.");
    fireEvent.change(screen.getByLabelText("Choose asset file"), {
      target: { files: [new File(["notes"], "session-five.txt", { type: "text/plain" })] },
    });
    fireEvent.change(screen.getByLabelText("Link to session"), { target: { value: "new" } });
    fireEvent.change(screen.getByLabelText("Session number"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Date played"), { target: { value: "2026-08-06" } });
    fireEvent.change(screen.getByLabelText("Session title"), { target: { value: "Blackreef Vault Infiltration" } });

    fireEvent.click(screen.getByRole("button", { name: "+ Save & Link Asset" }));

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledWith("campaign-1", {
        playedOn: "2026-08-06",
        sessionLabel: "Blackreef Vault Infiltration",
        sessionNumber: 5,
        summary: null,
      });
    });
  });

  it("renders the library row with the mockup metadata treatment and the retained delete action", async () => {
    listAssets.mockResolvedValue([uploadedAsset]);
    listSessions.mockResolvedValue([linkedSession]);
    await renderAssetsTab();

    expect(await screen.findByText("Session 04 — The Sunken Archive")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "All types (1)" })).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText("Canon")).toBeInTheDocument();
    expect(screen.getByText("Session 4 — The Sunken Archive")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("renders asset detail with mockup metadata and a numbered linked session", async () => {
    getAsset.mockResolvedValue(uploadedAsset);
    listSessions.mockResolvedValue([linkedSession]);
    await renderAssetDetailPage();

    expect(await screen.findByText("Asset Overview & Metadata")).toBeInTheDocument();
    expect(screen.getByText("File Format:")).toBeInTheDocument();
    expect(screen.getByText("PDF Document")).toBeInTheDocument();
    expect(screen.getByText("File Size:")).toBeInTheDocument();
    expect(screen.getByText("Status:")).toBeInTheDocument();
    expect(screen.getByText("Linked Session")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Session 4 — The Sunken Archive/ })).toBeInTheDocument();
  });

  it("does not show an unavailable error when the initial asset-edit request is aborted during navigation cleanup", async () => {
    getAsset
      .mockRejectedValueOnce(new DOMException("Signal is aborted without reason", "AbortError"))
      .mockResolvedValueOnce(uploadedAsset);
    listSessions.mockResolvedValue([linkedSession]);
    await renderAssetEditPage();

    expect(await screen.findByLabelText("Display title")).toHaveValue("Session 04 — The Sunken Archive");
    expect(screen.queryByText("Asset unavailable")).not.toBeInTheDocument();
  });
});
