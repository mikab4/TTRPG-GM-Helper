import { Link, useOutletContext } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import { listCampaignEntities } from "../api/entities";
import { deleteRelationship, listRelationships } from "../api/relationships";
import { RequestStateBlock } from "../components/RequestStateBlock";
import { SectionPanel } from "../components/SectionPanel";
import { buildEntityNameMap, buildRelationshipPhrase, formatRelationshipStatus } from "../relationships/presentation";
import type { Entity } from "../types/entities";
import type { Relationship } from "../types/relationships";
import type { CampaignWorkspaceContext } from "./CampaignWorkspacePage";

type RelationshipTabState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { entities: Entity[]; relationships: Relationship[]; status: "ready" };

export function CampaignRelationshipsTab() {
  const { campaign } = useOutletContext<CampaignWorkspaceContext>();
  const [relationshipState, setRelationshipState] = useState<RelationshipTabState>({
    status: "loading",
  });

  async function handleDelete(relationship: Relationship) {
    await deleteRelationship(campaign.id, relationship.id);
    setRelationshipState((currentState) =>
      currentState.status === "ready"
        ? {
            ...currentState,
            relationships: currentState.relationships.filter(
              (listedRelationship) => listedRelationship.id !== relationship.id,
            ),
          }
        : currentState,
    );
  }

  useEffect(() => {
    const abortController = new AbortController();

    async function loadRelationships() {
      try {
        const [entities, relationships] = await Promise.all([
          listCampaignEntities(campaign.id, undefined, abortController.signal),
          listRelationships(campaign.id, { signal: abortController.signal }),
        ]);
        setRelationshipState({ entities, relationships, status: "ready" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setRelationshipState({
          message: error instanceof Error ? error.message : "Unknown relationship load failure.",
          status: "error",
        });
      }
    }

    void loadRelationships();

    return () => {
      abortController.abort();
    };
  }, [campaign.id]);

  const entitiesById = useMemo(
    () =>
      relationshipState.status === "ready" ? buildEntityNameMap(relationshipState.entities) : new Map<string, Entity>(),
    [relationshipState],
  );

  const visibleRelationships = relationshipState.status === "ready" ? relationshipState.relationships : [];

  return (
    <div className="page-stack">
      <header className="workspace-section-header">
        <div>
          <h2 className="font-cinzel">Relationships</h2>
          <p>
            Connections that give <span className="workspace-campaign-name">{campaign.name}</span> its shape.
          </p>
        </div>
        <div className="section-actions">
          <Link className="primary-button" to={`/campaigns/${campaign.id}/relationships/new`}>
            New Relationship
          </Link>
          <Link className="secondary-button" to={`/campaigns/${campaign.id}/relationship-types`}>
            New Relationship Type
          </Link>
        </div>
      </header>
      <SectionPanel>
        {relationshipState.status === "loading" ? (
          <RequestStateBlock message="Loading campaign relationship records." title="Loading relationships" />
        ) : null}
        {relationshipState.status === "error" ? (
          <RequestStateBlock message={relationshipState.message} title="Relationships unavailable" tone="error" />
        ) : null}
        {relationshipState.status === "ready" && visibleRelationships.length === 0 ? (
          <RequestStateBlock
            message="No relationships match the current campaign context yet."
            title="No relationships found"
          />
        ) : null}
        {relationshipState.status === "ready" && visibleRelationships.length > 0 ? (
          <div className="relationship-list">
            {visibleRelationships.map((relationship) => (
              <article key={relationship.id} className="relationship-card">
                <div className="relationship-card-copy">
                  <strong>{buildRelationshipPhrase(relationship, entitiesById)}</strong>
                  <span>
                    {formatRelationshipStatus(relationship.lifecycleStatus)} ·{" "}
                    {formatRelationshipStatus(relationship.visibilityStatus)} ·{" "}
                    {formatRelationshipStatus(relationship.certaintyStatus)}
                  </span>
                  {relationship.notes ? <p>{relationship.notes}</p> : null}
                </div>
                <div className="relationship-card-actions">
                  <Link className="text-link" to={`/campaigns/${campaign.id}/relationships/${relationship.id}/edit`}>
                    Edit
                  </Link>
                  <button className="text-button" type="button" onClick={() => void handleDelete(relationship)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </SectionPanel>
    </div>
  );
}
