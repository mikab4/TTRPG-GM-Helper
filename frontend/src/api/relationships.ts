import { apiRequest } from "./client";
import {
  isRelationshipCertaintyStatusValue,
  isRelationshipLifecycleStatusValue,
  isRelationshipVisibilityStatusValue,
  type RelationshipFamilyValue,
} from "../relationships/domain";
import type { Relationship, RelationshipCreate, RelationshipUpdate } from "../types/relationships";

type RelationshipListOptions = {
  relationshipFamily?: RelationshipFamilyValue;
  relationshipType?: string;
  signal?: AbortSignal;
};

function parseRelationship(payload: unknown): Relationship {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("id" in payload) ||
    typeof payload.id !== "string" ||
    !("campaign_id" in payload) ||
    typeof payload.campaign_id !== "string" ||
    !("source_entity_id" in payload) ||
    typeof payload.source_entity_id !== "string" ||
    !("target_entity_id" in payload) ||
    typeof payload.target_entity_id !== "string" ||
    !("relationship_type" in payload) ||
    typeof payload.relationship_type !== "string" ||
    !("relationship_family" in payload) ||
    typeof payload.relationship_family !== "string" ||
    !("relationship_family_label" in payload) ||
    typeof payload.relationship_family_label !== "string" ||
    !("forward_label" in payload) ||
    typeof payload.forward_label !== "string" ||
    !("reverse_label" in payload) ||
    typeof payload.reverse_label !== "string" ||
    !("is_symmetric" in payload) ||
    typeof payload.is_symmetric !== "boolean" ||
    !("lifecycle_status" in payload) ||
    typeof payload.lifecycle_status !== "string" ||
    !isRelationshipLifecycleStatusValue(payload.lifecycle_status) ||
    !("visibility_status" in payload) ||
    typeof payload.visibility_status !== "string" ||
    !isRelationshipVisibilityStatusValue(payload.visibility_status) ||
    !("certainty_status" in payload) ||
    typeof payload.certainty_status !== "string" ||
    !isRelationshipCertaintyStatusValue(payload.certainty_status) ||
    !("notes" in payload) ||
    !(typeof payload.notes === "string" || payload.notes === null) ||
    !("confidence" in payload) ||
    !(typeof payload.confidence === "number" || payload.confidence === null) ||
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
    throw new Error("Invalid relationship response payload.");
  }

  return {
    id: payload.id,
    campaignId: payload.campaign_id,
    sourceEntityId: payload.source_entity_id,
    targetEntityId: payload.target_entity_id,
    relationshipType: payload.relationship_type,
    relationshipFamily: payload.relationship_family,
    relationshipFamilyLabel: payload.relationship_family_label,
    forwardLabel: payload.forward_label,
    reverseLabel: payload.reverse_label,
    isSymmetric: payload.is_symmetric,
    lifecycleStatus: payload.lifecycle_status,
    visibilityStatus: payload.visibility_status,
    certaintyStatus: payload.certainty_status,
    notes: payload.notes,
    confidence: payload.confidence,
    sourceAssetId: payload.source_asset_id,
    provenanceExcerpt: payload.provenance_excerpt,
    provenanceData: payload.provenance_data as Record<string, unknown>,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
  };
}

function parseRelationshipList(payload: unknown): Relationship[] {
  if (!Array.isArray(payload)) {
    throw new Error("Invalid relationship list response payload.");
  }

  return payload.map(parseRelationship);
}

function buildRelationshipQueryString(options: RelationshipListOptions): string {
  const searchParams = new URLSearchParams();

  if (options.relationshipType) {
    searchParams.set("type", options.relationshipType);
  }

  if (options.relationshipFamily) {
    searchParams.set("family", options.relationshipFamily);
  }

  const encodedSearchParams = searchParams.toString();
  return encodedSearchParams ? `?${encodedSearchParams}` : "";
}

function serializeRelationshipCreate(relationshipCreate: RelationshipCreate): string {
  return JSON.stringify({
    source_entity_id: relationshipCreate.sourceEntityId,
    target_entity_id: relationshipCreate.targetEntityId,
    relationship_type: relationshipCreate.relationshipType,
    lifecycle_status: relationshipCreate.lifecycleStatus,
    visibility_status: relationshipCreate.visibilityStatus,
    certainty_status: relationshipCreate.certaintyStatus,
    notes: relationshipCreate.notes,
  });
}

function serializeRelationshipUpdate(relationshipUpdate: RelationshipUpdate): string {
  const payload: Record<string, string | null> = {};

  if (relationshipUpdate.relationshipType !== undefined) {
    payload.relationship_type = relationshipUpdate.relationshipType;
  }

  if (relationshipUpdate.lifecycleStatus !== undefined) {
    payload.lifecycle_status = relationshipUpdate.lifecycleStatus;
  }

  if (relationshipUpdate.visibilityStatus !== undefined) {
    payload.visibility_status = relationshipUpdate.visibilityStatus;
  }

  if (relationshipUpdate.certaintyStatus !== undefined) {
    payload.certainty_status = relationshipUpdate.certaintyStatus;
  }

  if (relationshipUpdate.notes !== undefined) {
    payload.notes = relationshipUpdate.notes;
  }

  return JSON.stringify(payload);
}

export async function listRelationships(campaignId: string, options: RelationshipListOptions = {}): Promise<Relationship[]> {
  const payload = await apiRequest(`/campaigns/${campaignId}/relationships${buildRelationshipQueryString(options)}`, {
    signal: options.signal,
  });
  return parseRelationshipList(payload);
}

export async function getRelationship(
  campaignId: string,
  relationshipId: string,
  signal?: AbortSignal,
): Promise<Relationship> {
  const payload = await apiRequest(`/campaigns/${campaignId}/relationships/${relationshipId}`, {
    signal,
  });
  return parseRelationship(payload);
}

export async function createRelationship(campaignId: string, relationshipCreate: RelationshipCreate): Promise<Relationship> {
  const payload = await apiRequest(`/campaigns/${campaignId}/relationships`, {
    body: serializeRelationshipCreate(relationshipCreate),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return parseRelationship(payload);
}

export async function updateRelationship(
  campaignId: string,
  relationshipId: string,
  relationshipUpdate: RelationshipUpdate,
): Promise<Relationship> {
  const payload = await apiRequest(`/campaigns/${campaignId}/relationships/${relationshipId}`, {
    body: serializeRelationshipUpdate(relationshipUpdate),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
  return parseRelationship(payload);
}

export async function deleteRelationship(campaignId: string, relationshipId: string): Promise<void> {
  await apiRequest(`/campaigns/${campaignId}/relationships/${relationshipId}`, {
    method: "DELETE",
  });
}
