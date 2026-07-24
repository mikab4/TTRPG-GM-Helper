import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

import { deleteCampaign, listCampaigns } from "../api/campaigns";
import { CampaignTable } from "../components/CampaignTable";
import { PageHeader } from "../components/PageHeader";
import { RequestStateBlock } from "../components/RequestStateBlock";
import { useCampaignDirectory } from "../app/CampaignDirectoryContext";
import type { Campaign } from "../types/campaigns";

type CampaignsRequestState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { campaigns: Campaign[]; status: "success" };

export function CampaignsPage() {
  const { refreshCampaigns } = useCampaignDirectory();
  const [requestState, setRequestState] = useState<CampaignsRequestState>({ status: "loading" });

  async function handleDelete(campaign: Campaign) {
    await deleteCampaign(campaign.id);
    await refreshCampaigns();
    setRequestState((currentState) =>
      currentState.status === "success"
        ? {
            campaigns: currentState.campaigns.filter((listedCampaign) => listedCampaign.id !== campaign.id),
            status: "success",
          }
        : currentState,
    );
  }

  useEffect(() => {
    const abortController = new AbortController();

    async function loadCampaigns() {
      try {
        const campaigns = await listCampaigns({ signal: abortController.signal });
        setRequestState({ campaigns, status: "success" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setRequestState({
          message: error instanceof Error ? error.message : "Unknown campaign load failure.",
          status: "error",
        });
      }
    }

    void loadCampaigns();

    return () => {
      abortController.abort();
    };
  }, []);

  return (
    <div className="page-stack workspace-surface">
      <PageHeader
        actions={
          <Link className="primary-button" to="/campaigns/new">
            New Campaign
          </Link>
        }
        title="Campaigns"
      />
      {requestState.status === "loading" ? (
        <RequestStateBlock message="Loading the campaign registry from the backend." title="Loading campaigns" />
      ) : null}
      {requestState.status === "error" ? (
        <RequestStateBlock message={requestState.message} title="Campaigns failed to load" tone="error" />
      ) : null}
      {requestState.status === "success" && requestState.campaigns.length === 0 ? (
        <RequestStateBlock
          message="Create the first campaign to start tracking world data, notes, and extracted entities."
          title="No campaigns yet"
        />
      ) : null}
      {requestState.status === "success" && requestState.campaigns.length > 0 ? (
        <CampaignTable campaigns={requestState.campaigns} onDelete={(campaign) => void handleDelete(campaign)} />
      ) : null}
    </div>
  );
}
