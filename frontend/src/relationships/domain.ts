export const RELATIONSHIP_LIFECYCLE_STATUS_OPTIONS = [
  { label: "Current", value: "current" },
  { label: "Former", value: "former" },
] as const;

export const RELATIONSHIP_VISIBILITY_STATUS_OPTIONS = [
  { label: "Public", value: "public" },
  { label: "Secret", value: "secret" },
] as const;

export const RELATIONSHIP_CERTAINTY_STATUS_OPTIONS = [
  { label: "Confirmed", value: "confirmed" },
  { label: "Rumored", value: "rumored" },
] as const;

export const RELATIONSHIP_ENTITY_FILTER_PARAM = "entity_id";

export type RelationshipFamilyValue = string;
export type RelationshipLifecycleStatusValue = (typeof RELATIONSHIP_LIFECYCLE_STATUS_OPTIONS)[number]["value"];
export type RelationshipVisibilityStatusValue = (typeof RELATIONSHIP_VISIBILITY_STATUS_OPTIONS)[number]["value"];
export type RelationshipCertaintyStatusValue = (typeof RELATIONSHIP_CERTAINTY_STATUS_OPTIONS)[number]["value"];

const RELATIONSHIP_LIFECYCLE_STATUS_VALUES = new Set<RelationshipLifecycleStatusValue>(
  RELATIONSHIP_LIFECYCLE_STATUS_OPTIONS.map((option) => option.value),
);
const RELATIONSHIP_VISIBILITY_STATUS_VALUES = new Set<RelationshipVisibilityStatusValue>(
  RELATIONSHIP_VISIBILITY_STATUS_OPTIONS.map((option) => option.value),
);
const RELATIONSHIP_CERTAINTY_STATUS_VALUES = new Set<RelationshipCertaintyStatusValue>(
  RELATIONSHIP_CERTAINTY_STATUS_OPTIONS.map((option) => option.value),
);

export function isRelationshipLifecycleStatusValue(
  relationshipLifecycleStatus: string,
): relationshipLifecycleStatus is RelationshipLifecycleStatusValue {
  return RELATIONSHIP_LIFECYCLE_STATUS_VALUES.has(relationshipLifecycleStatus as RelationshipLifecycleStatusValue);
}

export function isRelationshipVisibilityStatusValue(
  relationshipVisibilityStatus: string,
): relationshipVisibilityStatus is RelationshipVisibilityStatusValue {
  return RELATIONSHIP_VISIBILITY_STATUS_VALUES.has(relationshipVisibilityStatus as RelationshipVisibilityStatusValue);
}

export function isRelationshipCertaintyStatusValue(
  relationshipCertaintyStatus: string,
): relationshipCertaintyStatus is RelationshipCertaintyStatusValue {
  return RELATIONSHIP_CERTAINTY_STATUS_VALUES.has(relationshipCertaintyStatus as RelationshipCertaintyStatusValue);
}

export function formatRelationshipFamilyLabel(relationshipFamily: string): string {
  return relationshipFamily
    .split(/[_-]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
