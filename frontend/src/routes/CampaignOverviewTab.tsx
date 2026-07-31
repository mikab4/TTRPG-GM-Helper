import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { useState } from "react";

import { useCampaignDirectory } from "../app/CampaignDirectoryContext";
import { CampaignDeleteDialog } from "../components/CampaignDeleteDialog";
import { SectionPanel } from "../components/SectionPanel";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import type { CampaignWorkspaceContext } from "./CampaignWorkspacePage";

export function CampaignOverviewTab() {
  const { campaign } = useOutletContext<CampaignWorkspaceContext>();
  const quickNotesStorageKey = `gm-workspace:campaign-quick-notes:${campaign.id}`;
  const { refreshCampaigns } = useCampaignDirectory();
  const [quickNotes, setQuickNotes] = useLocalStorageState(quickNotesStorageKey);
  const navigate = useNavigate();
  const [campaignPendingDeletion, setCampaignPendingDeletion] = useState(false);

  function handleDeletedCampaign() {
    setCampaignPendingDeletion(false);
    void navigate("/campaigns");
    void refreshCampaigns();
  }

  return (
    <div className="campaign-overview-layout">
      <header className="workspace-section-header">
        <div>
          <h2 className="font-cinzel">Overview</h2>
          <p>
            High-level status for <span className="workspace-campaign-name">{campaign.name}</span>.
          </p>
        </div>
        <div className="section-actions">
          <Link className="secondary-button" to={`/campaigns/${campaign.id}/edit`}>
            Edit Campaign
          </Link>
          <button
            className="danger-button"
            type="button"
            onClick={() => {
              setCampaignPendingDeletion(true);
            }}
          >
            Delete Campaign
          </button>
        </div>
      </header>
      <CampaignDeleteDialog
        campaign={campaignPendingDeletion ? campaign : null}
        onCancel={() => {
          setCampaignPendingDeletion(false);
        }}
        onDeleted={handleDeletedCampaign}
      />
      <SectionPanel title="Campaign Summary">
        <p className="campaign-summary-text">{campaign.description ?? "No description yet."}</p>
      </SectionPanel>
      <div className="campaign-overview-grid">
        <SectionPanel title="Recent Activity">
          <p className="campaign-support-copy">No recent activity is available yet.</p>
        </SectionPanel>
        <SectionPanel title="Quick Notes">
          <label className="sr-only" htmlFor="campaign-quick-notes">
            Quick Notes
          </label>
          <textarea
            id="campaign-quick-notes"
            className="campaign-quick-notes"
            placeholder="Draft session ideas..."
            rows={5}
            value={quickNotes}
            onChange={(event) => {
              setQuickNotes(event.target.value);
            }}
          />
        </SectionPanel>
      </div>
    </div>
  );
}
