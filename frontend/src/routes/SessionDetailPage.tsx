import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

import { listAssets } from "../api/assets";
import { deleteSession, getSession } from "../api/sessions";
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";
import { RequestStateBlock } from "../components/RequestStateBlock";
import type { SourceAsset } from "../types/assets";
import type { CampaignSession } from "../types/sessions";
import { formatSessionName } from "./CampaignSessionsTab";
import type { CampaignWorkspaceContext } from "./CampaignWorkspacePage";

export function SessionDetailPage() {
  const { campaign } = useOutletContext<CampaignWorkspaceContext>();
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<CampaignSession | null>(null);
  const [assets, setAssets] = useState<SourceAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deletionInFlightRef = useRef(false);
  useEffect(() => {
    if (!sessionId) return;
    const abortController = new AbortController();
    void Promise.all([
      getSession(campaign.id, sessionId, { signal: abortController.signal }),
      listAssets(campaign.id, { signal: abortController.signal }),
    ])
      .then(([loadedSession, loadedAssets]) => {
        setSession(loadedSession);
        setAssets(loadedAssets.filter((asset) => asset.sessionId === loadedSession.id));
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError"))
          setError(reason instanceof Error ? reason.message : "Unable to load session details.");
      });
    return () => {
      abortController.abort();
    };
  }, [campaign.id, sessionId]);
  async function confirmDeletion() {
    if (!session || deletionInFlightRef.current) return;
    deletionInFlightRef.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteSession(campaign.id, session.id);
      void navigate(`/campaigns/${campaign.id}/sessions`);
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : "Unable to delete session.");
    } finally {
      deletionInFlightRef.current = false;
      setDeleting(false);
    }
  }
  if (error) return <RequestStateBlock message={error} title="Session unavailable" tone="error" />;
  if (!session) return <RequestStateBlock message="Loading session details." title="Loading session" />;
  return (
    <div className="session-detail-page">
      <Link className="session-back" to={`/campaigns/${campaign.id}/sessions`}>
        ← Back to Sessions
      </Link>
      <header className="session-viewhead">
        <div>
          <div className="session-detail-meta">
            <span>Session {session.sessionNumber ?? "—"}</span>
            <span>{session.playedOn ? `Played ${session.playedOn}` : "Date not recorded"}</span>
          </div>
          <h2>{formatSessionName(session)}</h2>
        </div>
        <div className="session-detail-actions">
          <Link className="session-add" to={`/campaigns/${campaign.id}/sessions/${session.id}/edit`}>
            ✎ Edit session
          </Link>
          <button
            className="session-delete"
            type="button"
            onClick={() => {
              setDeleteError(null);
              setDeletePending(true);
            }}
          >
            Delete session
          </button>
        </div>
      </header>
      <div className="session-detail-grid">
        <article className="session-detail-card">
          <h3>Public session recap</h3>
          <p>{session.summary ?? "No recap recorded yet."}</p>
        </article>
        <aside className="session-linked-panel">
          <h3>Linked assets ({String(assets.length)})</h3>
          {assets.length ? (
            <ul className="linked-record-list">
              {assets.map((asset) => (
                <li key={asset.id}>
                  <Link to={`/campaigns/${campaign.id}/assets/${asset.id}`}>{asset.title ?? asset.originalFilename}</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>No assets are linked to this session.</p>
          )}
        </aside>
      </div>
      {deletePending ? (
        <DeleteConfirmationDialog
          error={deleteError}
          isDeleting={deleting}
          recordName={formatSessionName(session)}
          warningText="This session will be permanently deleted. Delete or unlink any linked assets first."
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
