import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";

import { createSession, getSession, updateSession } from "../api/sessions";
import { useUnsavedChanges, type UnsavedChangesRegistration } from "../app/UnsavedChangesContext";
import { PageHeader } from "../components/PageHeader";
import { RequestStateBlock } from "../components/RequestStateBlock";
import { SectionPanel } from "../components/SectionPanel";
import type { CampaignSessionCreate } from "../types/sessions";
import type { CampaignWorkspaceContext } from "./CampaignWorkspacePage";

type SessionFormPageProps = { mode: "create" | "edit" };

export function SessionFormPage({ mode }: SessionFormPageProps) {
  const { campaign } = useOutletContext<CampaignWorkspaceContext>();
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { registerForm } = useUnsavedChanges();
  const registrationRef = useRef<UnsavedChangesRegistration | null>(null);
  const [initialValues, setInitialValues] = useState<CampaignSessionCreate | null>(
    mode === "create" ? { playedOn: null, sessionLabel: null, sessionNumber: null, summary: null } : null,
  );
  const [sessionNumber, setSessionNumber] = useState("");
  const [sessionLabel, setSessionLabel] = useState("");
  const [playedOn, setPlayedOn] = useState("");
  const [summary, setSummary] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const registration = registerForm();
    registrationRef.current = registration;
    return registration.unregister;
  }, [registerForm]);
  useEffect(() => {
    if (mode === "create" || !sessionId) return;
    const abortController = new AbortController();
    void getSession(campaign.id, sessionId, { signal: abortController.signal })
      .then((session) => {
        const values = {
          playedOn: session.playedOn,
          sessionLabel: session.sessionLabel,
          sessionNumber: session.sessionNumber,
          summary: session.summary,
        };
        setInitialValues(values);
        setSessionNumber(session.sessionNumber?.toString() ?? "");
        setSessionLabel(session.sessionLabel ?? "");
        setPlayedOn(session.playedOn ?? "");
        setSummary(session.summary ?? "");
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setLoadError(error instanceof Error ? error.message : "Unable to load session details.");
      });
    return () => {
      abortController.abort();
    };
  }, [campaign.id, mode, sessionId]);
  useEffect(() => {
    if (initialValues)
      registrationRef.current?.setDirty(
        sessionNumber !== (initialValues.sessionNumber?.toString() ?? "") ||
          sessionLabel !== (initialValues.sessionLabel ?? "") ||
          playedOn !== (initialValues.playedOn ?? "") ||
          summary !== (initialValues.summary ?? ""),
      );
  }, [initialValues, playedOn, sessionLabel, sessionNumber, summary]);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedNumber = sessionNumber.trim() ? Number(sessionNumber) : null;
    const values = {
      playedOn: playedOn || null,
      sessionLabel: sessionLabel.trim() || null,
      sessionNumber: Number.isInteger(parsedNumber) ? parsedNumber : null,
      summary: summary.trim() || null,
    };
    if (values.sessionNumber === null && values.sessionLabel === null) {
      setSubmitError("Enter a session number or a session title.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const saved =
        mode === "create"
          ? await createSession(campaign.id, values)
          : await updateSession(campaign.id, sessionId ?? "", values);
      registrationRef.current?.markCleanAndNavigate(() => {
        void navigate(`/campaigns/${campaign.id}/sessions/${saved.id}`);
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to save the session.");
    } finally {
      setSubmitting(false);
    }
  }
  if (loadError) return <RequestStateBlock message={loadError} title="Session unavailable" tone="error" />;
  if (!initialValues) return <RequestStateBlock message="Loading session details." title="Loading session" />;
  return (
    <div className="page-stack workspace-surface">
      <PageHeader
        actions={
          <Link className="secondary-button" to={`/campaigns/${campaign.id}/sessions`}>
            Cancel
          </Link>
        }
        description={`Campaign: ${campaign.name}`}
        eyebrow="Session Log"
        title={mode === "create" ? "New Session" : "Edit Session"}
      />
      <SectionPanel title="Session Details">
        <form className="record-form session-form" onSubmit={(event) => void submit(event)}>
          <div className="session-fields-grid">
            <label className="field">
              <span className="field-label">Session number</span>
              <input
                inputMode="numeric"
                value={sessionNumber}
                onChange={(event) => {
                  setSessionNumber(event.target.value);
                }}
              />
            </label>
            <label className="field">
              <span className="field-label">Date played</span>
              <input
                type="date"
                value={playedOn}
                onChange={(event) => {
                  setPlayedOn(event.target.value);
                }}
              />
            </label>
          </div>
          <label className="field">
            <span className="field-label">Session title</span>
            <input
              value={sessionLabel}
              onChange={(event) => {
                setSessionLabel(event.target.value);
              }}
            />
          </label>
          <label className="field">
            <span className="field-label">Public player summary / recap</span>
            <textarea
              rows={7}
              value={summary}
              onChange={(event) => {
                setSummary(event.target.value);
              }}
            />
          </label>
          {submitError ? <p className="field-error">{submitError}</p> : null}
          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? "Saving..." : mode === "create" ? "Create Session" : "Save Session"}
          </button>
        </form>
      </SectionPanel>
    </div>
  );
}
