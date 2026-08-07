import type { SourceAssetLifecycleStatus, SourceAssetStorageStatus } from "../types/assets";

type AssetStatusPresentation = {
  isReadOnly: boolean;
  label: "Deletion in progress" | "File available" | "File missing";
};

export function getAssetStatusPresentation({
  lifecycleStatus,
  storageStatus,
}: {
  lifecycleStatus: SourceAssetLifecycleStatus;
  storageStatus: SourceAssetStorageStatus;
}): AssetStatusPresentation {
  if (lifecycleStatus === "deleting") return { isReadOnly: true, label: "Deletion in progress" };
  return storageStatus === "missing"
    ? { isReadOnly: false, label: "File missing" }
    : { isReadOnly: false, label: "File available" };
}
