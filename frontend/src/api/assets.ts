import { apiRequest } from "./client";
import type { SourceAsset, SourceAssetCreate, SourceAssetMediaFamily, SourceAssetUpdate } from "../types/assets";

type AssetRequestOptions = { signal?: AbortSignal };

function parseAsset(payload: unknown): SourceAsset {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("id" in payload) ||
    typeof payload.id !== "string" ||
    !("campaign_id" in payload) ||
    typeof payload.campaign_id !== "string" ||
    !("session_id" in payload) ||
    !(typeof payload.session_id === "string" || payload.session_id === null) ||
    !("title" in payload) ||
    !(typeof payload.title === "string" || payload.title === null) ||
    !("truth_status" in payload) ||
    (payload.truth_status !== "canonical" &&
      payload.truth_status !== "subjective" &&
      payload.truth_status !== "uncertain") ||
    !("media_type" in payload) ||
    typeof payload.media_type !== "string" ||
    !("original_filename" in payload) ||
    typeof payload.original_filename !== "string" ||
    !("file_size_bytes" in payload) ||
    typeof payload.file_size_bytes !== "number" ||
    !("lifecycle_status" in payload) ||
    typeof payload.lifecycle_status !== "string" ||
    !("storage_status" in payload) ||
    typeof payload.storage_status !== "string" ||
    !("metadata" in payload) ||
    typeof payload.metadata !== "object" ||
    payload.metadata === null ||
    Array.isArray(payload.metadata) ||
    !("created_at" in payload) ||
    typeof payload.created_at !== "string" ||
    !("updated_at" in payload) ||
    typeof payload.updated_at !== "string"
  )
    throw new Error("Invalid asset response payload.");

  return {
    campaignId: payload.campaign_id,
    createdAt: payload.created_at,
    fileSizeBytes: payload.file_size_bytes,
    id: payload.id,
    lifecycleStatus: payload.lifecycle_status,
    mediaType: payload.media_type,
    metadata: payload.metadata as Record<string, object>,
    originalFilename: payload.original_filename,
    sessionId: payload.session_id,
    storageStatus: payload.storage_status,
    title: payload.title,
    truthStatus: payload.truth_status,
    updatedAt: payload.updated_at,
  };
}

export async function listAssets(
  campaignId: string,
  options: AssetRequestOptions & { mediaFamily?: SourceAssetMediaFamily } = {},
): Promise<SourceAsset[]> {
  const query = options.mediaFamily ? `?media_family=${options.mediaFamily}` : "";
  const payload = await apiRequest(`/campaigns/${campaignId}/assets${query}`, { signal: options.signal });
  if (!Array.isArray(payload)) throw new Error("Invalid asset list response payload.");
  return payload.map(parseAsset);
}

export async function getAsset(
  campaignId: string,
  assetId: string,
  options: AssetRequestOptions = {},
): Promise<SourceAsset> {
  return parseAsset(await apiRequest(`/campaigns/${campaignId}/assets/${assetId}`, { signal: options.signal }));
}

export async function createAsset(campaignId: string, assetCreate: SourceAssetCreate): Promise<SourceAsset> {
  const formData = new FormData();
  formData.set("file", assetCreate.file);
  formData.set("truth_status", assetCreate.truthStatus);
  if (assetCreate.title) formData.set("title", assetCreate.title);
  if (assetCreate.sessionId) formData.set("session_id", assetCreate.sessionId);
  return parseAsset(await apiRequest(`/campaigns/${campaignId}/assets`, { body: formData, method: "POST" }));
}

export async function updateAsset(
  campaignId: string,
  assetId: string,
  assetUpdate: SourceAssetUpdate,
): Promise<SourceAsset> {
  const payload = {
    ...(assetUpdate.metadata !== undefined ? { metadata: assetUpdate.metadata } : {}),
    ...(assetUpdate.sessionId !== undefined ? { session_id: assetUpdate.sessionId } : {}),
    ...(assetUpdate.title !== undefined ? { title: assetUpdate.title } : {}),
    ...(assetUpdate.truthStatus !== undefined ? { truth_status: assetUpdate.truthStatus } : {}),
  };
  return parseAsset(
    await apiRequest(`/campaigns/${campaignId}/assets/${assetId}`, {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    }),
  );
}

export async function deleteAsset(campaignId: string, assetId: string): Promise<void> {
  await apiRequest(`/campaigns/${campaignId}/assets/${assetId}`, { method: "DELETE" });
}
