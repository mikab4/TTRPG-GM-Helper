import { Link } from "react-router-dom";

import type { Campaign } from "../types/campaigns";

type CampaignTableProps = {
  campaigns: Campaign[];
  onDelete: (campaign: Campaign) => void;
};

export function CampaignTable({ campaigns, onDelete }: CampaignTableProps) {
  return (
    <div className="campaign-card-list">
      {campaigns.map((campaign) => (
        <article key={campaign.id} className="campaign-card">
          <Link
            aria-label={`Open workspace for ${campaign.name}`}
            className="campaign-card-copy"
            to={`/campaigns/${campaign.id}`}
          >
            <h3 className="campaign-card-title">{campaign.name}</h3>
          </Link>
          <div className="campaign-card-actions">
            <button
              aria-label={`Delete ${campaign.name}`}
              className="text-button"
              type="button"
              onClick={() => {
                onDelete(campaign);
              }}
            >
              Delete
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
