import { describe, expect, it } from "vitest";

import { buildEntityNameMap, buildRelationshipPhrase, groupEntityRelationships } from "../relationships/presentation";
import type { Entity } from "../types/entities";
import type { Relationship } from "../types/relationships";

const entities: Entity[] = [
  {
    id: "entity-1",
    campaignId: "campaign-1",
    type: "person",
    name: "Rowan",
    summary: null,
    metadata: {},
    sourceAssetId: null,
    provenanceExcerpt: null,
    provenanceData: {},
    createdAt: "2026-04-12T12:00:00Z",
    updatedAt: "2026-04-12T12:00:00Z",
  },
  {
    id: "entity-2",
    campaignId: "campaign-1",
    type: "organization",
    name: "Harbor Watch",
    summary: null,
    metadata: {},
    sourceAssetId: null,
    provenanceExcerpt: null,
    provenanceData: {},
    createdAt: "2026-04-12T12:00:00Z",
    updatedAt: "2026-04-12T12:00:00Z",
  },
  {
    id: "entity-3",
    campaignId: "campaign-1",
    type: "event",
    name: "Black Tide",
    summary: null,
    metadata: {},
    sourceAssetId: null,
    provenanceExcerpt: null,
    provenanceData: {},
    createdAt: "2026-04-12T12:00:00Z",
    updatedAt: "2026-04-12T12:00:00Z",
  },
];

function buildRelationship(overrides: Partial<Relationship>): Relationship {
  return {
    id: "relationship-1",
    campaignId: "campaign-1",
    sourceEntityId: "entity-1",
    targetEntityId: "entity-2",
    relationshipType: "member_of",
    relationshipFamily: "organization",
    relationshipFamilyLabel: "Organization",
    forwardLabel: "supports",
    reverseLabel: "supported by",
    isSymmetric: false,
    lifecycleStatus: "current",
    visibilityStatus: "public",
    certaintyStatus: "confirmed",
    notes: null,
    confidence: null,
    sourceAssetId: null,
    provenanceExcerpt: null,
    provenanceData: {},
    createdAt: "2026-04-12T12:00:00Z",
    updatedAt: "2026-04-12T12:00:00Z",
    ...overrides,
  };
}

describe("relationship presentation", () => {
  it("uses safe names when the source entity is missing", () => {
    const relationship = buildRelationship({
      sourceEntityId: "missing-source-internal-id",
      targetEntityId: "entity-2",
      forwardLabel: "governs",
    });

    const phrase = buildRelationshipPhrase(relationship, buildEntityNameMap(entities));

    expect(phrase).toBe("Unknown source governs Harbor Watch");
    expect(phrase).not.toContain("missing-source-internal-id");
    expect(phrase).not.toContain("entity-2");
  });

  it("uses safe names when the target entity is missing", () => {
    const relationship = buildRelationship({
      sourceEntityId: "entity-1",
      targetEntityId: "missing-target-internal-id",
      forwardLabel: "governs",
    });

    const phrase = buildRelationshipPhrase(relationship, buildEntityNameMap(entities));

    expect(phrase).toBe("Rowan governs Unknown target");
    expect(phrase).not.toContain("entity-1");
    expect(phrase).not.toContain("missing-target-internal-id");
  });

  it("uses canonical family labels for grouped relationship sections", () => {
    const groupedRelationships = groupEntityRelationships(
      "entity-1",
      [
        buildRelationship({
          id: "relationship-organization",
          relationshipFamily: "organization",
          forwardLabel: "serves",
        }),
        buildRelationship({
          id: "relationship-conflict",
          relationshipFamily: "conflict",
          relationshipFamilyLabel: "Conflict",
          relationshipType: "enemy_of",
          forwardLabel: "opposes",
        }),
        buildRelationship({
          id: "relationship-influence",
          relationshipFamily: "influence",
          relationshipFamilyLabel: "Influence",
          relationshipType: "influences",
          forwardLabel: "influences",
        }),
        buildRelationship({
          id: "relationship-event",
          relationshipFamily: "event",
          relationshipFamilyLabel: "Event",
          relationshipType: "participated_in",
          targetEntityId: "entity-3",
          forwardLabel: "participated in",
        }),
      ],
      buildEntityNameMap(entities),
    );

    expect(groupedRelationships.map((group) => group.family)).toEqual(["Organization", "Conflict", "Influence", "Event"]);
    expect(groupedRelationships.some((group) => group.family === "Political And Social")).toBe(false);
    expect(groupedRelationships.some((group) => group.family === "Place And Context")).toBe(false);
  });
});
