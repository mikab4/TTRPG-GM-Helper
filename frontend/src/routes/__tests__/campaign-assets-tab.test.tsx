import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UnsavedChangesProvider, useUnsavedChanges } from "../../app/UnsavedChangesContext";
import type { SourceAsset } from "../../types/assets";
import type { CampaignSession } from "../../types/sessions";
import type { CampaignWorkspaceContext } from "../CampaignWorkspacePage";

const mockUseOutletContext = vi.fn<() => CampaignWorkspaceContext>();
const listAssets = vi.fn<() => Promise<SourceAsset[]>>(() => Promise.resolve([]));
const listSessions = vi.fn<() => Promise<CampaignSession[]>>(() => Promise.resolve([]));
const getAsset = vi.fn<() => Promise<SourceAsset>>(() => Promise.resolve(uploadedAsset));
const createAsset = vi.fn<() => Promise<SourceAsset>>(() => Promise.resolve(uploadedAsset));
const createSession = vi.fn<() => Promise<CampaignSession>>(() => Promise.resolve(linkedSession));
const deleteAsset = vi.fn<() => Promise<void>>(() => Promise.resolve());

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

const uploadedImageAsset: SourceAsset = {
  ...uploadedAsset,
  id: "asset-image-1",
  mediaType: "image/png",
  originalFilename: "coastal-cave-map.png",
  sessionId: null,
  title: "Coastal Cave Map",
};

const deletingAsset: SourceAsset = {
  ...uploadedAsset,
  lifecycleStatus: "deleting",
};

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useOutletContext: () => mockUseOutletContext() };
});

vi.mock("../../api/assets", () => ({
  createAsset,
  deleteAsset,
  getAsset,
  listAssets,
}));

vi.mock("../../api/sessions", () => ({
  createSession,
  listSessions,
}));

const retryDraftStorageKey = (campaignId: string) => `gm-workspace:campaign-asset-upload-retry:v1:${campaignId}`;

function retryDraft(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    createdSessionId: "session-retry-1",
    newSessionLabel: "Blackreef Vault Infiltration",
    newSessionNumber: "5",
    newSessionPlayedOn: "2026-08-06",
    selectedSessionId: "new",
    title: "Recovered archive",
    truthStatus: "canonical",
    version: 1,
    ...overrides,
  };
}

function deferredValue<T>() {
  let reject: ((reason?: unknown) => void) | undefined;
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  if (!resolve || !reject) throw new Error("Deferred promise callbacks were not initialized.");
  return { promise, reject, resolve };
}

function DirtyStateProbe() {
  const { hasDirtyForms } = useUnsavedChanges();
  return <output data-testid="dirty-state">{String(hasDirtyForms)}</output>;
}

function campaignContext(campaignId = "campaign-1"): CampaignWorkspaceContext {
  return {
    campaign: {
      createdAt: "2026-08-06T00:00:00Z",
      description: "",
      id: campaignId,
      name: campaignId === "campaign-1" ? "The Shattered Coast" : "The Ember March",
      ownerId: "owner-1",
      updatedAt: "2026-08-06T00:00:00Z",
    },
  };
}

function renderAssetsTab(campaignId = "campaign-1") {
  mockUseOutletContext.mockReturnValue(campaignContext(campaignId));

  return import("../CampaignAssetsTab").then(({ CampaignAssetsTab }) => {
    const rendered = render(
      <UnsavedChangesProvider>
        <MemoryRouter>
          <CampaignAssetsTab />
          <DirtyStateProbe />
        </MemoryRouter>
      </UnsavedChangesProvider>,
    );
    return {
      ...rendered,
      rerenderForCampaign(nextCampaignId: string) {
        mockUseOutletContext.mockReturnValue(campaignContext(nextCampaignId));
        rendered.rerender(
          <UnsavedChangesProvider>
            <MemoryRouter>
              <CampaignAssetsTab />
              <DirtyStateProbe />
            </MemoryRouter>
          </UnsavedChangesProvider>,
        );
      },
    };
  });
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
    window.localStorage.clear();
    listAssets.mockResolvedValue([]);
    listSessions.mockResolvedValue([]);
    createAsset.mockResolvedValue(uploadedAsset);
    createSession.mockResolvedValue(linkedSession);
    deleteAsset.mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
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

  it("blocks a new-session upload before either API call when retry storage cannot be written", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    await renderAssetsTab();
    await screen.findByText("No assets match this view.");

    fireEvent.change(screen.getByLabelText("Choose asset file"), {
      target: { files: [new File(["notes"], "session-five.txt", { type: "text/plain" })] },
    });
    fireEvent.change(screen.getByLabelText("Display title"), { target: { value: "Session five recap" } });
    fireEvent.change(screen.getByLabelText("Link to session"), { target: { value: "new" } });
    fireEvent.change(screen.getByLabelText("Session title"), { target: { value: "Blackreef Vault Infiltration" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Save & Link Asset" }));

    expect(await screen.findByText(/unable to verify upload recovery storage/i)).toBeInTheDocument();
    expect(createSession).not.toHaveBeenCalled();
    expect(createAsset).not.toHaveBeenCalled();
    expect(screen.getByText("session-five.txt")).toBeInTheDocument();
    expect(screen.getByLabelText("Display title")).toHaveValue("Session five recap");
    expect(screen.getByLabelText("Session title")).toHaveValue("Blackreef Vault Infiltration");
    setItem.mockRestore();
  });

  it("blocks a new-session upload when retry storage was unreadable initially", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    await renderAssetsTab();
    await screen.findByText("No assets match this view.");

    fireEvent.change(screen.getByLabelText("Choose asset file"), {
      target: { files: [new File(["notes"], "session-five.txt", { type: "text/plain" })] },
    });
    fireEvent.change(screen.getByLabelText("Link to session"), { target: { value: "new" } });
    fireEvent.change(screen.getByLabelText("Session title"), { target: { value: "Blackreef Vault Infiltration" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Save & Link Asset" }));

    expect(await screen.findByText(/unable to verify upload recovery storage/i)).toBeInTheDocument();
    expect(createSession).not.toHaveBeenCalled();
    expect(createAsset).not.toHaveBeenCalled();
    expect(screen.getByText("session-five.txt")).toBeInTheDocument();
    expect(screen.getByLabelText("Session title")).toHaveValue("Blackreef Vault Infiltration");
    getItem.mockRestore();
  });

  it("allows an existing-session upload when retry storage is unavailable", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    listSessions.mockResolvedValue([linkedSession]);
    await renderAssetsTab();
    await screen.findByText("No assets match this view.");

    fireEvent.change(screen.getByLabelText("Choose asset file"), {
      target: { files: [new File(["notes"], "session-five.txt", { type: "text/plain" })] },
    });
    fireEvent.change(screen.getByLabelText("Link to session"), { target: { value: linkedSession.id } });
    fireEvent.click(screen.getByRole("button", { name: "+ Save & Link Asset" }));

    await waitFor(() => {
      expect(createAsset).toHaveBeenCalledWith("campaign-1", expect.objectContaining({ sessionId: linkedSession.id }));
    });
    expect(createSession).not.toHaveBeenCalled();
    getItem.mockRestore();
  });

  it("keeps the newer media-family view when an older post-upload refresh settles", async () => {
    const postUploadDocumentResponse = deferredValue<SourceAsset[]>();
    listAssets
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockImplementationOnce(() => postUploadDocumentResponse.promise)
      .mockResolvedValueOnce([uploadedImageAsset]);
    createAsset.mockResolvedValue(uploadedImageAsset);

    await renderAssetsTab();
    await screen.findByText("No assets match this view.");
    fireEvent.change(screen.getByLabelText("Asset family"), { target: { value: "document" } });
    await waitFor(() => {
      expect(listAssets).toHaveBeenLastCalledWith("campaign-1", expect.objectContaining({ mediaFamily: "document" }));
    });

    fireEvent.change(screen.getByLabelText("Choose asset file"), {
      target: { files: [new File(["map"], "coastal-cave-map.png", { type: "image/png" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "+ Save & Link Asset" }));
    await waitFor(() => {
      expect(listAssets).toHaveBeenCalledTimes(3);
      expect(listAssets).toHaveBeenLastCalledWith("campaign-1", expect.objectContaining({ mediaFamily: "document" }));
    });

    fireEvent.change(screen.getByLabelText("Asset family"), { target: { value: "image" } });
    expect(await screen.findByText("Coastal Cave Map")).toBeInTheDocument();

    postUploadDocumentResponse.resolve([]);
    await waitFor(() => {
      expect(screen.getByText("Coastal Cave Map")).toBeInTheDocument();
    });
  });

  it("clears completed upload state when the post-upload list refresh fails", async () => {
    listAssets.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("Library unavailable"));
    await renderAssetsTab();
    await screen.findByText("No assets match this view.");

    fireEvent.change(screen.getByLabelText("Choose asset file"), {
      target: { files: [new File(["map"], "coastal-cave-map.png", { type: "image/png" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "+ Save & Link Asset" }));

    expect(await screen.findByText(/uploaded successfully, but the library could not be refreshed/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add Assets to The Shattered Coast" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Save & Link Asset" })).not.toBeInTheDocument();
    expect(createAsset).toHaveBeenCalledTimes(1);
  });

  it("keeps cleanup recovery visible when refresh and retry-draft cleanup both fail", async () => {
    const originalRemoveItem = window.localStorage.removeItem.bind(window.localStorage);
    const retryStorageKey = retryDraftStorageKey("campaign-1");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem").mockImplementation((key) => {
      if (key === retryStorageKey) throw new Error("Storage cleanup unavailable");
      originalRemoveItem(key);
    });
    listAssets.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("Library unavailable"));
    await renderAssetsTab();
    await screen.findByText("No assets match this view.");

    fireEvent.change(screen.getByLabelText("Choose asset file"), {
      target: { files: [new File(["notes"], "session-five.txt", { type: "text/plain" })] },
    });
    fireEvent.change(screen.getByLabelText("Link to session"), { target: { value: "new" } });
    fireEvent.change(screen.getByLabelText("Session title"), { target: { value: "Blackreef Vault Infiltration" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Save & Link Asset" }));

    expect(await screen.findByRole("heading", { name: "Asset uploaded successfully" })).toBeInTheDocument();
    expect(screen.getByText(/saved recovery cleanup failed/i)).toBeInTheDocument();
    expect(listAssets).toHaveBeenCalledTimes(2);
    removeItem.mockRestore();
  });

  it("persists a complete retry draft before an asset upload failure", async () => {
    createAsset.mockRejectedValueOnce(new Error("Storage unavailable"));
    await renderAssetsTab();
    await screen.findByText("No assets match this view.");

    fireEvent.change(screen.getByLabelText("Choose asset file"), {
      target: { files: [new File(["notes"], "session-five.txt", { type: "text/plain" })] },
    });
    fireEvent.change(screen.getByLabelText("Link to session"), { target: { value: "new" } });
    fireEvent.change(screen.getByLabelText("Truth status"), { target: { value: "subjective" } });
    fireEvent.change(screen.getByLabelText("Session number"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Date played"), { target: { value: "2026-08-06" } });
    fireEvent.change(screen.getByLabelText("Session title"), { target: { value: "Blackreef Vault Infiltration" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Save & Link Asset" }));

    await waitFor(() => {
      expect(createAsset).toHaveBeenCalled();
    });
    expect(JSON.parse(window.localStorage.getItem(retryDraftStorageKey("campaign-1")) ?? "null")).toEqual({
      createdSessionId: "session-4",
      newSessionLabel: "Blackreef Vault Infiltration",
      newSessionNumber: "5",
      newSessionPlayedOn: "2026-08-06",
      selectedSessionId: "new",
      title: "session-five",
      truthStatus: "subjective",
      version: 1,
    });
    expect(createAsset).toHaveBeenCalledWith("campaign-1", expect.objectContaining({ sessionId: "session-4" }));
  });

  it("hydrates a campaign retry without restoring a file and reuses its created session", async () => {
    window.localStorage.setItem(retryDraftStorageKey("campaign-1"), JSON.stringify(retryDraft()));
    const firstRender = await renderAssetsTab();

    expect(await screen.findByText("Session created. Retrying will upload to this same session.")).toBeInTheDocument();
    expect(screen.getByLabelText("Display title")).toHaveValue("Recovered archive");
    expect(screen.getByLabelText("Choose asset file")).toHaveValue("");
    firstRender.unmount();

    await renderAssetsTab();
    await screen.findByText("Session created. Retrying will upload to this same session.");
    fireEvent.change(screen.getByLabelText("Choose asset file"), {
      target: { files: [new File(["retry"], "replacement.txt", { type: "text/plain" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "+ Save & Link Asset" }));

    await waitFor(() => {
      expect(createAsset).toHaveBeenCalled();
    });
    expect(createSession).not.toHaveBeenCalled();
    expect(createAsset).toHaveBeenCalledWith("campaign-1", expect.objectContaining({ sessionId: "session-retry-1" }));
  });

  it("does not render a campaign A retry while campaign B is active", async () => {
    window.localStorage.setItem(retryDraftStorageKey("campaign-1"), JSON.stringify(retryDraft()));
    const rendered = await renderAssetsTab();
    await screen.findByText("Session created. Retrying will upload to this same session.");

    rendered.rerenderForCampaign("campaign-2");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Add Assets to The Ember March" })).toBeInTheDocument();
    });
    expect(screen.queryByDisplayValue("Recovered archive")).not.toBeInTheDocument();
    expect(screen.queryByText("Session created. Retrying will upload to this same session.")).not.toBeInTheDocument();
  });

  it.each(["{invalid", JSON.stringify(retryDraft({ createdSessionId: " ", version: 2 }))])(
    "clears malformed retry storage and shows an ordinary upload form",
    async (storedDraft) => {
      const removeItem = vi.spyOn(Storage.prototype, "removeItem");
      window.localStorage.setItem(retryDraftStorageKey("campaign-1"), storedDraft);

      await renderAssetsTab();

      expect(await screen.findByRole("heading", { name: "Add Assets to The Shattered Coast" })).toBeInTheDocument();
      expect(screen.queryByDisplayValue("Recovered archive")).not.toBeInTheDocument();
      expect(removeItem).toHaveBeenCalledWith(retryDraftStorageKey("campaign-1"));
      removeItem.mockRestore();
    },
  );

  it("opens an asset from its row and keeps Edit beside Delete", async () => {
    listAssets.mockResolvedValue([uploadedAsset]);
    listSessions.mockResolvedValue([linkedSession]);
    await renderAssetsTab();

    expect(await screen.findByText("Session 04 — The Sunken Archive")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "All types (1)" })).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText("Canon")).toBeInTheDocument();
    expect(screen.getByText("Session 4 — The Sunken Archive")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Session 04 — The Sunken Archive" })).toHaveAttribute(
      "href",
      "/campaigns/campaign-1/assets/asset-1",
    );
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/campaigns/campaign-1/assets/asset-1/edit");
    expect(screen.queryByRole("link", { name: "View" })).not.toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Delete Asset" })).toBeInTheDocument();
  });

  it.each(["available", "missing"] as const)(
    "keeps a deleting %s asset visibly transitional and read-only in the list and detail",
    async (storageStatus) => {
      const deletingAssetWithStorage = { ...deletingAsset, storageStatus };
      listAssets.mockResolvedValue([deletingAssetWithStorage]);
      getAsset.mockResolvedValue(deletingAssetWithStorage);
      listSessions.mockResolvedValue([linkedSession]);

      await renderAssetsTab();

      expect(await screen.findByText("Deletion in progress")).toBeInTheDocument();
      expect(screen.queryByText("Linked & Verified")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
      expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
      expect(screen.getByText("Edit")).toHaveAttribute("aria-disabled", "true");

      await renderAssetDetailPage();

      expect(await screen.findByText("Deletion in progress")).toBeInTheDocument();
      expect(screen.queryByText("Linked & Verified")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Delete Asset" })).toBeDisabled();
      expect(screen.queryByRole("link", { name: /Edit Metadata/ })).not.toBeInTheDocument();
      expect(screen.getByText(/Edit Metadata/)).toHaveAttribute("aria-disabled", "true");
    },
  );

  it("renders the direct-edit deleting state without loading sessions", async () => {
    getAsset.mockResolvedValue(deletingAsset);
    listSessions.mockRejectedValue(new Error("Sessions unavailable"));

    await renderAssetEditPage();

    expect(await screen.findByText("Deletion in progress")).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(listSessions).not.toHaveBeenCalled();
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
