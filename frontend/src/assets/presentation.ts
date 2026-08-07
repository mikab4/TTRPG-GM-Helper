import type { SourceAssetLifecycleStatus, SourceAssetStorageStatus } from "../types/assets";

type AssetStatusPresentation = {
  isReadOnly: boolean;
  label: "Deletion in progress" | "File available" | "File missing";
  tone: "available" | "deleting" | "missing";
};

export function getAssetStatusPresentation({
  lifecycleStatus,
  storageStatus,
}: {
  lifecycleStatus: SourceAssetLifecycleStatus;
  storageStatus: SourceAssetStorageStatus;
}): AssetStatusPresentation {
  if (lifecycleStatus === "deleting") return { isReadOnly: true, label: "Deletion in progress", tone: "deleting" };
  return storageStatus === "missing"
    ? { isReadOnly: false, label: "File missing", tone: "missing" }
    : { isReadOnly: false, label: "File available", tone: "available" };
}
