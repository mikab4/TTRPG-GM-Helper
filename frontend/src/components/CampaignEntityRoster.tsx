import { Link } from "react-router-dom";

import { formatEntityTypeLabel } from "../entities/entityTypes";
import type { Entity } from "../types/entities";

type CampaignEntityRosterProps = {
  campaignNamesById?: Map<string, string>;
  entities: Entity[];
  onDelete?: (entity: Entity) => void;
  onQuickLook?: (entity: Entity) => void;
  relationshipPreviewByEntityId?: Map<string, string[]>;
  showCampaignName?: boolean;
};

export function CampaignEntityRoster({
  campaignNamesById = new Map<string, string>(),
  entities,
  onDelete,
  onQuickLook,
  relationshipPreviewByEntityId = new Map<string, string[]>(),
  showCampaignName = false,
}: CampaignEntityRosterProps) {
  return (
    <div className="campaign-entity-roster">
      {entities.map((entity) => (
        <article
          key={entity.id}
          className="entity-roster-card"
          onClick={() => {
            onQuickLook?.(entity);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onQuickLook?.(entity);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="entity-roster-main">
            <div className="entity-roster-mark" aria-hidden="true">
              {formatEntityTypeLabel(entity.type).slice(0, 1).toUpperCase()}
            </div>
            <div className="entity-roster-copy">
              <div className="entity-roster-heading">
                <h4 className="entity-roster-title">{entity.name}</h4>
                <span className="entity-type-pill">{formatEntityTypeLabel(entity.type)}</span>
              </div>
              <p className="entity-roster-summary">{entity.summary ?? "No relationship scent recorded yet."}</p>
              {relationshipPreviewByEntityId.get(entity.id)?.length ? (
                <div className="relationship-preview-list">
                  {relationshipPreviewByEntityId.get(entity.id)?.map((relationshipPreview) => (
                    <span key={relationshipPreview} className="relationship-preview-pill">
                      {relationshipPreview}
                    </span>
                  ))}
                </div>
              ) : null}
              {showCampaignName ? (
                <p className="entity-roster-campaign">{campaignNamesById.get(entity.campaignId) ?? entity.campaignId}</p>
              ) : null}
            </div>
          </div>
          <div className="entity-roster-actions">
            <Link
              aria-label={`Edit ${entity.name}`}
              className="text-link"
              to={`/campaigns/${entity.campaignId}/entities/${entity.id}/edit`}
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              Edit
            </Link>
            {onDelete ? (
              <button
                aria-label={`Delete ${entity.name}`}
                className="text-button"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(entity);
                }}
              >
                Delete
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
