import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";

import { getAsset, updateAsset } from "../api/assets";
import { listSessions } from "../api/sessions";
import { useUnsavedChanges, type UnsavedChangesRegistration } from "../app/UnsavedChangesContext";
import { PageHeader } from "../components/PageHeader";
import { RequestStateBlock } from "../components/RequestStateBlock";
import { SectionPanel } from "../components/SectionPanel";
import type { SourceAsset, SourceAssetTruthStatus } from "../types/assets";
import type { CampaignSession } from "../types/sessions";
import { formatLinkedSessionName } from "./CampaignSessionsTab";
import type { CampaignWorkspaceContext } from "./CampaignWorkspacePage";

export function AssetEditPage() {
  const { campaign } = useOutletContext<CampaignWorkspaceContext>();
  const { assetId } = useParams();
  const navigate = useNavigate();
  const { registerForm } = useUnsavedChanges();
  const registrationRef = useRef<UnsavedChangesRegistration | null>(null);
  const [asset, setAsset] = useState<SourceAsset | null>(null);
  const [sessions, setSessions] = useState<CampaignSession[]>([]);
  const [title, setTitle] = useState("");
  const [truthStatus, setTruthStatus] = useState<SourceAssetTruthStatus>("uncertain");
  const [sessionId, setSessionId] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    const registration = registerForm();
    registrationRef.current = registration;
    return registration.unregister;
  }, [registerForm]);
  useEffect(() => {
    if (!assetId) return;
    const abortController = new AbortController();
    void getAsset(campaign.id, assetId, { signal: abortController.signal })
      .then(async (loadedAsset) => {
        setAsset(loadedAsset);
        if (loadedAsset.lifecycleStatus === "deleting") return;
        const listedSessions = await listSessions(campaign.id, { signal: abortController.signal });
        setSessions(listedSessions);
        setTitle(loadedAsset.title ?? "");
        setTruthStatus(loadedAsset.truthStatus);
        setSessionId(loadedAsset.sessionId ?? "");
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setLoadError(error instanceof Error ? error.message : "Unable to load asset metadata.");
      });
    return () => {
      abortController.abort();
    };
  }, [assetId, campaign.id]);
  useEffect(() => {
    if (asset)
      registrationRef.current?.setDirty(
        title !== (asset.title ?? "") || truthStatus !== asset.truthStatus || sessionId !== (asset.sessionId ?? ""),
      );
  }, [asset, sessionId, title, truthStatus]);
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asset) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await updateAsset(campaign.id, asset.id, { sessionId: sessionId || null, title: title.trim() || null, truthStatus });
      registrationRef.current?.markCleanAndNavigate(() => {
        void navigate(`/campaigns/${campaign.id}/assets/${asset.id}`);
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to update asset metadata.");
    } finally {
      setSubmitting(false);
    }
  }
  if (loadError) return <RequestStateBlock message={loadError} title="Asset unavailable" tone="error" />;
  if (!asset) return <RequestStateBlock message="Loading asset metadata." title="Loading asset" />;
  if (asset.lifecycleStatus === "deleting")
    return (
      <RequestStateBlock
        message="Deletion in progress. Asset metadata can no longer be edited."
        title="Deletion in progress"
      />
    );
  return (
    <div className="page-stack workspace-surface">
      <PageHeader
        actions={
          <Link className="secondary-button" to={`/campaigns/${campaign.id}/assets/${asset.id}`}>
            Back To Asset
          </Link>
        }
        description={`Campaign: ${campaign.name}`}
        eyebrow="Source asset"
        title="Edit Asset Metadata"
      />
      <SectionPanel>
        <form className="record-form" onSubmit={(event) => void submit(event)}>
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
              <option value="uncertain">Uncertain</option>
              <option value="canonical">Canonical</option>
              <option value="subjective">Subjective</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Linked session</span>
            <select
              value={sessionId}
              onChange={(event) => {
                setSessionId(event.target.value);
              }}
            >
              <option value="">Not linked to a session</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {formatLinkedSessionName(session)}
                </option>
              ))}
            </select>
          </label>
          {submitError ? <p className="field-error">{submitError}</p> : null}
          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? "Saving..." : "Save Asset"}
          </button>
        </form>
      </SectionPanel>
    </div>
  );
}
