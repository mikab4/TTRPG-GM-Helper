import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { useState } from "react";

import { deleteCampaign } from "../api/campaigns";
import { useCampaignDirectory } from "../app/CampaignDirectoryContext";
import { SectionPanel } from "../components/SectionPanel";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import type { CampaignWorkspaceContext } from "./CampaignWorkspacePage";

export function CampaignOverviewTab() {
  const { campaign } = useOutletContext<CampaignWorkspaceContext>();
  const quickNotesStorageKey = `gm-workspace:campaign-quick-notes:${campaign.id}`;
  const { refreshCampaigns } = useCampaignDirectory();
  const [quickNotes, setQuickNotes] = useLocalStorageState(quickNotesStorageKey);
  const navigate = useNavigate();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteCampaign() {
    if (deleting) {
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    try {
      await deleteCampaign(campaign.id);
      await refreshCampaigns();
      void navigate("/campaigns");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unknown campaign delete failure.");
    } finally {
      setDeleting(false);
    }
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
          <button className="danger-button" disabled={deleting} type="button" onClick={() => void handleDeleteCampaign()}>
            {deleting ? "Deleting..." : "Delete Campaign"}
          </button>
        </div>
      </header>
      {deleteError ? <p className="field-error">{deleteError}</p> : null}
      <SectionPanel title="Campaign Summary">
        <p className="campaign-summary-text">{campaign.description ?? "No description yet."}</p>
      </SectionPanel>
      <div className="campaign-overview-grid">
        <SectionPanel title="Recent Activity">
          <p className="campaign-support-copy">Syncing with chronological log...</p>
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
