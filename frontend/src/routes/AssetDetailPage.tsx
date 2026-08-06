import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

import { deleteAsset, getAsset } from "../api/assets";
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";
import { listSessions } from "../api/sessions";
import { RequestStateBlock } from "../components/RequestStateBlock";
import type { SourceAsset } from "../types/assets";
import type { CampaignSession } from "../types/sessions";
import { formatLinkedSessionName } from "./CampaignSessionsTab";
import type { CampaignWorkspaceContext } from "./CampaignWorkspacePage";

function formatAssetSize(fileSizeBytes: number) {
  return fileSizeBytes < 1024 * 1024
    ? `${String(Math.max(1, Math.round(fileSizeBytes / 1024)))} KB`
    : `${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatFileFormat(mediaType: string) {
  if (mediaType === "application/pdf") return "PDF Document";
  if (mediaType === "text/csv") return "CSV Spreadsheet";
  if (mediaType.includes("spreadsheet")) return "Spreadsheet";
  if (mediaType.startsWith("image/")) return `${mediaType.split("/")[1]?.toUpperCase() ?? "Image"} Image`;
  return mediaType;
}

function formatUploadDate(createdAt: string) {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(createdAt));
}

export function AssetDetailPage() {
  const { campaign } = useOutletContext<CampaignWorkspaceContext>();
  const { assetId } = useParams();
  const navigate = useNavigate();
  const [asset, setAsset] = useState<SourceAsset | null>(null);
  const [linkedSession, setLinkedSession] = useState<CampaignSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deletionInFlightRef = useRef(false);
  useEffect(() => {
    if (!assetId) return;
    const abortController = new AbortController();
    void Promise.all([
      getAsset(campaign.id, assetId, { signal: abortController.signal }),
      listSessions(campaign.id, { signal: abortController.signal }),
    ])
      .then(([loadedAsset, sessions]) => {
        setAsset(loadedAsset);
        setLinkedSession(sessions.find((session) => session.id === loadedAsset.sessionId) ?? null);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError"))
          setError(reason instanceof Error ? reason.message : "Unable to load asset details.");
      });
    return () => {
      abortController.abort();
    };
  }, [assetId, campaign.id]);

  async function confirmDeletion() {
    if (!asset || deletionInFlightRef.current) return;
    deletionInFlightRef.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAsset(campaign.id, asset.id);
      void navigate(`/campaigns/${campaign.id}/assets`);
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : "Unable to delete asset.");
    } finally {
      deletionInFlightRef.current = false;
      setDeleting(false);
    }
  }

  if (error) return <RequestStateBlock message={error} title="Asset unavailable" tone="error" />;
  if (!asset) return <RequestStateBlock message="Loading asset metadata." title="Loading asset" />;
  return (
    <div className="asset-detail-page">
      <Link className="asset-detail-back" to={`/campaigns/${campaign.id}/assets`}>
        ← Back to Assets
      </Link>
      <header className="asset-detail-viewhead">
        <div>
          <div className="asset-detail-heading">
            {linkedSession ? (
              <span className="asset-meta-chip asset-session-chip">{formatLinkedSessionName(linkedSession)}</span>
            ) : null}
            <span className="asset-meta-chip asset-truth-chip">
              {asset.truthStatus === "canonical" ? "Canonical" : asset.truthStatus === "subjective" ? "Rumor" : "Reference"}
            </span>
            {asset.storageStatus === "missing" ? <span className="missing-chip">File missing</span> : null}
          </div>
          <h2>{asset.title ?? asset.originalFilename}</h2>
        </div>
        <div className="asset-detail-actions">
          <Link className="asset-detail-edit" to={`/campaigns/${campaign.id}/assets/${asset.id}/edit`}>
            ✎ Edit Metadata
          </Link>
          <button
            className="asset-delete-button"
            type="button"
            onClick={() => {
              setDeleteError(null);
              setDeletePending(true);
            }}
          >
            Delete Asset
          </button>
        </div>
      </header>
      <div className="asset-detail-grid">
        <article className="asset-detail-card">
          <h3>Asset Overview &amp; Metadata</h3>
          <div className="asset-metadata">
            <div>
              <span>File Format:</span>
              <strong>{formatFileFormat(asset.mediaType)}</strong>
            </div>
            <div>
              <span>File Size:</span>
              <strong>{formatAssetSize(asset.fileSizeBytes)}</strong>
            </div>
            <div>
              <span>Upload Date:</span>
              <strong>{formatUploadDate(asset.createdAt)}</strong>
            </div>
            <div>
              <span>Status:</span>
              <strong className={asset.storageStatus === "missing" ? "asset-status-missing" : "asset-status-verified"}>
                {asset.storageStatus === "missing" ? "File Missing" : "Linked & Verified"}
              </strong>
            </div>
          </div>
        </article>
        <aside>
          <article className="asset-linked-panel">
            <h3>Linked Session</h3>
            {linkedSession ? (
              <Link className="asset-session-link" to={`/campaigns/${campaign.id}/sessions/${linkedSession.id}`}>
                <strong>{formatLinkedSessionName(linkedSession)}</strong>
                <span>{linkedSession.playedOn ? `Played ${linkedSession.playedOn} →` : "View session →"}</span>
              </Link>
            ) : (
              <p>Not linked to a session.</p>
            )}
          </article>
        </aside>
      </div>
      {deletePending ? (
        <DeleteConfirmationDialog
          error={deleteError}
          isDeleting={deleting}
          recordName={asset.title ?? asset.originalFilename}
          warningText="This asset will be permanently deleted when its backing file can be removed."
          onCancel={() => {
            setDeleteError(null);
            setDeletePending(false);
          }}
          onConfirm={() => void confirmDeletion()}
        />
      ) : null}
    </div>
  );
}
