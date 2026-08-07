export type SourceAssetMediaFamily = "document" | "image" | "spreadsheet";
export type SourceAssetTruthStatus = "canonical" | "subjective" | "uncertain";
export type SourceAssetLifecycleStatus = "active" | "deleting";
export type SourceAssetStorageStatus = "available" | "missing";

export type SourceAsset = {
  campaignId: string;
  createdAt: string;
  fileSizeBytes: number;
  id: string;
  lifecycleStatus: SourceAssetLifecycleStatus;
  mediaType: string;
  metadata: Record<string, unknown>;
  originalFilename: string;
  sessionId: string | null;
  storageStatus: SourceAssetStorageStatus;
  title: string | null;
  truthStatus: SourceAssetTruthStatus;
  updatedAt: string;
};

export type SourceAssetCreate = {
  file: File;
  sessionId: string | null;
  title: string | null;
  truthStatus: SourceAssetTruthStatus;
};

export type SourceAssetUpdate = {
  metadata?: Record<string, unknown>;
  sessionId?: string | null;
  title?: string | null;
  truthStatus?: SourceAssetTruthStatus;
};
