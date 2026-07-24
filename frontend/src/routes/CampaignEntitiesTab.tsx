import { Link, useOutletContext } from "react-router-dom";
import { useEffect, useState } from "react";

import { listCampaignEntities } from "../api/entities";
import { deleteEntity } from "../api/entities";
import { listRelationships } from "../api/relationships";
import { CampaignEntityRoster } from "../components/CampaignEntityRoster";
import { EntityQuickLookPanel } from "../components/EntityQuickLookPanel";
import { RequestStateBlock } from "../components/RequestStateBlock";
import { SectionPanel } from "../components/SectionPanel";
import { buildEntityNameMap, buildImportantRelationshipPreview } from "../relationships/presentation";
import type { Entity } from "../types/entities";
import type { Relationship } from "../types/relationships";
import type { CampaignWorkspaceContext } from "./CampaignWorkspacePage";

type CampaignEntitiesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { entities: Entity[]; relationships: Relationship[]; status: "ready" };

export function CampaignEntitiesTab() {
  const { campaign } = useOutletContext<CampaignWorkspaceContext>();
  const [pageState, setPageState] = useState<CampaignEntitiesState>({ status: "loading" });
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);

  async function handleDelete(entity: Entity) {
    await deleteEntity(campaign.id, entity.id);
    setSelectedEntity(null);
    setPageState((currentState) =>
      currentState.status === "ready"
        ? { ...currentState, entities: currentState.entities.filter((listedEntity) => listedEntity.id !== entity.id) }
        : currentState,
    );
  }

  useEffect(() => {
    const abortController = new AbortController();

    async function loadEntities() {
      try {
        const entities = await listCampaignEntities(campaign.id, undefined, abortController.signal);
        let relationships: Relationship[] = [];

        try {
          relationships = await listRelationships(campaign.id, { signal: abortController.signal });
        } catch {
          relationships = [];
        }

        setPageState({ entities, relationships, status: "ready" });
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

    void loadEntities();

    return () => {
      abortController.abort();
    };
  }, [campaign.id]);

  const relationshipPreviewByEntityId =
    pageState.status === "ready"
      ? new Map(
          pageState.entities.map((entity) => [
            entity.id,
            buildImportantRelationshipPreview(entity.id, pageState.relationships, buildEntityNameMap(pageState.entities), 2),
          ]),
        )
      : new Map<string, string[]>();

  return (
    <div className="page-stack">
      <header className="workspace-section-header">
        <div>
          <h2 className="font-cinzel">Entities</h2>
          <p>
            People, places, factions, and things in <span className="workspace-campaign-name">{campaign.name}</span>.
          </p>
        </div>
        <div className="section-actions">
          <Link className="primary-button" to={`/campaigns/${campaign.id}/entities/new`}>
            New Entity
          </Link>
        </div>
      </header>
      <div className="campaign-entities-layout">
        <SectionPanel>
          {pageState.status === "loading" ? (
            <RequestStateBlock message="Loading this campaign's saved entities." title="Loading entities" />
          ) : null}
          {pageState.status === "error" ? (
            <RequestStateBlock message={pageState.message} title="Entities unavailable" tone="error" />
          ) : null}
          {pageState.status === "ready" && pageState.entities.length === 0 ? (
            <RequestStateBlock
              message="Add the first entity for this campaign from here to keep ownership context explicit."
              title="No campaign entities yet"
            />
          ) : null}
          {pageState.status === "ready" && pageState.entities.length > 0 ? (
            <CampaignEntityRoster
              entities={pageState.entities}
              relationshipPreviewByEntityId={relationshipPreviewByEntityId}
              onQuickLook={setSelectedEntity}
              onDelete={(entity) => void handleDelete(entity)}
            />
          ) : null}
        </SectionPanel>
        {selectedEntity ? (
          <EntityQuickLookPanel
            entity={selectedEntity}
            onClose={() => {
              setSelectedEntity(null);
            }}
            onDelete={(entity) => void handleDelete(entity)}
          />
        ) : null}
      </div>
    </div>
  );
}
