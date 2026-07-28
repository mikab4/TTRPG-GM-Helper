import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";

import { listCampaigns } from "../api/campaigns";
import { createEntity } from "../api/entities";
import { EntityForm, type EntityFormValues } from "../components/EntityForm";
import { PageHeader } from "../components/PageHeader";
import { RequestStateBlock } from "../components/RequestStateBlock";
import { SectionPanel } from "../components/SectionPanel";
import type { Campaign } from "../types/campaigns";
import type { UnsavedChangesRegistration } from "../app/UnsavedChangesContext";

type EntityFormPageProps = {
  source: "campaign" | "global";
};

type CampaignOptionsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { campaigns: Campaign[]; status: "ready" };

export function EntityFormPage({ source }: EntityFormPageProps) {
  const navigate = useNavigate();
  const { campaignId } = useParams();
  const [campaignOptionsState, setCampaignOptionsState] = useState<CampaignOptionsState>(
    source === "global" ? { status: "loading" } : { campaigns: [], status: "ready" },
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (source !== "global") {
      return;
    }

    const abortController = new AbortController();

    async function loadCampaigns() {
      try {
        const campaigns = await listCampaigns({ signal: abortController.signal });
        setCampaignOptionsState({ campaigns, status: "ready" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setCampaignOptionsState({
          message: error instanceof Error ? error.message : "Unknown campaign load failure.",
          status: "error",
        });
      }
    }

    void loadCampaigns();

    return () => {
      abortController.abort();
    };
  }, [source]);

  async function handleSubmit(values: EntityFormValues, registration: UnsavedChangesRegistration) {
    setSubmitting(true);
    setSubmitError(null);

    try {
      const createdEntity = await createEntity(values.campaignId, {
        metadata: {},
        name: values.name,
        summary: values.summary.trim() || null,
        type: values.type,
      });
      registration.markCleanAndNavigate(() => {
        void navigate(`/campaigns/${createdEntity.campaignId}/entities/${createdEntity.id}`);
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unknown entity save failure.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-stack workspace-surface">
      <PageHeader
        actions={
          <Link
            className="secondary-button"
            to={source === "campaign" && campaignId ? `/campaigns/${campaignId}/entities` : "/entities"}
          >
            Cancel
          </Link>
        }
        eyebrow="Entity Editor"
        title="New Entity"
      />
      {campaignOptionsState.status === "loading" ? (
        <RequestStateBlock message="Loading campaign choices for the entity form." title="Loading form" />
      ) : null}
      {campaignOptionsState.status === "error" ? (
        <RequestStateBlock message={campaignOptionsState.message} title="Form unavailable" tone="error" />
      ) : null}
      {campaignOptionsState.status === "ready" ? (
        <SectionPanel title="Entity Details">
          <EntityForm
            campaignOptions={campaignOptionsState.campaigns}
            fixedCampaignId={source === "campaign" ? campaignId : undefined}
            initialValues={{
              campaignId: "",
              name: "",
              summary: "",
              type: "",
            }}
            submitError={submitError}
            submitLabel="Create Entity"
            submitting={submitting}
            onSubmit={handleSubmit}
          />
        </SectionPanel>
      ) : null}
    </div>
  );
}
