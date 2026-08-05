import { Link, useOutletContext, useParams } from "react-router-dom";
import { useEffect, useState } from "react";

import { getAsset } from "../api/assets";
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
  const [asset, setAsset] = useState<SourceAsset | null>(null);
  const [linkedSession, setLinkedSession] = useState<CampaignSession | null>(null);
  const [error, setError] = useState<string | null>(null);
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
        <Link className="asset-detail-edit" to={`/campaigns/${campaign.id}/assets/${asset.id}/edit`}>
          ✎ Edit Metadata
        </Link>
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
    </div>
  );
}
