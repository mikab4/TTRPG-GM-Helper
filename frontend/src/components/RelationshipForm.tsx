import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { Link } from "react-router-dom";

import {
  RELATIONSHIP_CERTAINTY_STATUS_OPTIONS,
  RELATIONSHIP_LIFECYCLE_STATUS_OPTIONS,
  RELATIONSHIP_VISIBILITY_STATUS_OPTIONS,
  type RelationshipCertaintyStatusValue,
  type RelationshipLifecycleStatusValue,
  type RelationshipVisibilityStatusValue,
} from "../relationships/domain";
import { isEntityTypeValue } from "../entities/entityTypes";
import { useUnsavedChanges, type UnsavedChangesRegistration } from "../app/UnsavedChangesContext";
import type { Entity } from "../types/entities";
import type { RelationshipFamilyOption } from "../types/relationshipFamilies";
import type { RelationshipType } from "../types/relationshipTypes";

export type RelationshipFormValues = {
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: string;
  lifecycleStatus: RelationshipLifecycleStatusValue;
  visibilityStatus: RelationshipVisibilityStatusValue;
  certaintyStatus: RelationshipCertaintyStatusValue;
  notes: string;
};

type RelationshipFormProps = {
  campaignId: string;
  entities: Entity[];
  initialValues: RelationshipFormValues;
  relationshipFamilies: RelationshipFamilyOption[];
  relationshipTypes: RelationshipType[];
  submitError: string | null;
  submitLabel: string;
  submitting: boolean;
  onRegistrationChange?: (registration: UnsavedChangesRegistration | null) => void;
  onSubmit: (values: RelationshipFormValues, registration: UnsavedChangesRegistration) => Promise<void>;
};

export function RelationshipForm({
  campaignId,
  entities,
  initialValues,
  relationshipFamilies,
  relationshipTypes,
  submitError,
  submitLabel,
  submitting,
  onSubmit,
  onRegistrationChange,
}: RelationshipFormProps) {
  const { registerForm } = useUnsavedChanges();
  const registrationRef = useRef<UnsavedChangesRegistration | null>(null);
  const [sourceEntityId, setSourceEntityId] = useState(initialValues.sourceEntityId);
  const [targetEntityId, setTargetEntityId] = useState(initialValues.targetEntityId);
  const [relationshipType, setRelationshipType] = useState(initialValues.relationshipType);
  const [relationshipGroup, setRelationshipGroup] = useState(
    relationshipTypes.find((typeOption) => typeOption.key === initialValues.relationshipType)?.family ?? "",
  );
  const [lifecycleStatus, setLifecycleStatus] = useState(initialValues.lifecycleStatus);
  const [visibilityStatus, setVisibilityStatus] = useState(initialValues.visibilityStatus);
  const [certaintyStatus, setCertaintyStatus] = useState(initialValues.certaintyStatus);
  const [notes, setNotes] = useState(initialValues.notes);
  const [hasUserChangedRelationshipTypeConstraints, setHasUserChangedRelationshipTypeConstraints] = useState(false);

  const initialRelationshipGroup =
    relationshipTypes.find((typeOption) => typeOption.key === initialValues.relationshipType)?.family ?? "";

  useEffect(() => {
    const registration = registerForm();
    registrationRef.current = registration;
    onRegistrationChange?.(registration);

    return () => {
      registration.unregister();
      onRegistrationChange?.(null);
    };
  }, [onRegistrationChange, registerForm]);

  useEffect(() => {
    registrationRef.current?.setDirty(
      sourceEntityId !== initialValues.sourceEntityId ||
        targetEntityId !== initialValues.targetEntityId ||
        relationshipType !== initialValues.relationshipType ||
        relationshipGroup !== initialRelationshipGroup ||
        lifecycleStatus !== initialValues.lifecycleStatus ||
        visibilityStatus !== initialValues.visibilityStatus ||
        certaintyStatus !== initialValues.certaintyStatus ||
        notes !== initialValues.notes,
    );
  }, [
    certaintyStatus,
    initialRelationshipGroup,
    initialValues,
    lifecycleStatus,
    notes,
    relationshipGroup,
    relationshipType,
    sourceEntityId,
    targetEntityId,
    visibilityStatus,
  ]);

  const selectedRelationshipType = useMemo(
    () => relationshipTypes.find((typeOption) => typeOption.key === relationshipType),
    [relationshipType, relationshipTypes],
  );
  const selectedSourceEntity = useMemo(
    () => entities.find((entity) => entity.id === sourceEntityId) ?? null,
    [entities, sourceEntityId],
  );
  const selectedTargetEntity = useMemo(
    () => entities.find((entity) => entity.id === targetEntityId) ?? null,
    [entities, targetEntityId],
  );

  const sourceEntityType = selectedSourceEntity?.type;
  const targetEntityType = selectedTargetEntity?.type;

  const compatibleRelationshipTypes = relationshipTypes.filter((typeOption) => {
    if (!sourceEntityType || !targetEntityType) {
      if (
        sourceEntityType &&
        isEntityTypeValue(sourceEntityType) &&
        !typeOption.allowedSourceTypes.includes(sourceEntityType)
      ) {
        return false;
      }

      if (
        targetEntityType &&
        isEntityTypeValue(targetEntityType) &&
        !typeOption.allowedTargetTypes.includes(targetEntityType)
      ) {
        return false;
      }

      return true;
    }

    if (!isEntityTypeValue(sourceEntityType) || !isEntityTypeValue(targetEntityType)) {
      return false;
    }

    return (
      typeOption.allowedSourceTypes.includes(sourceEntityType) && typeOption.allowedTargetTypes.includes(targetEntityType)
    );
  });

  const availableRelationshipGroups = useMemo(
    () => Array.from(new Set(compatibleRelationshipTypes.map((typeOption) => typeOption.family))),
    [compatibleRelationshipTypes],
  );
  const relationshipGroupOptions = useMemo(() => {
    if (relationshipGroup && !availableRelationshipGroups.includes(relationshipGroup)) {
      return [relationshipGroup, ...availableRelationshipGroups];
    }

    return availableRelationshipGroups;
  }, [availableRelationshipGroups, relationshipGroup]);

  const groupedRelationshipTypes = compatibleRelationshipTypes.filter((typeOption) =>
    relationshipGroup ? typeOption.family === relationshipGroup : true,
  );
  const relationshipFamilyLabelByValue = useMemo(
    () => new Map(relationshipFamilies.map((relationshipFamily) => [relationshipFamily.value, relationshipFamily.label])),
    [relationshipFamilies],
  );

  const selectedRelationshipGroupIsAvailable =
    relationshipGroup === "" || availableRelationshipGroups.includes(relationshipGroup);

  const isSelectedRelationshipTypeCompatible =
    !selectedRelationshipType ||
    compatibleRelationshipTypes.some((typeOption) => typeOption.key === selectedRelationshipType.key);

  const isSelectedSourceEntityCompatible =
    !selectedRelationshipType ||
    !selectedSourceEntity ||
    (isEntityTypeValue(selectedSourceEntity.type) &&
      selectedRelationshipType.allowedSourceTypes.includes(selectedSourceEntity.type));

  const isSelectedTargetEntityCompatible =
    !selectedRelationshipType ||
    !selectedTargetEntity ||
    (isEntityTypeValue(selectedTargetEntity.type) &&
      selectedRelationshipType.allowedTargetTypes.includes(selectedTargetEntity.type));

  const hasIncompatibleSavedSelection =
    Boolean(initialValues.relationshipType || initialValues.sourceEntityId || initialValues.targetEntityId) &&
    (!isSelectedRelationshipTypeCompatible ||
      !isSelectedSourceEntityCompatible ||
      !isSelectedTargetEntityCompatible ||
      !selectedRelationshipGroupIsAvailable);

  const relationshipTypeOptions = useMemo(() => {
    const options = [...groupedRelationshipTypes];

    if (
      selectedRelationshipType &&
      relationshipGroup === selectedRelationshipType.family &&
      !options.some((typeOption) => typeOption.key === selectedRelationshipType.key)
    ) {
      options.unshift(selectedRelationshipType);
    }

    return options;
  }, [groupedRelationshipTypes, relationshipGroup, selectedRelationshipType]);
  const relationshipGroupOptionValues = useMemo(() => {
    const availableGroupValues = relationshipFamilies
      .map((relationshipFamily) => relationshipFamily.value)
      .filter((relationshipFamilyValue) => relationshipGroupOptions.includes(relationshipFamilyValue));

    const remainingGroupValues = relationshipGroupOptions.filter(
      (relationshipFamilyValue) => !availableGroupValues.includes(relationshipFamilyValue),
    );

    return [...availableGroupValues, ...remainingGroupValues];
  }, [relationshipFamilies, relationshipGroupOptions]);

  const sourceEntityOptions = useMemo(() => {
    const compatibleEntities = entities.filter((entity) => {
      if (!selectedRelationshipType) {
        return true;
      }

      return isEntityTypeValue(entity.type) && selectedRelationshipType.allowedSourceTypes.includes(entity.type);
    });

    if (selectedSourceEntity && !compatibleEntities.some((entity) => entity.id === selectedSourceEntity.id)) {
      return [selectedSourceEntity, ...compatibleEntities];
    }

    return compatibleEntities;
  }, [entities, selectedRelationshipType, selectedSourceEntity]);

  const targetEntityOptions = useMemo(() => {
    const compatibleEntities = entities.filter((entity) => {
      if (!selectedRelationshipType) {
        return true;
      }

      return isEntityTypeValue(entity.type) && selectedRelationshipType.allowedTargetTypes.includes(entity.type);
    });

    if (selectedTargetEntity && !compatibleEntities.some((entity) => entity.id === selectedTargetEntity.id)) {
      return [selectedTargetEntity, ...compatibleEntities];
    }

    return compatibleEntities;
  }, [entities, selectedRelationshipType, selectedTargetEntity]);

  useEffect(() => {
    if (!selectedRelationshipGroupIsAvailable) {
      if (hasUserChangedRelationshipTypeConstraints) {
        setRelationshipGroup("");
      }
    }
  }, [hasUserChangedRelationshipTypeConstraints, selectedRelationshipGroupIsAvailable]);

  useEffect(() => {
    if (!relationshipType) {
      return;
    }

    const selectedTypeIsAvailable = compatibleRelationshipTypes.some((typeOption) => typeOption.key === relationshipType);

    if (!selectedTypeIsAvailable) {
      if (hasUserChangedRelationshipTypeConstraints) {
        setRelationshipType("");
      }
      return;
    }

    if (selectedRelationshipType && selectedRelationshipType.family !== relationshipGroup) {
      setRelationshipGroup(selectedRelationshipType.family);
    }
  }, [
    compatibleRelationshipTypes,
    hasUserChangedRelationshipTypeConstraints,
    relationshipGroup,
    relationshipType,
    selectedRelationshipType,
  ]);

  useEffect(() => {
    if (!sourceEntityId) {
      return;
    }

    const selectedSourceStillAllowed = sourceEntityOptions.some((entity) => entity.id === sourceEntityId);

    if (!selectedSourceStillAllowed && hasUserChangedRelationshipTypeConstraints) {
      setSourceEntityId("");
    }
  }, [hasUserChangedRelationshipTypeConstraints, sourceEntityId, sourceEntityOptions]);

  useEffect(() => {
    if (!targetEntityId) {
      return;
    }

    const selectedTargetStillAllowed = targetEntityOptions.some((entity) => entity.id === targetEntityId);

    if (!selectedTargetStillAllowed && hasUserChangedRelationshipTypeConstraints) {
      setTargetEntityId("");
    }
  }, [hasUserChangedRelationshipTypeConstraints, targetEntityId, targetEntityOptions]);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const registration = registrationRef.current;
    if (registration === null) {
      return;
    }

    await onSubmit(
      {
        certaintyStatus,
        lifecycleStatus,
        notes,
        relationshipType,
        sourceEntityId,
        targetEntityId,
        visibilityStatus,
      },
      registration,
    );
  }

  return (
    <form
      className="record-form relationship-form"
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      {hasIncompatibleSavedSelection ? (
        <p className="field-error">
          This saved relationship no longer matches the current entity or type rules. Review it before saving.
        </p>
      ) : null}
      <label className="field">
        <span className="field-label">Source Entity</span>
        <select
          value={sourceEntityId}
          onChange={(event) => {
            setSourceEntityId(event.target.value);
          }}
        >
          <option value="">Select source entity</option>
          {sourceEntityOptions.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
              {entity.id === selectedSourceEntity?.id && !isSelectedSourceEntityCompatible
                ? " (saved, now incompatible)"
                : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Relationship Group</span>
        <select
          value={relationshipGroup}
          onChange={(event) => {
            setHasUserChangedRelationshipTypeConstraints(true);
            const nextRelationshipGroup = event.target.value;
            setRelationshipGroup(nextRelationshipGroup);

            const selectedTypeStillMatches = compatibleRelationshipTypes.some(
              (typeOption) => typeOption.key === relationshipType && typeOption.family === nextRelationshipGroup,
            );

            if (!selectedTypeStillMatches) {
              setRelationshipType("");
            }
          }}
        >
          <option value="">Select relationship group</option>
          {relationshipGroupOptionValues.map((groupOption) => (
            <option key={groupOption} value={groupOption}>
              {relationshipFamilyLabelByValue.get(groupOption) ?? selectedRelationshipType?.familyLabel ?? groupOption}
              {groupOption === relationshipGroup && !selectedRelationshipGroupIsAvailable
                ? " (saved, now incompatible)"
                : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">
          Relationship Type{" "}
          <span className="field-label-helper">
            (
            <Link className="text-link" to={`/campaigns/${campaignId}/relationship-types`}>
              Add custom type
            </Link>
            )
          </span>
        </span>
        <select
          disabled={!relationshipGroup}
          value={relationshipType}
          onChange={(event) => {
            setHasUserChangedRelationshipTypeConstraints(true);
            setRelationshipType(event.target.value);
          }}
        >
          <option value="">{relationshipGroup ? "Select relationship type" : "Select relationship group first"}</option>
          {relationshipTypeOptions.map((typeOption) => (
            <option key={typeOption.key} value={typeOption.key}>
              {typeOption.label}
              {typeOption.key === selectedRelationshipType?.key && !isSelectedRelationshipTypeCompatible
                ? " (saved, now incompatible)"
                : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Target Entity</span>
        <select
          value={targetEntityId}
          onChange={(event) => {
            setTargetEntityId(event.target.value);
          }}
        >
          <option value="">Select target entity</option>
          {targetEntityOptions.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
              {entity.id === selectedTargetEntity?.id && !isSelectedTargetEntityCompatible
                ? " (saved, now incompatible)"
                : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="filter-grid">
        <label className="field">
          <span className="field-label">Lifecycle</span>
          <select
            value={lifecycleStatus}
            onChange={(event) => {
              setLifecycleStatus(event.target.value as RelationshipLifecycleStatusValue);
            }}
          >
            {RELATIONSHIP_LIFECYCLE_STATUS_OPTIONS.map((statusOption) => (
              <option key={statusOption.value} value={statusOption.value}>
                {statusOption.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Visibility</span>
          <select
            value={visibilityStatus}
            onChange={(event) => {
              setVisibilityStatus(event.target.value as RelationshipVisibilityStatusValue);
            }}
          >
            {RELATIONSHIP_VISIBILITY_STATUS_OPTIONS.map((statusOption) => (
              <option key={statusOption.value} value={statusOption.value}>
                {statusOption.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Certainty</span>
          <select
            value={certaintyStatus}
            onChange={(event) => {
              setCertaintyStatus(event.target.value as RelationshipCertaintyStatusValue);
            }}
          >
            {RELATIONSHIP_CERTAINTY_STATUS_OPTIONS.map((statusOption) => (
              <option key={statusOption.value} value={statusOption.value}>
                {statusOption.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field-label">Notes</span>
        <textarea
          rows={5}
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
          }}
        />
      </label>
      {submitError ? <p className="field-error">{submitError}</p> : null}
      <button className="primary-button" disabled={submitting} type="submit">
        {submitting ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
