import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import { listCampaignEntities } from "../api/entities";
import { listRelationships } from "../api/relationships";
import { formatEntityTypeLabel } from "../entities/entityTypes";
import { RELATIONSHIP_ENTITY_FILTER_PARAM } from "../relationships/domain";
import { buildEntityNameMap, buildImportantRelationshipPreview } from "../relationships/presentation";
import type { Entity } from "../types/entities";
import type { Relationship } from "../types/relationships";

type EntityQuickLookPanelProps = {
  entity: Entity;
  isDeleting?: boolean;
  onClose: () => void;
  onDelete?: (entity: Entity) => void;
};

export function EntityQuickLookPanel({ entity, isDeleting = false, onClose, onDelete }: EntityQuickLookPanelProps) {
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const relationshipSearchParams = new URLSearchParams({ [RELATIONSHIP_ENTITY_FILTER_PARAM]: entity.id });

  useEffect(() => {
    const abortController = new AbortController();

    async function loadRelationshipContext() {
      try {
        const [loadedEntities, loadedRelationships] = await Promise.all([
          listCampaignEntities(entity.campaignId, undefined, abortController.signal),
          listRelationships(entity.campaignId, { signal: abortController.signal }),
        ]);
        setEntities(loadedEntities);
        setRelationships(loadedRelationships);
      } catch {
        setEntities([]);
        setRelationships([]);
      }
    }

    void loadRelationshipContext();

    return () => {
      abortController.abort();
    };
  }, [entity.campaignId]);

  const relationshipPreview = useMemo(
    () => buildImportantRelationshipPreview(entity.id, relationships, buildEntityNameMap(entities), 3),
    [entities, entity.id, relationships],
  );

  return (
    <aside aria-label="Entity quick look" className="quick-look-panel quick-look-panel-paper">
      <div className="quick-look-header">
        <div>
          <p className="eyebrow">{formatEntityTypeLabel(entity.type)}</p>
          <h3>{entity.name}</h3>
        </div>
        <button className="icon-button" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="quick-look-body">
        <section className="quick-look-section">
          <h4>Summary</h4>
          <p>{entity.summary ?? "No summary recorded yet."}</p>
        </section>
        <section className="quick-look-section">
          <h4>Relationships</h4>
          {relationshipPreview.length > 0 ? (
            <div className="quick-look-list">
              {relationshipPreview.map((relationshipPhrase) => (
                <p key={relationshipPhrase}>{relationshipPhrase}</p>
              ))}
            </div>
          ) : (
            <p>No major relationships recorded yet.</p>
          )}
        </section>
      </div>
      <div className="quick-look-actions">
        <Link className="secondary-button" to={`/campaigns/${entity.campaignId}/entities/${entity.id}`}>
          Full Profile
        </Link>
        <Link className="secondary-button" to={`/campaigns/${entity.campaignId}/relationships?${relationshipSearchParams}`}>
          Relationship Management
        </Link>
        <Link className="primary-button" to={`/campaigns/${entity.campaignId}/entities/${entity.id}/edit`}>
          Edit Entity
        </Link>
        {onDelete ? (
          <button
            className="danger-button"
            disabled={isDeleting}
            type="button"
            onClick={() => {
              onDelete(entity);
            }}
          >
            {isDeleting ? "Deleting..." : "Delete Entity"}
          </button>
        ) : null}
      </div>
    </aside>
  );
}
