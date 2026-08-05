import { apiRequest } from "./client";
import type { CampaignSession, CampaignSessionCreate, CampaignSessionUpdate } from "../types/sessions";

type SessionRequestOptions = { signal?: AbortSignal };

function parseSession(payload: unknown): CampaignSession {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("id" in payload) ||
    typeof payload.id !== "string" ||
    !("campaign_id" in payload) ||
    typeof payload.campaign_id !== "string" ||
    !("session_number" in payload) ||
    !(typeof payload.session_number === "number" || payload.session_number === null) ||
    !("session_label" in payload) ||
    !(typeof payload.session_label === "string" || payload.session_label === null) ||
    !("played_on" in payload) ||
    !(typeof payload.played_on === "string" || payload.played_on === null) ||
    !("summary" in payload) ||
    !(typeof payload.summary === "string" || payload.summary === null) ||
    !("created_at" in payload) ||
    typeof payload.created_at !== "string" ||
    !("updated_at" in payload) ||
    typeof payload.updated_at !== "string"
  ) {
    throw new Error("Invalid session response payload.");
  }

  return {
    campaignId: payload.campaign_id,
    createdAt: payload.created_at,
    id: payload.id,
    playedOn: payload.played_on,
    sessionLabel: payload.session_label,
    sessionNumber: payload.session_number,
    summary: payload.summary,
    updatedAt: payload.updated_at,
  };
}

function serializeSession(session: CampaignSessionCreate | CampaignSessionUpdate): string {
  return JSON.stringify({
    ...(session.playedOn !== undefined ? { played_on: session.playedOn } : {}),
    ...(session.sessionLabel !== undefined ? { session_label: session.sessionLabel } : {}),
    ...(session.sessionNumber !== undefined ? { session_number: session.sessionNumber } : {}),
    ...(session.summary !== undefined ? { summary: session.summary } : {}),
  });
}

export async function listSessions(campaignId: string, options: SessionRequestOptions = {}): Promise<CampaignSession[]> {
  const payload = await apiRequest(`/campaigns/${campaignId}/sessions`, { signal: options.signal });
  if (!Array.isArray(payload)) throw new Error("Invalid session list response payload.");
  return payload.map(parseSession);
}

export async function getSession(
  campaignId: string,
  sessionId: string,
  options: SessionRequestOptions = {},
): Promise<CampaignSession> {
  return parseSession(await apiRequest(`/campaigns/${campaignId}/sessions/${sessionId}`, { signal: options.signal }));
}

export async function createSession(campaignId: string, sessionCreate: CampaignSessionCreate): Promise<CampaignSession> {
  return parseSession(
    await apiRequest(`/campaigns/${campaignId}/sessions`, {
      body: serializeSession(sessionCreate),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
}

export async function updateSession(
  campaignId: string,
  sessionId: string,
  sessionUpdate: CampaignSessionUpdate,
): Promise<CampaignSession> {
  return parseSession(
    await apiRequest(`/campaigns/${campaignId}/sessions/${sessionId}`, {
      body: serializeSession(sessionUpdate),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    }),
  );
}

export async function deleteSession(campaignId: string, sessionId: string): Promise<void> {
  await apiRequest(`/campaigns/${campaignId}/sessions/${sessionId}`, { method: "DELETE" });
}
