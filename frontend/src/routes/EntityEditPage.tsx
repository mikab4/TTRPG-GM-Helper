import { Link, useNavigate, useParams } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";

import { getCampaign } from "../api/campaigns";
import { deleteEntity, getEntity, updateEntity } from "../api/entities";
import { EntityForm, type EntityFormValues } from "../components/EntityForm";
import type { UnsavedChangesRegistration } from "../app/UnsavedChangesContext";
import { PageHeader } from "../components/PageHeader";
import { RequestStateBlock } from "../components/RequestStateBlock";
import { SectionPanel } from "../components/SectionPanel";
import { formatEntityTypeLabel } from "../entities/entityTypes";
import type { Campaign } from "../types/campaigns";
import type { Entity } from "../types/entities";

type EntityEditState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { campaign: Campaign; entity: Entity; status: "ready" };

export function EntityEditPage() {
  const navigate = useNavigate();
  const { campaignId, entityId } = useParams();
  const [pageState, setPageState] = useState<EntityEditState>({ status: "loading" });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const formRegistrationRef = useRef<UnsavedChangesRegistration | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    async function loadRecord() {
      if (!campaignId || !entityId) {
        setPageState({ message: "Entity route is missing identifiers.", status: "error" });
        return;
      }

      try {
        const [campaign, entity] = await Promise.all([
          getCampaign(campaignId, { signal: abortController.signal }),
          getEntity(campaignId, entityId, abortController.signal),
        ]);
        setPageState({ campaign, entity, status: "ready" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setPageState({
          message: error instanceof Error ? error.message : "Unknown entity load failure.",
          status: "error",
        });
      }
    }

    void loadRecord();

    return () => {
      abortController.abort();
    };
  }, [campaignId, entityId]);

  const handleRegistrationChange = useCallback((registration: UnsavedChangesRegistration | null) => {
    formRegistrationRef.current = registration;
  }, []);

  async function handleSubmit(values: EntityFormValues, registration: UnsavedChangesRegistration) {
    if (pageState.status !== "ready" || !entityId) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      await updateEntity(pageState.campaign.id, entityId, {
        metadata: pageState.entity.metadata,
        name: values.name,
        summary: values.summary.trim() || null,
        type: values.type,
      });
      registration.markCleanAndNavigate(() => {
        void navigate(`/campaigns/${pageState.campaign.id}/entities/${entityId}`);
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unknown entity save failure.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (pageState.status !== "ready" || !entityId || deleting) {
      return;
    }

    setDeleting(true);
    setSubmitError(null);

    try {
      await deleteEntity(pageState.campaign.id, entityId);
      const navigateToEntityList = () => {
        void navigate(`/campaigns/${pageState.campaign.id}/entities`);
      };
      if (formRegistrationRef.current !== null) {
        formRegistrationRef.current.markCleanAndNavigate(navigateToEntityList);
      } else {
        navigateToEntityList();
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unknown entity delete failure.");
    } finally {
      setDeleting(false);
    }
  }

  if (pageState.status === "loading") {
    return <RequestStateBlock message="Loading entity details and campaign context." title="Loading entity" />;
  }

  if (pageState.status === "error") {
    return <RequestStateBlock message={pageState.message} title="Entity unavailable" tone="error" />;
  }

  return (
    <div className="page-stack workspace-surface">
      <PageHeader
        actions={
          <div className="action-row">
            <Link className="secondary-button" to={`/campaigns/${pageState.campaign.id}/entities/${pageState.entity.id}`}>
              Full Profile
            </Link>
            <button className="danger-button" disabled={deleting} type="button" onClick={() => void handleDelete()}>
              {deleting ? "Deleting..." : "Delete Entity"}
            </button>
          </div>
        }
        description={`Campaign: ${pageState.campaign.name}`}
        eyebrow={formatEntityTypeLabel(pageState.entity.type)}
        title="Edit Entity"
      />
      <div className="entity-page-grid">
        <SectionPanel title="Entity Details">
          <EntityForm
            campaignOptions={[pageState.campaign]}
            fixedCampaignId={pageState.campaign.id}
            initialValues={{
              campaignId: pageState.campaign.id,
              name: pageState.entity.name,
              summary: pageState.entity.summary ?? "",
              type: pageState.entity.type,
            }}
            submitError={submitError}
            submitLabel="Save Entity"
            submitting={submitting}
            onRegistrationChange={handleRegistrationChange}
            onSubmit={handleSubmit}
          />
        </SectionPanel>
        <SectionPanel title="Record Context">
          <dl className="detail-list detail-list-compact">
            <div>
              <dt>Campaign</dt>
              <dd>{pageState.campaign.name}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{formatEntityTypeLabel(pageState.entity.type)}</dd>
            </div>
            <div>
              <dt>Last Updated</dt>
              <dd>{new Date(pageState.entity.updatedAt).toLocaleString()}</dd>
            </div>
          </dl>
        </SectionPanel>
      </div>
    </div>
  );
}
