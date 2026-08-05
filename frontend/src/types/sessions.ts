export type CampaignSession = {
  campaignId: string;
  createdAt: string;
  id: string;
  playedOn: string | null;
  sessionLabel: string | null;
  sessionNumber: number | null;
  summary: string | null;
  updatedAt: string;
};

export type CampaignSessionCreate = {
  playedOn: string | null;
  sessionLabel: string | null;
  sessionNumber: number | null;
  summary: string | null;
};

export type CampaignSessionUpdate = Partial<CampaignSessionCreate>;
