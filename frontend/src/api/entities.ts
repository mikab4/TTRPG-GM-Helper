import { apiRequest } from "./client";
import type { EntityTypeValue } from "../entities/entityTypes";
import type { Entity, EntityCreate, EntityUpdate } from "../types/entities";

function parseEntity(payload: unknown): Entity {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("id" in payload) ||
    typeof payload.id !== "string" ||
    !("campaign_id" in payload) ||
    typeof payload.campaign_id !== "string" ||
    !("type" in payload) ||
    typeof payload.type !== "string" ||
    !("name" in payload) ||
    typeof payload.name !== "string" ||
    !("summary" in payload) ||
    !(typeof payload.summary === "string" || payload.summary === null) ||
    !("metadata" in payload) ||
    typeof payload.metadata !== "object" ||
    payload.metadata === null ||
    !("source_asset_id" in payload) ||
    !(typeof payload.source_asset_id === "string" || payload.source_asset_id === null) ||
    !("provenance_excerpt" in payload) ||
    !(typeof payload.provenance_excerpt === "string" || payload.provenance_excerpt === null) ||
    !("provenance_data" in payload) ||
    typeof payload.provenance_data !== "object" ||
    payload.provenance_data === null ||
    !("created_at" in payload) ||
    typeof payload.created_at !== "string" ||
    !("updated_at" in payload) ||
    typeof payload.updated_at !== "string"
  ) {
    throw new Error("Invalid entity response payload.");
  }

  return {
    id: payload.id,
    campaignId: payload.campaign_id,
    type: payload.type,
    name: payload.name,
    summary: payload.summary,
    metadata: payload.metadata as Record<string, unknown>,
    sourceAssetId: payload.source_asset_id,
    provenanceExcerpt: payload.provenance_excerpt,
    provenanceData: payload.provenance_data as Record<string, unknown>,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
  };
}

function parseEntityList(payload: unknown): Entity[] {
  if (!Array.isArray(payload)) {
    throw new Error("Invalid entity list response payload.");
  }

  return payload.map(parseEntity);
}

function serializeEntityCreate(entityCreate: EntityCreate): string {
  return JSON.stringify({
    type: entityCreate.type,
    name: entityCreate.name,
    summary: entityCreate.summary,
    metadata: entityCreate.metadata,
  });
}

function serializeEntityUpdate(entityUpdate: EntityUpdate): string {
  const payload: Record<string, string | null | Record<string, unknown>> = {};

  if (entityUpdate.type !== undefined) {
    payload.type = entityUpdate.type;
  }

  if (entityUpdate.name !== undefined) {
    payload.name = entityUpdate.name;
  }

  if (entityUpdate.summary !== undefined) {
    payload.summary = entityUpdate.summary;
  }

  if (entityUpdate.metadata !== undefined) {
    payload.metadata = entityUpdate.metadata;
  }

  return JSON.stringify(payload);
}

function buildEntityTypeQueryString(entityType?: EntityTypeValue): string {
  const searchParams = new URLSearchParams();

  if (entityType) {
    searchParams.set("type", entityType);
  }

  const encodedSearchParams = searchParams.toString();
  return encodedSearchParams ? `?${encodedSearchParams}` : "";
}

export async function listCampaignEntities(
  campaignId: string,
  entityType?: EntityTypeValue,
  signal?: AbortSignal,
): Promise<Entity[]> {
  const payload = await apiRequest(`/campaigns/${campaignId}/entities${buildEntityTypeQueryString(entityType)}`, {
    signal,
  });
  return parseEntityList(payload);
}

export async function getEntity(campaignId: string, entityId: string, signal?: AbortSignal): Promise<Entity> {
  const payload = await apiRequest(`/campaigns/${campaignId}/entities/${entityId}`, {
    signal,
  });
  return parseEntity(payload);
}

export async function createEntity(campaignId: string, entityCreate: EntityCreate): Promise<Entity> {
  const payload = await apiRequest(`/campaigns/${campaignId}/entities`, {
    body: serializeEntityCreate(entityCreate),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  return parseEntity(payload);
}

export async function updateEntity(campaignId: string, entityId: string, entityUpdate: EntityUpdate): Promise<Entity> {
  const payload = await apiRequest(`/campaigns/${campaignId}/entities/${entityId}`, {
    body: serializeEntityUpdate(entityUpdate),
    headers: {
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });
  return parseEntity(payload);
}

export async function deleteEntity(campaignId: string, entityId: string): Promise<void> {
  await apiRequest(`/campaigns/${campaignId}/entities/${entityId}`, {
    method: "DELETE",
  });
}
