import type { EntityTypeValue } from "../entities/entityTypes";

export type Entity = {
  id: string;
  campaignId: string;
  type: string;
  name: string;
  summary: string | null;
  metadata: Record<string, unknown>;
  sourceAssetId: string | null;
  provenanceExcerpt: string | null;
  provenanceData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type EntityCreate = {
  type: EntityTypeValue;
  name: string;
  summary: string | null;
  metadata: Record<string, unknown>;
};

export type EntityUpdate = {
  type?: EntityTypeValue;
  name?: string;
  summary?: string | null;
  metadata?: Record<string, unknown>;
};
