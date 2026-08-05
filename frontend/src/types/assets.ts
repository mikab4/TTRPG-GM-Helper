export type SourceAssetMediaFamily = "document" | "image" | "spreadsheet";
export type SourceAssetTruthStatus = "canonical" | "subjective" | "uncertain";

export type SourceAsset = {
  campaignId: string;
  createdAt: string;
  fileSizeBytes: number;
  id: string;
  lifecycleStatus: string;
  mediaType: string;
  metadata: Record<string, object>;
  originalFilename: string;
  sessionId: string | null;
  storageStatus: string;
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
  metadata?: Record<string, object>;
  sessionId?: string | null;
  title?: string | null;
  truthStatus?: SourceAssetTruthStatus;
};
