import { createContext, useContext } from "react";

type CampaignDirectoryContextValue = {
  refreshCampaigns: () => Promise<void>;
};

const CampaignDirectoryContext = createContext<CampaignDirectoryContextValue | null>(null);

export const CampaignDirectoryProvider = CampaignDirectoryContext.Provider;

export function useCampaignDirectory(): CampaignDirectoryContextValue {
  const campaignDirectory = useContext(CampaignDirectoryContext);

  if (campaignDirectory === null) {
    throw new Error("Campaign directory actions must be used inside the app shell.");
  }

  return campaignDirectory;
}
