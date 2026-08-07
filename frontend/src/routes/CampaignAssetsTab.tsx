import { Link, useOutletContext } from "react-router-dom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type SyntheticEvent,
} from "react";

import { createAsset, deleteAsset, getAsset, listAssets } from "../api/assets";
import { createSession, listSessions } from "../api/sessions";
import { useUnsavedChanges } from "../app/UnsavedChangesContext";
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";
import { RequestStateBlock } from "../components/RequestStateBlock";
import { SectionPanel } from "../components/SectionPanel";
import { getAssetStatusPresentation } from "../assets/presentation";
import type { SourceAsset, SourceAssetMediaFamily, SourceAssetTruthStatus } from "../types/assets";
import type { CampaignSession } from "../types/sessions";
import { formatLinkedSessionName } from "./CampaignSessionsTab";
import type { CampaignWorkspaceContext } from "./CampaignWorkspacePage";

type AssetsState = { status: "loading" } | { message: string; status: "error" } | { assets: SourceAsset[]; status: "ready" };

type AssetUploadRetryDraft = {
  version: 1;
  createdSessionId: string;
  selectedSessionId: "new";
  title: string;
  truthStatus: SourceAssetTruthStatus;
  newSessionLabel: string;
  newSessionNumber: string;
  newSessionPlayedOn: string;
};

type UploadRecoveryStatus = "ordinary" | "durable-retry" | "non-durable-retry" | "upload-succeeded-cleanup-failed";

type RetryDraftReadResult = { draft: AssetUploadRetryDraft | null; storageAvailable: boolean };

type AssetListScope = { campaignId: string; mediaFamily: SourceAssetMediaFamily | "" };

type AssetListRequestOutcome = { status: "applied" | "stale" } | { message: string; status: "error" };

type AssetListRequest = AssetListScope & { abortController: AbortController; generation: number };

const retryDraftStorageKey = (campaignId: string) => `gm-workspace:campaign-asset-upload-retry:v1:${campaignId}`;

function isSourceAssetTruthStatus(value: unknown): value is SourceAssetTruthStatus {
  return value === "canonical" || value === "subjective" || value === "uncertain";
}

function validateRetryDraft(value: unknown): AssetUploadRetryDraft | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    typeof candidate.createdSessionId !== "string" ||
    !candidate.createdSessionId.trim() ||
    candidate.selectedSessionId !== "new" ||
    typeof candidate.title !== "string" ||
    !isSourceAssetTruthStatus(candidate.truthStatus) ||
    typeof candidate.newSessionLabel !== "string" ||
    typeof candidate.newSessionNumber !== "string" ||
    typeof candidate.newSessionPlayedOn !== "string"
  ) {
    return null;
  }

  return {
    createdSessionId: candidate.createdSessionId,
    newSessionLabel: candidate.newSessionLabel,
    newSessionNumber: candidate.newSessionNumber,
    newSessionPlayedOn: candidate.newSessionPlayedOn,
    selectedSessionId: "new",
    title: candidate.title,
    truthStatus: candidate.truthStatus,
    version: 1,
  };
}

function removeRetryDraft(storageKey: string): boolean {
  try {
    window.localStorage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
}

function readRetryDraft(campaignId: string): RetryDraftReadResult {
  const storageKey = retryDraftStorageKey(campaignId);
  let serializedDraft: string | null;
  try {
    serializedDraft = window.localStorage.getItem(storageKey);
  } catch {
    return { draft: null, storageAvailable: false };
  }
  if (serializedDraft === null) return { draft: null, storageAvailable: true };

  try {
    const draft = validateRetryDraft(JSON.parse(serializedDraft));
    if (draft) return { draft, storageAvailable: true };
  } catch {
    // Invalid records are removed below, leaving this campaign in the ordinary state.
  }

  removeRetryDraft(storageKey);
  return { draft: null, storageAvailable: true };
}

function writeRetryDraft(campaignId: string, draft: AssetUploadRetryDraft): boolean {
  const whitelistedDraft: AssetUploadRetryDraft = {
    createdSessionId: draft.createdSessionId,
    newSessionLabel: draft.newSessionLabel,
    newSessionNumber: draft.newSessionNumber,
    newSessionPlayedOn: draft.newSessionPlayedOn,
    selectedSessionId: "new",
    title: draft.title,
    truthStatus: draft.truthStatus,
    version: 1,
  };
  try {
    window.localStorage.setItem(retryDraftStorageKey(campaignId), JSON.stringify(whitelistedDraft));
    return true;
  } catch {
    return false;
  }
}

function canWriteRetryDraft(campaignId: string): boolean {
  const probeStorageKey = `${retryDraftStorageKey(campaignId)}:probe`;
  try {
    window.localStorage.setItem(probeStorageKey, "1");
    window.localStorage.removeItem(probeStorageKey);
    return true;
  } catch {
    return false;
  }
}

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024
    ? `${String(Math.max(1, Math.round(bytes / 1024)))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function assetTypeLabel(mediaType: string) {
  if (mediaType === "application/pdf") return "PDF";
  if (mediaType.includes("spreadsheet") || mediaType === "text/csv") return "XLS";
  if (mediaType === "image/jpeg") return "JPG";
  if (mediaType === "image/png") return "PNG";
  return mediaType.split("/").at(-1)?.toUpperCase() ?? "FILE";
}

function assetFileTypeClass(mediaType: string) {
  if (mediaType === "application/pdf") return "asset-file-pdf";
  if (mediaType.includes("spreadsheet") || mediaType === "text/csv") return "asset-file-spreadsheet";
  if (mediaType.startsWith("image/")) return "asset-file-image";
  return "asset-file-default";
}

function truthStatusLabel(truthStatus: SourceAssetTruthStatus) {
  if (truthStatus === "canonical") return "Canon";
  if (truthStatus === "subjective") return "Rumor";
  return "Reference";
}

function defaultAssetTitle(filename: string) {
  return filename.replace(/\.[^/.]+$/, "").replaceAll("_", " ");
}

function hasSameAssetListScope(firstScope: AssetListScope, secondScope: AssetListScope) {
  return firstScope.campaignId === secondScope.campaignId && firstScope.mediaFamily === secondScope.mediaFamily;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function CampaignAssetsTab() {
  const { campaign } = useOutletContext<CampaignWorkspaceContext>();
  const { registerForm } = useUnsavedChanges();
  const registrationRef = useRef<ReturnType<typeof registerForm> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeAssetListScopeRef = useRef<AssetListScope>({ campaignId: campaign.id, mediaFamily: "" });
  const assetListRequestRef = useRef<AssetListRequest | null>(null);
  const assetListRequestGenerationRef = useRef(0);
  const [pageState, setPageState] = useState<AssetsState>({ status: "loading" });
  const [sessions, setSessions] = useState<CampaignSession[]>([]);
  const [mediaFamily, setMediaFamily] = useState<SourceAssetMediaFamily | "">("");
  const [search, setSearch] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [truthStatus, setTruthStatus] = useState<SourceAssetTruthStatus>("uncertain");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [newSessionLabel, setNewSessionLabel] = useState("");
  const [newSessionNumber, setNewSessionNumber] = useState("");
  const [newSessionPlayedOn, setNewSessionPlayedOn] = useState("");
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [retryStorageReadable, setRetryStorageReadable] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState<UploadRecoveryStatus>("ordinary");
  const [recoveryCampaignId, setRecoveryCampaignId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<SourceAsset | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletionRecoveryMessage, setDeletionRecoveryMessage] = useState<string | null>(null);
  const [uncertainAssetIds, setUncertainAssetIds] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  activeAssetListScopeRef.current = { campaignId: campaign.id, mediaFamily };
  const requestAssetList = useCallback(async (requestedScope: AssetListScope): Promise<AssetListRequestOutcome> => {
    assetListRequestRef.current?.abortController.abort();
    const assetListRequest: AssetListRequest = {
      ...requestedScope,
      abortController: new AbortController(),
      generation: assetListRequestGenerationRef.current + 1,
    };
    assetListRequestGenerationRef.current = assetListRequest.generation;
    assetListRequestRef.current = assetListRequest;

    try {
      const assets = await listAssets(requestedScope.campaignId, {
        mediaFamily: requestedScope.mediaFamily || undefined,
        signal: assetListRequest.abortController.signal,
      });
      if (
        assetListRequestGenerationRef.current !== assetListRequest.generation ||
        !hasSameAssetListScope(activeAssetListScopeRef.current, requestedScope)
      ) {
        return { status: "stale" };
      }
      setPageState({ assets, status: "ready" });
      return { status: "applied" };
    } catch (error) {
      if (
        isAbortError(error) ||
        assetListRequestGenerationRef.current !== assetListRequest.generation ||
        !hasSameAssetListScope(activeAssetListScopeRef.current, requestedScope)
      ) {
        return { status: "stale" };
      }
      return { message: error instanceof Error ? error.message : "Unable to load assets.", status: "error" };
    }
  }, []);
  useEffect(() => {
    const registration = registerForm();
    registrationRef.current = registration;
    return registration.unregister;
  }, [registerForm]);
  useLayoutEffect(() => {
    const { draft, storageAvailable } = readRetryDraft(campaign.id);

    setFile(null);
    setTitle(draft?.title ?? "");
    setTruthStatus(draft?.truthStatus ?? "uncertain");
    setSelectedSessionId(draft?.selectedSessionId ?? "");
    setNewSessionLabel(draft?.newSessionLabel ?? "");
    setNewSessionNumber(draft?.newSessionNumber ?? "");
    setNewSessionPlayedOn(draft?.newSessionPlayedOn ?? "");
    setCreatedSessionId(draft?.createdSessionId ?? null);
    setRetryStorageReadable(storageAvailable);
    setRecoveryStatus(draft ? "durable-retry" : "ordinary");
    setRecoveryCampaignId(draft ? campaign.id : null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [campaign.id]);
  useLayoutEffect(() => {
    setPageState({ status: "loading" });
  }, [campaign.id, mediaFamily]);
  useEffect(() => {
    const hasOrdinaryEdits = Boolean(
      title || selectedSessionId || newSessionLabel || newSessionNumber || newSessionPlayedOn || truthStatus !== "uncertain",
    );
    registrationRef.current?.setDirty(
      Boolean(file) ||
        recoveryStatus === "non-durable-retry" ||
        recoveryStatus === "upload-succeeded-cleanup-failed" ||
        (recoveryStatus === "ordinary" && hasOrdinaryEdits),
    );
  }, [file, newSessionLabel, newSessionNumber, newSessionPlayedOn, recoveryStatus, selectedSessionId, title, truthStatus]);
  useEffect(() => {
    const requestedScope: AssetListScope = { campaignId: campaign.id, mediaFamily };
    const sessionsAbortController = new AbortController();
    void Promise.all([
      requestAssetList(requestedScope),
      listSessions(campaign.id, { signal: sessionsAbortController.signal }),
    ])
      .then(([assetListRequestOutcome, listedSessions]) => {
        setSessions(listedSessions);
        if (assetListRequestOutcome.status === "error")
          setPageState({ message: assetListRequestOutcome.message, status: "error" });
      })
      .catch((error: unknown) => {
        if (!isAbortError(error))
          setPageState({ message: error instanceof Error ? error.message : "Unable to load sessions.", status: "error" });
      });
    return () => {
      sessionsAbortController.abort();
      if (hasSameAssetListScope(activeAssetListScopeRef.current, requestedScope))
        assetListRequestRef.current?.abortController.abort();
    };
  }, [campaign.id, mediaFamily, requestAssetList]);
  function acceptFile(nextFile: File | null) {
    setFile(nextFile);
    setUploadError(null);
    if (nextFile && !title) setTitle(defaultAssetTitle(nextFile.name));
  }
  function draftFor(
    createdId: string,
    nextValues = {
      newSessionLabel,
      newSessionNumber,
      newSessionPlayedOn,
      title,
      truthStatus,
    },
  ): AssetUploadRetryDraft {
    return {
      createdSessionId: createdId,
      newSessionLabel: nextValues.newSessionLabel,
      newSessionNumber: nextValues.newSessionNumber,
      newSessionPlayedOn: nextValues.newSessionPlayedOn,
      selectedSessionId: "new",
      title: nextValues.title,
      truthStatus: nextValues.truthStatus,
      version: 1,
    };
  }
  function persistRetryDraft(createdId: string, nextValues?: Parameters<typeof draftFor>[1]) {
    const wasWritten = writeRetryDraft(campaign.id, draftFor(createdId, nextValues));
    setRecoveryStatus(wasWritten ? "durable-retry" : "non-durable-retry");
    setRecoveryCampaignId(campaign.id);
    return wasWritten;
  }
  function cancelUpload() {
    setFile(null);
    setTitle("");
    setTruthStatus("uncertain");
    setSelectedSessionId("");
    setNewSessionLabel("");
    setNewSessionNumber("");
    setNewSessionPlayedOn("");
    setCreatedSessionId(null);
    setRecoveryStatus("ordinary");
    setRecoveryCampaignId(null);
    setUploadError(null);
    registrationRef.current?.setDirty(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }
  function discardRetry() {
    if (!removeRetryDraft(retryDraftStorageKey(campaign.id))) {
      setUploadError("The saved recovery could not be cleared. Retry cleanup before changing this upload.");
      return;
    }
    cancelUpload();
  }
  async function refreshAssetLibraryAfterSuccessfulUpload() {
    const assetListRequestOutcome = await requestAssetList(activeAssetListScopeRef.current);
    if (assetListRequestOutcome.status === "error") {
      setPageState({
        message: `The asset uploaded successfully, but the library could not be refreshed: ${assetListRequestOutcome.message}`,
        status: "error",
      });
    }
  }
  async function retrySucceededUploadCleanup() {
    if (!removeRetryDraft(retryDraftStorageKey(campaign.id))) {
      setUploadError("The saved recovery could not be cleared. Retry cleanup before changing this upload.");
      return;
    }
    cancelUpload();
    await refreshAssetLibraryAfterSuccessfulUpload();
  }
  function updateRetryField(setValue: (value: string) => void, value: string, nextValues: Parameters<typeof draftFor>[1]) {
    setValue(value);
    if (createdSessionId && !persistRetryDraft(createdSessionId, nextValues)) {
      setUploadError("Recovery details could not be saved. Keep this page open before retrying.");
    }
  }
  async function submitUpload(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setUploadError("Choose one file to upload.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      let sessionId = createdSessionId;
      if (selectedSessionId === "new" && !sessionId) {
        if (!newSessionLabel.trim()) {
          setUploadError("Enter a title for the new session.");
          return;
        }
        if (!retryStorageReadable || !canWriteRetryDraft(campaign.id)) {
          setUploadError(
            "Unable to verify upload recovery storage. Create the session separately or choose an existing session.",
          );
          return;
        }
        const parsedSessionNumber = newSessionNumber.trim() ? Number(newSessionNumber) : null;
        const createdSession = await createSession(campaign.id, {
          playedOn: newSessionPlayedOn || null,
          sessionLabel: newSessionLabel.trim(),
          sessionNumber: Number.isInteger(parsedSessionNumber) ? parsedSessionNumber : null,
          summary: null,
        });
        sessionId = createdSession.id;
        setCreatedSessionId(sessionId);
        setSessions((current) => [...current, createdSession]);
        if (!persistRetryDraft(sessionId)) {
          setUploadError("The session was created, but recovery could not be saved. Keep this page open before retrying.");
          return;
        }
      }
      if (selectedSessionId && selectedSessionId !== "new") sessionId = selectedSessionId;
      if (!selectedSessionId) sessionId = null;
      if (createdSessionId && !persistRetryDraft(createdSessionId)) {
        setUploadError("Recovery details could not be saved. Keep this page open before retrying.");
        return;
      }
      await createAsset(campaign.id, { file, sessionId, title: title.trim() || null, truthStatus });
      const completedDraftCapableUpload = selectedSessionId === "new" && sessionId !== null;
      if (completedDraftCapableUpload && !removeRetryDraft(retryDraftStorageKey(campaign.id))) {
        setFile(null);
        setRecoveryStatus("upload-succeeded-cleanup-failed");
        setRecoveryCampaignId(campaign.id);
        setUploadError(
          "The asset uploaded successfully, but saved recovery cleanup failed. Refresh could show stale recovery data.",
        );
      } else {
        cancelUpload();
        await refreshAssetLibraryAfterSuccessfulUpload();
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Unable to upload the asset.");
    } finally {
      setUploading(false);
    }
  }
  async function confirmDeletion() {
    if (!pendingDeletion) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAsset(campaign.id, pendingDeletion.id);
      setPageState((state) =>
        state.status === "ready"
          ? { assets: state.assets.filter((asset) => asset.id !== pendingDeletion.id), status: "ready" }
          : state,
      );
      setPendingDeletion(null);
    } catch (error) {
      const originalDeleteError = error instanceof Error ? error.message : "Unable to delete asset.";
      const requestedScope = activeAssetListScopeRef.current;
      const requestGeneration = assetListRequestGenerationRef.current;
      setDeleteError(originalDeleteError);
      try {
        const refreshedAsset = await getAsset(campaign.id, pendingDeletion.id);
        if (
          assetListRequestGenerationRef.current !== requestGeneration ||
          !hasSameAssetListScope(activeAssetListScopeRef.current, requestedScope)
        ) {
          return;
        }
        setPageState((state) =>
          state.status === "ready"
            ? {
                assets: state.assets.map((asset) => (asset.id === refreshedAsset.id ? refreshedAsset : asset)),
                status: "ready",
              }
            : state,
        );
        setUncertainAssetIds((assetIds) => {
          const nextAssetIds = new Set(assetIds);
          nextAssetIds.delete(refreshedAsset.id);
          return nextAssetIds;
        });
        setDeletionRecoveryMessage(originalDeleteError);
      } catch (refreshError) {
        if (
          assetListRequestGenerationRef.current !== requestGeneration ||
          !hasSameAssetListScope(activeAssetListScopeRef.current, requestedScope)
        ) {
          return;
        }
        if (refreshError instanceof Error && "status" in refreshError && refreshError.status === 404) {
          setPageState((state) =>
            state.status === "ready"
              ? { assets: state.assets.filter((asset) => asset.id !== pendingDeletion.id), status: "ready" }
              : state,
          );
          setUncertainAssetIds((assetIds) => {
            const nextAssetIds = new Set(assetIds);
            nextAssetIds.delete(pendingDeletion.id);
            return nextAssetIds;
          });
        } else {
          setUncertainAssetIds((assetIds) => new Set(assetIds).add(pendingDeletion.id));
          setDeletionRecoveryMessage(`${originalDeleteError} Current asset status could not be refreshed.`);
        }
      } finally {
        setPendingDeletion(null);
      }
    } finally {
      setDeleting(false);
    }
  }
  const visibleAssets =
    pageState.status === "ready"
      ? pageState.assets.filter((asset) =>
          `${asset.title ?? ""} ${asset.originalFilename}`.toLowerCase().includes(search.toLowerCase()),
        )
      : [];
  const sessionNameById = new Map(sessions.map((session) => [session.id, formatLinkedSessionName(session)]));
  const hasActiveRetry = recoveryCampaignId === campaign.id && recoveryStatus !== "ordinary";
  if (recoveryStatus === "upload-succeeded-cleanup-failed" && recoveryCampaignId === campaign.id) {
    return (
      <div className="page-stack">
        <SectionPanel>
          <section className="asset-upload-configuration">
            <h3>Asset uploaded successfully</h3>
            <p>{uploadError}</p>
            <button type="button" onClick={() => void retrySucceededUploadCleanup()}>
              Retry cleanup
            </button>
          </section>
        </SectionPanel>
      </div>
    );
  }
  return (
    <div className="page-stack">
      <header className="workspace-section-header">
        <div>
          <h2 className="font-cinzel">Assets</h2>
          <p>
            Evidence, maps, and reference files linked to <span className="workspace-campaign-name">{campaign.name}</span>.
          </p>
        </div>
      </header>
      <SectionPanel>
        <form className="asset-upload-form" onSubmit={(event) => void submitUpload(event)}>
          {!file && !hasActiveRetry ? (
            <div
              className="asset-drop-zone"
              onDragOver={(event: DragEvent) => {
                event.preventDefault();
              }}
              onDrop={(event: DragEvent) => {
                event.preventDefault();
                acceptFile(event.dataTransfer.files.item(0));
              }}
            >
              <span className="asset-upload-icon" aria-hidden="true">
                ⇧
              </span>
              <h3>
                Add Assets to <span className="workspace-campaign-name">{campaign.name}</span>
              </h3>
              <p>Drag files here to link them to this campaign, or browse local storage.</p>
              <button className="asset-choose-file" type="button" onClick={() => fileInputRef.current?.click()}>
                + Choose File or Source
              </button>
            </div>
          ) : (
            <section className="asset-upload-configuration">
              <div className="asset-upload-configuration-heading">
                <div>
                  <h3>Configure Asset Metadata</h3>
                  {file ? (
                    <p>
                      File ready: <strong>{file.name}</strong> ({formatBytes(file.size)})
                    </p>
                  ) : (
                    <p>Choose a replacement file to complete this recovered upload.</p>
                  )}
                  {!file ? (
                    <button className="asset-choose-file" type="button" onClick={() => fileInputRef.current?.click()}>
                      Choose replacement file
                    </button>
                  ) : null}
                </div>
                <button className="asset-upload-cancel" type="button" onClick={hasActiveRetry ? discardRetry : cancelUpload}>
                  {hasActiveRetry ? "Discard retry" : "Cancel"}
                </button>
              </div>
              <div className="asset-upload-fields">
                <label className="field">
                  <span className="field-label">Display title</span>
                  <input
                    value={title}
                    onChange={(event) => {
                      updateRetryField(setTitle, event.target.value, {
                        newSessionLabel,
                        newSessionNumber,
                        newSessionPlayedOn,
                        title: event.target.value,
                        truthStatus,
                      });
                    }}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Truth status</span>
                  <select
                    value={truthStatus}
                    onChange={(event) => {
                      const nextTruthStatus = event.target.value as SourceAssetTruthStatus;
                      setTruthStatus(nextTruthStatus);
                      if (
                        createdSessionId &&
                        !persistRetryDraft(createdSessionId, {
                          newSessionLabel,
                          newSessionNumber,
                          newSessionPlayedOn,
                          title,
                          truthStatus: nextTruthStatus,
                        })
                      ) {
                        setUploadError("Recovery details could not be saved. Keep this page open before retrying.");
                      }
                    }}
                  >
                    <option value="canonical">Canon (Verified Truth)</option>
                    <option value="uncertain">Reference Material</option>
                    <option value="subjective">In-Game Rumor / Handout</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Link to session</span>
                  <select
                    value={selectedSessionId}
                    onChange={(event) => {
                      if (hasActiveRetry && event.target.value !== "new") {
                        discardRetry();
                        return;
                      }
                      setSelectedSessionId(event.target.value);
                    }}
                  >
                    <option value="">Unlinked / General Reference</option>
                    {sessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {formatLinkedSessionName(session)}
                      </option>
                    ))}
                    <option value="new">+ Create New Session...</option>
                  </select>
                </label>
              </div>
              {selectedSessionId === "new" ? (
                <div className="asset-new-session-field">
                  <div className="asset-new-session-fields">
                    <label className="field">
                      <span className="field-label">Session number</span>
                      <input
                        disabled={Boolean(createdSessionId)}
                        inputMode="numeric"
                        value={newSessionNumber}
                        onChange={(event) => {
                          updateRetryField(setNewSessionNumber, event.target.value, {
                            newSessionLabel,
                            newSessionNumber: event.target.value,
                            newSessionPlayedOn,
                            title,
                            truthStatus,
                          });
                        }}
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">Date played</span>
                      <input
                        disabled={Boolean(createdSessionId)}
                        type="date"
                        value={newSessionPlayedOn}
                        onChange={(event) => {
                          updateRetryField(setNewSessionPlayedOn, event.target.value, {
                            newSessionLabel,
                            newSessionNumber,
                            newSessionPlayedOn: event.target.value,
                            title,
                            truthStatus,
                          });
                        }}
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">Session title</span>
                      <input
                        disabled={Boolean(createdSessionId)}
                        placeholder="e.g. Blackreef Vault Infiltration"
                        value={newSessionLabel}
                        onChange={(event) => {
                          updateRetryField(setNewSessionLabel, event.target.value, {
                            newSessionLabel: event.target.value,
                            newSessionNumber,
                            newSessionPlayedOn,
                            title,
                            truthStatus,
                          });
                        }}
                      />
                    </label>
                  </div>
                  {createdSessionId ? (
                    <span className="field-label-helper">Session created. Retrying will upload to this same session.</span>
                  ) : null}
                </div>
              ) : null}
              {uploadError ? <p className="field-error">{uploadError}</p> : null}
              <div className="asset-upload-actions">
                <button className="primary-button" disabled={uploading} type="submit">
                  {uploading ? "Uploading..." : "+ Save & Link Asset"}
                </button>
              </div>
            </section>
          )}
          <input
            ref={fileInputRef}
            aria-label="Choose asset file"
            className="sr-only"
            type="file"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              acceptFile(event.target.files?.[0] ?? null);
            }}
          />
        </form>
      </SectionPanel>
      {pageState.status === "loading" ? (
        <RequestStateBlock message="Loading campaign assets." title="Loading assets" />
      ) : null}
      {pageState.status === "error" ? (
        <RequestStateBlock message={pageState.message} title="Assets unavailable" tone="error" />
      ) : null}
      {deletionRecoveryMessage ? (
        <p className="field-error" role="alert">
          {deletionRecoveryMessage}
        </p>
      ) : null}
      {pageState.status === "ready" ? (
        <section className="panel asset-library">
          <div className="workspace-retrieval-toolbar">
            <label className="workspace-search-field">
              <span className="sr-only">Search assets</span>
              <input
                placeholder="Search assets or keywords…"
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
              />
            </label>
            <label className="field">
              <span className="sr-only">Asset family</span>
              <select
                value={mediaFamily}
                onChange={(event) => {
                  setMediaFamily(event.target.value as SourceAssetMediaFamily | "");
                }}
              >
                <option value="">All types ({pageState.assets.length})</option>
                <option value="document">Documents</option>
                <option value="spreadsheet">Spreadsheets</option>
                <option value="image">Images</option>
              </select>
            </label>
          </div>
          {visibleAssets.length ? (
            <div className="asset-list">
              {visibleAssets.map((asset) => (
                <article key={asset.id} className="asset-row">
                  <Link
                    aria-label={`Open ${asset.title ?? asset.originalFilename}`}
                    className="asset-card-link"
                    to={`/campaigns/${campaign.id}/assets/${asset.id}`}
                  />
                  <span className={`asset-file-type ${assetFileTypeClass(asset.mediaType)}`}>
                    {assetTypeLabel(asset.mediaType)}
                  </span>
                  <div className="asset-row-main">
                    <strong className="asset-row-name">{asset.title ?? asset.originalFilename}</strong>
                    <p className="record-meta">
                      <span>{formatBytes(asset.fileSizeBytes)}</span>
                      {asset.sessionId ? (
                        <span className="asset-meta-chip asset-session-chip">
                          {sessionNameById.get(asset.sessionId) ?? "Linked session"}
                        </span>
                      ) : (
                        <span>Not linked to a session</span>
                      )}
                      <span className="asset-meta-chip asset-truth-chip">{truthStatusLabel(asset.truthStatus)}</span>
                      <span
                        className={
                          uncertainAssetIds.has(asset.id) || asset.lifecycleStatus === "deleting"
                            ? "deleting-chip"
                            : "missing-chip"
                        }
                      >
                        {uncertainAssetIds.has(asset.id)
                          ? "Deletion status uncertain"
                          : getAssetStatusPresentation(asset).label}
                      </span>
                    </p>
                  </div>
                  <div className="row-actions">
                    {getAssetStatusPresentation(asset).isReadOnly || uncertainAssetIds.has(asset.id) ? (
                      <span aria-disabled="true" className="asset-edit-button asset-action-disabled">
                        Edit
                      </span>
                    ) : (
                      <Link className="asset-edit-button" to={`/campaigns/${campaign.id}/assets/${asset.id}/edit`}>
                        Edit
                      </Link>
                    )}
                    <button
                      className="asset-delete-button"
                      disabled={getAssetStatusPresentation(asset).isReadOnly || uncertainAssetIds.has(asset.id)}
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setPendingDeletion(asset);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p>No assets match this view.</p>
          )}
        </section>
      ) : null}
      {pendingDeletion ? (
        <DeleteConfirmationDialog
          error={deleteError}
          isDeleting={deleting}
          recordName={pendingDeletion.title ?? pendingDeletion.originalFilename}
          warningText="This asset will be permanently deleted when its backing file can be removed."
          onCancel={() => {
            setDeleteError(null);
            setPendingDeletion(null);
          }}
          onConfirm={() => void confirmDeletion()}
        />
      ) : null}
    </div>
  );
}
