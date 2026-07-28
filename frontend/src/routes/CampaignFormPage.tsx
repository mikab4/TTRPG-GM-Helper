import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";

import { createCampaign, getCampaign, updateCampaign } from "../api/campaigns";
import { getDefaultOwner } from "../api/owners";
import { CampaignForm } from "../components/CampaignForm";
import { PageHeader } from "../components/PageHeader";
import { RequestStateBlock } from "../components/RequestStateBlock";
import { SectionPanel } from "../components/SectionPanel";
import { useCampaignDirectory } from "../app/CampaignDirectoryContext";
import type { UnsavedChangesRegistration } from "../app/UnsavedChangesContext";

type CampaignFormPageProps = {
  mode: "create" | "edit";
};

type CampaignFormState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      initialDescription: string;
      initialName: string;
      ownerId: string;
      status: "ready";
    };

export function CampaignFormPage({ mode }: CampaignFormPageProps) {
  const navigate = useNavigate();
  const { refreshCampaigns } = useCampaignDirectory();
  const { campaignId } = useParams();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pageState, setPageState] = useState<CampaignFormState>({ status: "loading" });

  useEffect(() => {
    const abortController = new AbortController();

    async function loadPageState() {
      try {
        if (mode === "create") {
          const owner = await getDefaultOwner({ signal: abortController.signal });
          setPageState({
            initialDescription: "",
            initialName: "",
            ownerId: owner.id,
            status: "ready",
          });
          return;
        }

        if (!campaignId) {
          setPageState({ message: "Campaign route is missing an identifier.", status: "error" });
          return;
        }

        const campaign = await getCampaign(campaignId, { signal: abortController.signal });
        setPageState({
          initialDescription: campaign.description ?? "",
          initialName: campaign.name,
          ownerId: campaign.ownerId,
          status: "ready",
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setPageState({
          message: error instanceof Error ? error.message : "Unknown campaign load failure.",
          status: "error",
        });
      }
    }

    void loadPageState();

    return () => {
      abortController.abort();
    };
  }, [campaignId, mode]);

  async function handleSubmit(values: { description: string; name: string }, registration: UnsavedChangesRegistration) {
    if (pageState.status !== "ready") {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      if (mode === "create") {
        const createdCampaign = await createCampaign({
          description: values.description.trim() || null,
          name: values.name,
          ownerId: pageState.ownerId,
        });
        await refreshCampaigns();
        registration.markCleanAndNavigate(() => {
          void navigate(`/campaigns/${createdCampaign.id}`);
        });
        return;
      }

      if (!campaignId) {
        throw new Error("Campaign route is missing an identifier.");
      }

      const updatedCampaign = await updateCampaign(campaignId, {
        description: values.description.trim() || null,
        name: values.name,
      });
      await refreshCampaigns();
      registration.markCleanAndNavigate(() => {
        void navigate(`/campaigns/${updatedCampaign.id}`);
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unknown campaign save failure.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-stack workspace-surface">
      <PageHeader
        actions={
          <Link className="secondary-button" to={mode === "edit" && campaignId ? `/campaigns/${campaignId}` : "/campaigns"}>
            Cancel
          </Link>
        }
        eyebrow="Campaign Editor"
        title={mode === "create" ? "New Campaign" : "Edit Campaign"}
      />
      {pageState.status === "loading" ? (
        <RequestStateBlock message="Preparing the campaign editor and local owner context." title="Loading form" />
      ) : null}
      {pageState.status === "error" ? (
        <RequestStateBlock message={pageState.message} title="Form unavailable" tone="error" />
      ) : null}
      {pageState.status === "ready" ? (
        <SectionPanel title={mode === "create" ? "Campaign Details" : "Update Campaign"}>
          <CampaignForm
            initialValues={{
              description: pageState.initialDescription,
              name: pageState.initialName,
            }}
            submitError={submitError}
            submitLabel={mode === "create" ? "Create Campaign" : "Save Campaign"}
            submitting={submitting}
            onSubmit={handleSubmit}
          />
        </SectionPanel>
      ) : null}
    </div>
  );
}
