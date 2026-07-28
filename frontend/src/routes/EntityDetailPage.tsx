import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";

import { getCampaign } from "../api/campaigns";
import { deleteEntity, getEntity, listCampaignEntities } from "../api/entities";
import { listRelationships } from "../api/relationships";
import { PageHeader } from "../components/PageHeader";
import { RequestStateBlock } from "../components/RequestStateBlock";
import { SectionPanel } from "../components/SectionPanel";
import { formatEntityTypeLabel } from "../entities/entityTypes";
import { RELATIONSHIP_ENTITY_FILTER_PARAM } from "../relationships/domain";
import { buildEntityNameMap, groupEntityRelationships } from "../relationships/presentation";
import type { Campaign } from "../types/campaigns";
import type { Entity } from "../types/entities";
import type { Relationship } from "../types/relationships";

type EntityDetailState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      campaign: Campaign;
      entity: Entity;
      relationships: Relationship[];
      relatedEntities: Entity[];
      status: "ready";
    };

export function EntityDetailPage() {
  const navigate = useNavigate();
  const { campaignId, entityId } = useParams();
  const [pageState, setPageState] = useState<EntityDetailState>({ status: "loading" });
  const [deleting, setDeleting] = useState(false);

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

        let relatedEntities: Entity[] = [];
        let relationships: Relationship[] = [];

        try {
          [relatedEntities, relationships] = await Promise.all([
            listCampaignEntities(campaignId, undefined, abortController.signal),
            listRelationships(campaignId, { signal: abortController.signal }),
          ]);
        } catch {
          relatedEntities = [entity];
          relationships = [];
        }

        setPageState({ campaign, entity, relatedEntities, relationships, status: "ready" });
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

  async function handleDelete() {
    if (pageState.status !== "ready" || deleting) {
      return;
    }

    setDeleting(true);
    try {
      await deleteEntity(pageState.campaign.id, pageState.entity.id);
      await navigate(`/campaigns/${pageState.campaign.id}/entities`);
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

  const groupedRelationships = groupEntityRelationships(
    pageState.entity.id,
    pageState.relationships,
    buildEntityNameMap(pageState.relatedEntities),
  );
  const relationshipSearchParams = new URLSearchParams({ [RELATIONSHIP_ENTITY_FILTER_PARAM]: pageState.entity.id });

  return (
    <div className="page-stack workspace-surface">
      <PageHeader
        actions={
          <div className="action-row">
            <Link
              className="secondary-button"
              to={`/campaigns/${pageState.campaign.id}/relationships?${relationshipSearchParams}`}
            >
              Relationships
            </Link>
            <Link className="primary-button" to={`/campaigns/${pageState.campaign.id}/entities/${pageState.entity.id}/edit`}>
              Edit Entity
            </Link>
            <button className="danger-button" disabled={deleting} type="button" onClick={() => void handleDelete()}>
              {deleting ? "Deleting..." : "Delete Entity"}
            </button>
          </div>
        }
        description={`Campaign: ${pageState.campaign.name}`}
        eyebrow={formatEntityTypeLabel(pageState.entity.type)}
        title={pageState.entity.name}
      />
      <div className="entity-page-grid">
        <SectionPanel title="Summary">
          <p>{pageState.entity.summary ?? "No summary recorded yet."}</p>
        </SectionPanel>
        <SectionPanel title="Record Details">
          <dl className="detail-list detail-list-compact">
            <div>
              <dt>Type</dt>
              <dd>{formatEntityTypeLabel(pageState.entity.type)}</dd>
            </div>
            <div>
              <dt>Appears In</dt>
              <dd>{pageState.campaign.name}</dd>
            </div>
            <div>
              <dt>Last Updated</dt>
              <dd>{new Date(pageState.entity.updatedAt).toLocaleString()}</dd>
            </div>
          </dl>
        </SectionPanel>
        <SectionPanel title="Relationship Profile">
          {groupedRelationships.length > 0 ? (
            <div className="grouped-relationship-sections">
              {groupedRelationships.map((relationshipGroup) => (
                <section key={relationshipGroup.family} className="relationship-group">
                  <h4>{relationshipGroup.family}</h4>
                  <ul className="relationship-group-list">
                    {relationshipGroup.phrases.map((relationshipPhrase) => (
                      <li key={relationshipPhrase}>{relationshipPhrase}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <p>No grouped relationships recorded yet.</p>
          )}
        </SectionPanel>
      </div>
    </div>
  );
}
