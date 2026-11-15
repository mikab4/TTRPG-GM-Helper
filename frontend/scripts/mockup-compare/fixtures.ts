// Fake API data for mockup comparison. Values copy the mockup's sample content
// so both screenshots show the same records. Fixtures are typed with the app's
// own types, so `npm run build` fails when an API type gains or renames a field.
import type { Campaign } from "../../src/types/campaigns";
import type { EntityTypeCompatibilityReport } from "../../src/types/compatibility";
import type { Entity } from "../../src/types/entities";
import type { Relationship } from "../../src/types/relationships";

const timestamp = "2026-01-01T00:00:00Z";

export const shatteredCoastCampaign: Campaign = {
  id: "00000000-0000-4000-8000-000000000001",
  ownerId: "00000000-0000-4000-8000-0000000000aa",
  name: "The Shattered Coast",
  description: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

export const campaignDirectory: Campaign[] = [
  shatteredCoastCampaign,
  { ...shatteredCoastCampaign, id: "00000000-0000-4000-8000-000000000002", name: "Frozen North: Frostmaiden" },
  { ...shatteredCoastCampaign, id: "00000000-0000-4000-8000-000000000003", name: "The City of Brass" },
];

export const compatibilityReportWithoutIssues: EntityTypeCompatibilityReport = {
  hasIssues: false,
  issueCount: 0,
  issues: [],
};

function buildEntity(id: string, type: string, name: string, summary: string): Entity {
  return {
    id,
    campaignId: shatteredCoastCampaign.id,
    type,
    name,
    summary,
    metadata: {},
    sourceAssetId: null,
    provenanceExcerpt: null,
    provenanceData: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export const shatteredCoastEntities: Entity[] = [
  buildEntity(
    "00000000-0000-4000-8000-000000000101",
    "person",
    "Captain Elian Voss",
    "Harbormaster with a private debt to the Crown.",
  ),
  buildEntity("00000000-0000-4000-8000-000000000102", "location", "The Gilded Eel", "Dockside tavern and meeting place."),
  buildEntity(
    "00000000-0000-4000-8000-000000000103",
    "organization",
    "Salt Knives",
    "Smuggling organization controlling eastern quay.",
  ),
];

export const shatteredCoastRelationships: Relationship[] = [
  {
    id: "00000000-0000-4000-8000-000000000201",
    campaignId: shatteredCoastCampaign.id,
    sourceEntityId: "00000000-0000-4000-8000-000000000101",
    targetEntityId: "00000000-0000-4000-8000-000000000103",
    relationshipType: "owes_debt_to",
    relationshipFamily: "social",
    relationshipFamilyLabel: "Social",
    forwardLabel: "owes a debt to",
    reverseLabel: "holds a debt from",
    isSymmetric: false,
    lifecycleStatus: "current",
    visibilityStatus: "secret",
    certaintyStatus: "confirmed",
    notes: null,
    confidence: null,
    sourceAssetId: null,
    provenanceExcerpt: null,
    provenanceData: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

const opaqueKeys = new Set(["metadata", "provenanceData"]);

/** Convert app-side camelCase records to the API's snake_case wire format. */
export function toWire(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toWire);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, fieldValue]) => [
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
      opaqueKeys.has(key) ? fieldValue : toWire(fieldValue),
    ]),
  );
}
