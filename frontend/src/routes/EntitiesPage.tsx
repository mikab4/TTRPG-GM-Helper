import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import { listCampaigns } from "../api/campaigns";
import { deleteEntity, listEntities } from "../api/entities";
import { CampaignEntityRoster } from "../components/CampaignEntityRoster";
import { EntityFilters } from "../components/EntityFilters";
import { EntityQuickLookPanel } from "../components/EntityQuickLookPanel";
import { PageHeader } from "../components/PageHeader";
import { RequestStateBlock } from "../components/RequestStateBlock";
import { SectionPanel } from "../components/SectionPanel";
import type { EntityTypeValue } from "../entities/entityTypes";
import type { Campaign } from "../types/campaigns";
import type { Entity } from "../types/entities";

type CampaignOptionsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { campaigns: Campaign[]; status: "ready" };

type EntityListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { entities: Entity[]; status: "ready" };

export function EntitiesPage() {
  const [campaignOptionsState, setCampaignOptionsState] = useState<CampaignOptionsState>({
    status: "loading",
  });
  const [entityListState, setEntityListState] = useState<EntityListState>({ status: "loading" });
  const [campaignId, setCampaignId] = useState("");
  const [entitySearch, setEntitySearch] = useState("");
  const [entityType, setEntityType] = useState<EntityTypeValue | "">("");
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);

  async function handleDelete(entity: Entity) {
    await deleteEntity(entity.campaignId, entity.id);
    setSelectedEntity(null);
    setEntityListState((currentState) =>
      currentState.status === "ready"
        ? { ...currentState, entities: currentState.entities.filter((listedEntity) => listedEntity.id !== entity.id) }
        : currentState,
    );
  }

  useEffect(() => {
    const abortController = new AbortController();

    async function loadCampaigns() {
      try {
        const campaigns = await listCampaigns({ signal: abortController.signal });
        setCampaignOptionsState({ campaigns, status: "ready" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setCampaignOptionsState({
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

  useEffect(() => {
    const abortController = new AbortController();

    async function loadEntities() {
      setEntityListState({ status: "loading" });

      try {
        const entities = await listEntities({
          campaignId: campaignId || undefined,
          entityType: entityType || undefined,
          signal: abortController.signal,
        });
        setEntityListState({ entities, status: "ready" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setEntityListState({
          message: error instanceof Error ? error.message : "Unknown entity load failure.",
          status: "error",
        });
      }
    }

    void loadEntities();

    return () => {
      abortController.abort();
    };
  }, [campaignId, entityType]);

  const campaignsById = useMemo(() => {
    if (campaignOptionsState.status !== "ready") {
      return new Map<string, Campaign>();
    }

    return new Map(campaignOptionsState.campaigns.map((campaign) => [campaign.id, campaign]));
  }, [campaignOptionsState]);

  const campaignNamesById = useMemo(
    () => new Map(Array.from(campaignsById.entries()).map(([nextCampaignId, campaign]) => [nextCampaignId, campaign.name])),
    [campaignsById],
  );

  const filteredEntities = useMemo(() => {
    if (entityListState.status !== "ready") {
      return [];
    }

    const normalizedSearch = entitySearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return entityListState.entities;
    }

    return entityListState.entities.filter((entity) => entity.name.toLowerCase().includes(normalizedSearch));
  }, [entityListState, entitySearch]);

  useEffect(() => {
    if (!selectedEntity) {
      return;
    }

    const selectedEntityStillVisible = filteredEntities.some((entity) => entity.id === selectedEntity.id);
    if (!selectedEntityStillVisible) {
      setSelectedEntity(null);
    }
  }, [filteredEntities, selectedEntity]);

  return (
    <div className="page-stack workspace-surface">
      <PageHeader
        actions={
          <Link className="primary-button" to="/entities/new">
            New Entity
          </Link>
        }
        description="Browse the world-facing index across campaigns, then open any record in its campaign-owned detail view."
        title="World Browser"
      />
      <SectionPanel title="Filters">
        {campaignOptionsState.status === "ready" ? (
          <EntityFilters
            campaignId={campaignId}
            campaigns={campaignOptionsState.campaigns}
            entitySearch={entitySearch}
            entityType={entityType}
            onCampaignIdChange={setCampaignId}
            onEntitySearchChange={setEntitySearch}
            onEntityTypeChange={setEntityType}
          />
        ) : null}
        {campaignOptionsState.status === "loading" ? (
          <RequestStateBlock message="Loading campaign filter options." title="Loading filters" />
        ) : null}
        {campaignOptionsState.status === "error" ? (
          <RequestStateBlock message={campaignOptionsState.message} title="Filters unavailable" tone="error" />
        ) : null}
      </SectionPanel>
      <div className="workspace-detail-layout">
        <SectionPanel title="World Entities">
          {entityListState.status === "loading" ? (
            <RequestStateBlock message="Loading entity records from the backend." title="Loading entities" />
          ) : null}
          {entityListState.status === "error" ? (
            <RequestStateBlock message={entityListState.message} title="Entities unavailable" tone="error" />
          ) : null}
          {entityListState.status === "ready" && filteredEntities.length === 0 ? (
            <RequestStateBlock message="No entities match the current search or filters." title="No entities found" />
          ) : null}
          {entityListState.status === "ready" && filteredEntities.length > 0 ? (
            <CampaignEntityRoster
              campaignNamesById={campaignNamesById}
              entities={filteredEntities}
              onQuickLook={setSelectedEntity}
              onDelete={(entity) => void handleDelete(entity)}
              showCampaignName
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
