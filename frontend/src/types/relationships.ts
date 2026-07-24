import type {
  RelationshipCertaintyStatusValue,
  RelationshipFamilyValue,
  RelationshipLifecycleStatusValue,
  RelationshipVisibilityStatusValue,
} from "../relationships/domain";

export type Relationship = {
  id: string;
  campaignId: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: string;
  relationshipFamily: RelationshipFamilyValue;
  relationshipFamilyLabel: string;
  forwardLabel: string;
  reverseLabel: string;
  isSymmetric: boolean;
  lifecycleStatus: RelationshipLifecycleStatusValue;
  visibilityStatus: RelationshipVisibilityStatusValue;
  certaintyStatus: RelationshipCertaintyStatusValue;
  notes: string | null;
  confidence: number | null;
  sourceAssetId: string | null;
  provenanceExcerpt: string | null;
  provenanceData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type RelationshipCreate = {
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: string;
  lifecycleStatus: RelationshipLifecycleStatusValue;
  visibilityStatus: RelationshipVisibilityStatusValue;
  certaintyStatus: RelationshipCertaintyStatusValue;
  notes: string | null;
};

export type RelationshipUpdate = {
  relationshipType?: string;
  lifecycleStatus?: RelationshipLifecycleStatusValue;
  visibilityStatus?: RelationshipVisibilityStatusValue;
  certaintyStatus?: RelationshipCertaintyStatusValue;
  notes?: string | null;
};
