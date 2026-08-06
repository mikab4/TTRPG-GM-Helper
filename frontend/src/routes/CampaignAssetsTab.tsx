import { Link, useOutletContext } from "react-router-dom";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type SyntheticEvent } from "react";

import { createAsset, deleteAsset, listAssets } from "../api/assets";
import { createSession, listSessions } from "../api/sessions";
import { useUnsavedChanges } from "../app/UnsavedChangesContext";
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";
import { RequestStateBlock } from "../components/RequestStateBlock";
import { SectionPanel } from "../components/SectionPanel";
import type { SourceAsset, SourceAssetMediaFamily, SourceAssetTruthStatus } from "../types/assets";
import type { CampaignSession } from "../types/sessions";
import { formatLinkedSessionName } from "./CampaignSessionsTab";
import type { CampaignWorkspaceContext } from "./CampaignWorkspacePage";

type AssetsState = { status: "loading" } | { message: string; status: "error" } | { assets: SourceAsset[]; status: "ready" };

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

export function CampaignAssetsTab() {
  const { campaign } = useOutletContext<CampaignWorkspaceContext>();
  const { registerForm } = useUnsavedChanges();
  const registrationRef = useRef<ReturnType<typeof registerForm> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<SourceAsset | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    const registration = registerForm();
    registrationRef.current = registration;
    return registration.unregister;
  }, [registerForm]);
  useEffect(() => {
    registrationRef.current?.setDirty(
      Boolean(
        file ||
        title ||
        selectedSessionId ||
        newSessionLabel ||
        newSessionNumber ||
        newSessionPlayedOn ||
        truthStatus !== "uncertain",
      ),
    );
  }, [file, newSessionLabel, newSessionNumber, newSessionPlayedOn, selectedSessionId, title, truthStatus]);
  useEffect(() => {
    const abortController = new AbortController();
    void Promise.all([
      listAssets(campaign.id, { mediaFamily: mediaFamily || undefined, signal: abortController.signal }),
      listSessions(campaign.id, { signal: abortController.signal }),
    ])
      .then(([assets, listedSessions]) => {
        setPageState({ assets, status: "ready" });
        setSessions(listedSessions);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setPageState({ message: error instanceof Error ? error.message : "Unable to load assets.", status: "error" });
      });
    return () => {
      abortController.abort();
    };
  }, [campaign.id, mediaFamily]);
  function acceptFile(nextFile: File | null) {
    setFile(nextFile);
    setUploadError(null);
    if (nextFile && !title) setTitle(defaultAssetTitle(nextFile.name));
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
    setUploadError(null);
    registrationRef.current?.setDirty(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
      }
      if (selectedSessionId && selectedSessionId !== "new") sessionId = selectedSessionId;
      if (!selectedSessionId) sessionId = null;
      const createdAsset = await createAsset(campaign.id, { file, sessionId, title: title.trim() || null, truthStatus });
      setPageState((state) =>
        state.status === "ready" ? { assets: [createdAsset, ...state.assets], status: "ready" } : state,
      );
      cancelUpload();
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
      setDeleteError(error instanceof Error ? error.message : "Unable to delete asset.");
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
          {!file ? (
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
                  <p>
                    File ready: <strong>{file.name}</strong> ({formatBytes(file.size)})
                  </p>
                </div>
                <button className="asset-upload-cancel" type="button" onClick={cancelUpload}>
                  Cancel
                </button>
              </div>
              <div className="asset-upload-fields">
                <label className="field">
                  <span className="field-label">Display title</span>
                  <input
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value);
                    }}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Truth status</span>
                  <select
                    value={truthStatus}
                    onChange={(event) => {
                      setTruthStatus(event.target.value as SourceAssetTruthStatus);
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
                          setNewSessionNumber(event.target.value);
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
                          setNewSessionPlayedOn(event.target.value);
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
                          setNewSessionLabel(event.target.value);
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
                      {asset.storageStatus === "missing" ? <span className="missing-chip">File missing</span> : null}
                    </p>
                  </div>
                  <div className="row-actions">
                    <Link className="asset-edit-button" to={`/campaigns/${campaign.id}/assets/${asset.id}/edit`}>
                      Edit
                    </Link>
                    <button
                      className="asset-delete-button"
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
