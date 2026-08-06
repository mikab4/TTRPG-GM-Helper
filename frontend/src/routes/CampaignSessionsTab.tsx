import { Link, useOutletContext } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

import { deleteSession, listSessions } from "../api/sessions";
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";
import { RequestStateBlock } from "../components/RequestStateBlock";
import type { CampaignSession } from "../types/sessions";
import type { CampaignWorkspaceContext } from "./CampaignWorkspacePage";

type SessionsState =
  | { status: "loading" }
  | { message: string; status: "error" }
  | { sessions: CampaignSession[]; status: "ready" };

export function formatSessionName(session: CampaignSession): string {
  return (
    session.sessionLabel ??
    (session.sessionNumber === null ? "Untitled session" : `Session ${String(session.sessionNumber)}`)
  );
}

export function formatLinkedSessionName(session: CampaignSession): string {
  if (session.sessionNumber !== null && session.sessionLabel) {
    return `Session ${String(session.sessionNumber)} — ${session.sessionLabel}`;
  }

  return formatSessionName(session);
}

export function CampaignSessionsTab() {
  const { campaign } = useOutletContext<CampaignWorkspaceContext>();
  const [pageState, setPageState] = useState<SessionsState>({ status: "loading" });
  const [pendingDeletion, setPendingDeletion] = useState<CampaignSession | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deletionInFlightRef = useRef(false);

  useEffect(() => {
    const abortController = new AbortController();
    void listSessions(campaign.id, { signal: abortController.signal })
      .then((sessions) => {
        setPageState({ sessions, status: "ready" });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setPageState({
            message: error instanceof Error ? error.message : "Unknown session load failure.",
            status: "error",
          });
        }
      });
    return () => {
      abortController.abort();
    };
  }, [campaign.id]);

  async function confirmDeletion() {
    if (!pendingDeletion || deletionInFlightRef.current) return;
    deletionInFlightRef.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteSession(campaign.id, pendingDeletion.id);
      setPageState((state) =>
        state.status === "ready"
          ? { sessions: state.sessions.filter((session) => session.id !== pendingDeletion.id), status: "ready" }
          : state,
      );
      setPendingDeletion(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unknown session delete failure.");
    } finally {
      deletionInFlightRef.current = false;
      setDeleting(false);
    }
  }

  return (
    <div className="session-page">
      <header className="session-viewhead">
        <div>
          <h2 className="font-cinzel">Sessions</h2>
          <p>
            Recaps and log records for <span className="workspace-campaign-name">{campaign.name}</span>.
          </p>
        </div>
        <div className="section-actions">
          <Link className="session-add" to={`/campaigns/${campaign.id}/sessions/new`}>
            + Log session
          </Link>
        </div>
      </header>
      {pageState.status === "loading" ? (
        <RequestStateBlock message="Loading campaign sessions." title="Loading sessions" />
      ) : null}
      {pageState.status === "error" ? (
        <RequestStateBlock message={pageState.message} title="Sessions unavailable" tone="error" />
      ) : null}
      {pageState.status === "ready" ? (
        <>
          {pageState.sessions.length === 0 ? (
            <p>No sessions are recorded yet. Add a session when your campaign reaches its next milestone.</p>
          ) : (
            <div className="session-list">
              {pageState.sessions.map((session) => (
                <article key={session.id} className="session-row session-card">
                  <Link
                    aria-label={`Open ${formatSessionName(session)}`}
                    className="session-card-link"
                    to={`/campaigns/${campaign.id}/sessions/${session.id}`}
                  />
                  <div className="session-row-main">
                    <div className="session-row-meta">
                      <strong>Session {session.sessionNumber ?? "—"}</strong>
                      <span>•</span>
                      <span> {session.playedOn ? `Played ${session.playedOn}` : "Date not recorded"}</span>
                    </div>
                    <div className="session-row-name">{formatSessionName(session)}</div>
                    <p className="session-summary">{session.summary ?? "No recap recorded yet."}</p>
                  </div>
                  <div className="session-actions">
                    <Link className="session-secondary" to={`/campaigns/${campaign.id}/sessions/${session.id}/edit`}>
                      Edit
                    </Link>
                    <button
                      className="session-delete"
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setPendingDeletion(session);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      ) : null}
      {pendingDeletion ? (
        <DeleteConfirmationDialog
          error={deleteError}
          isDeleting={deleting}
          recordName={formatSessionName(pendingDeletion)}
          warningText="This session will be permanently deleted. Delete or unlink any linked assets first."
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
