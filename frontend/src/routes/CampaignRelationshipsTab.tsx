import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import { listCampaignEntities } from "../api/entities";
import { deleteRelationship, listRelationships } from "../api/relationships";
import { listRelationshipTypes } from "../api/relationshipTypes";
import { RequestStateBlock } from "../components/RequestStateBlock";
import { SectionPanel } from "../components/SectionPanel";
import { buildEntityNameMap, buildRelationshipPhrase, formatRelationshipStatus } from "../relationships/presentation";
import type { Entity } from "../types/entities";
import type { Relationship } from "../types/relationships";
import type { RelationshipType } from "../types/relationshipTypes";
import type { CampaignWorkspaceContext } from "./CampaignWorkspacePage";

type RelationshipTabState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { entities: Entity[]; relationships: Relationship[]; relationshipTypes: RelationshipType[]; status: "ready" };

export function CampaignRelationshipsTab() {
  const { campaign } = useOutletContext<CampaignWorkspaceContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [relationshipState, setRelationshipState] = useState<RelationshipTabState>({
    status: "loading",
  });
  const [entityNameQuery, setEntityNameQuery] = useState("");
  const [isEntityPickerOpen, setIsEntityPickerOpen] = useState(false);
  const [activeEntityIndex, setActiveEntityIndex] = useState(0);
  const selectedEntityId = searchParams.get("entity_id") ?? "";
  const selectedRelationshipType = searchParams.get("relationship_type") ?? "";

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
        const [entities, relationships, relationshipTypes] = await Promise.all([
          listCampaignEntities(campaign.id, undefined, abortController.signal),
          listRelationships(campaign.id, { signal: abortController.signal }),
          listRelationshipTypes(campaign.id),
        ]);
        setRelationshipState({ entities, relationships, relationshipTypes, status: "ready" });
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

  const selectedEntity = relationshipState.status === "ready" ? entitiesById.get(selectedEntityId) : undefined;
  const entityPickerValue = entityNameQuery || selectedEntity?.name || "";
  const matchingEntities =
    relationshipState.status === "ready" && entityNameQuery
      ? relationshipState.entities.filter((entity) =>
          entity.name.toLocaleLowerCase().includes(entityNameQuery.toLocaleLowerCase()),
        )
      : [];
  const visibleRelationships =
    relationshipState.status === "ready"
      ? relationshipState.relationships.filter(
          (relationship) =>
            (!selectedEntityId ||
              relationship.sourceEntityId === selectedEntityId ||
              relationship.targetEntityId === selectedEntityId) &&
            (!selectedRelationshipType || relationship.relationshipType === selectedRelationshipType),
        )
      : [];

  function updateRelationshipFilters(entityId: string, relationshipType: string) {
    const nextSearchParams = new URLSearchParams(searchParams);

    if (entityId) {
      nextSearchParams.set("entity_id", entityId);
    } else {
      nextSearchParams.delete("entity_id");
    }

    if (relationshipType) {
      nextSearchParams.set("relationship_type", relationshipType);
    } else {
      nextSearchParams.delete("relationship_type");
    }

    setSearchParams(nextSearchParams);
  }

  function selectEntityFilter(entity: Entity) {
    setEntityNameQuery(entity.name);
    setIsEntityPickerOpen(false);
    updateRelationshipFilters(entity.id, selectedRelationshipType);
  }

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
        {relationshipState.status === "ready" ? (
          <div className="workspace-retrieval-toolbar workspace-relationship-toolbar">
            <div className="workspace-entity-picker">
              <label className="workspace-search-field">
                <span className="sr-only">Filter by entity</span>
                <input
                  aria-controls="relationship-entity-options"
                  aria-activedescendant={
                    isEntityPickerOpen && matchingEntities[activeEntityIndex]
                      ? `relationship-entity-option-${matchingEntities[activeEntityIndex].id}`
                      : undefined
                  }
                  aria-expanded={isEntityPickerOpen && matchingEntities.length > 0}
                  aria-label="Filter by entity"
                  autoComplete="off"
                  placeholder="Search an entity name…"
                  role="combobox"
                  type="search"
                  value={entityPickerValue}
                  onChange={(event) => {
                    setEntityNameQuery(event.target.value);
                    setIsEntityPickerOpen(true);
                    setActiveEntityIndex(0);
                  }}
                  onFocus={() => {
                    setIsEntityPickerOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown" && matchingEntities.length > 0) {
                      event.preventDefault();
                      setIsEntityPickerOpen(true);
                      setActiveEntityIndex((currentIndex) => Math.min(currentIndex + 1, matchingEntities.length - 1));
                    }

                    if (event.key === "ArrowUp" && matchingEntities.length > 0) {
                      event.preventDefault();
                      setIsEntityPickerOpen(true);
                      setActiveEntityIndex((currentIndex) => Math.max(currentIndex - 1, 0));
                    }

                    if (event.key === "Enter" && isEntityPickerOpen && matchingEntities[activeEntityIndex]) {
                      event.preventDefault();
                      selectEntityFilter(matchingEntities[activeEntityIndex]);
                    }

                    if (event.key === "Escape") {
                      setIsEntityPickerOpen(false);
                    }
                  }}
                  onBlur={() => {
                    window.setTimeout(() => {
                      setIsEntityPickerOpen(false);
                    }, 0);
                  }}
                />
              </label>
              {isEntityPickerOpen && matchingEntities.length > 0 ? (
                <ul id="relationship-entity-options" role="listbox" className="workspace-entity-picker-options">
                  {matchingEntities.map((entity, entityIndex) => (
                    <li
                      key={entity.id}
                      id={`relationship-entity-option-${entity.id}`}
                      role="option"
                      aria-selected={entityIndex === activeEntityIndex}
                      className="workspace-entity-picker-option"
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={() => {
                        selectEntityFilter(entity);
                      }}
                    >
                      {entity.name}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <label className="workspace-relationship-type-label">
              <span className="sr-only">Filter by relationship type</span>
              <select
                aria-label="Filter by relationship type"
                className="workspace-relationship-type-filter"
                value={selectedRelationshipType}
                onChange={(event) => {
                  updateRelationshipFilters(selectedEntityId, event.target.value);
                }}
              >
                <option value="">All relationship types</option>
                {relationshipState.relationshipTypes.map((relationshipType) => (
                  <option key={relationshipType.key} value={relationshipType.key}>
                    {relationshipType.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
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
