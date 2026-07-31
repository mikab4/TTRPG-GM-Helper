import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useUnsavedChanges, type UnsavedChangesRegistration } from "../app/UnsavedChangesContext";
import type { RelationshipType, RelationshipTypeUpdate } from "../types/relationshipTypes";

type RelationshipTypeInventoryProps = {
  createPath: string;
  relationshipTypes: RelationshipType[];
  submitError: string | null;
  submitting: boolean;
  onRequestDelete: (relationshipType: RelationshipType) => void;
  onUpdate: (relationshipTypeKey: string, relationshipTypeUpdate: RelationshipTypeUpdate) => Promise<boolean>;
};

export function RelationshipTypeInventory({
  createPath,
  relationshipTypes,
  submitError,
  submitting,
  onRequestDelete,
  onUpdate,
}: RelationshipTypeInventoryProps) {
  const { registerForm } = useUnsavedChanges();
  const registrationRef = useRef<UnsavedChangesRegistration | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [forwardLabel, setForwardLabel] = useState("");
  const [reverseLabel, setReverseLabel] = useState("");
  const editingType = relationshipTypes.find((relationshipType) => relationshipType.key === editingKey);
  const isDirty =
    editingType !== undefined &&
    (forwardLabel.trim() !== editingType.label.trim() ||
      (!editingType.isSymmetric && reverseLabel.trim() !== (editingType.reverseLabel ?? "").trim()));
  const isValid =
    editingType !== undefined && forwardLabel.trim() !== "" && (editingType.isSymmetric || reverseLabel.trim() !== "");
  const customTypes = useMemo(
    () =>
      relationshipTypes
        .filter((relationshipType) => relationshipType.isCustom)
        .sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? "")),
    [relationshipTypes],
  );
  const builtInTypes = useMemo(
    () =>
      relationshipTypes
        .filter((relationshipType) => !relationshipType.isCustom)
        .sort((left, right) => left.label.localeCompare(right.label)),
    [relationshipTypes],
  );

  useEffect(() => {
    const registration = registerForm();
    registrationRef.current = registration;
    return () => {
      registration.unregister();
    };
  }, [registerForm]);
  useEffect(() => registrationRef.current?.setDirty(isDirty), [isDirty]);

  async function saveLabels() {
    if (!editingType) return;
    const saved = await onUpdate(editingType.key, {
      label: forwardLabel.trim(),
      ...(editingType.isSymmetric ? {} : { reverseLabel: reverseLabel.trim() }),
    });
    if (saved) {
      setEditingKey(null);
      setForwardLabel("");
      setReverseLabel("");
    }
  }

  function renderCard(relationshipType: RelationshipType, editable: boolean) {
    const isEditing = relationshipType.key === editingKey;
    return (
      <article key={relationshipType.key} className="relationship-type-card">
        <div className="relationship-type-copy">
          <strong>{relationshipType.label}</strong>
          <span>Forward label: {relationshipType.label}</span>
          {relationshipType.isSymmetric ? null : <span>Reverse label: {relationshipType.reverseLabel}</span>}
          <span>
            {relationshipType.familyLabel} · {relationshipType.isCustom ? "Custom" : "Built In"}
          </span>
          <span>
            {relationshipType.allowedSourceTypes.join(", ")} {"->"} {relationshipType.allowedTargetTypes.join(", ")}
          </span>
        </div>
        {editable ? (
          <div className="relationship-type-actions">
            {isEditing ? (
              <>
                <label className="field">
                  <span className="field-label">Forward label for {relationshipType.label}</span>
                  <input
                    disabled={submitting}
                    value={forwardLabel}
                    onChange={(event) => {
                      setForwardLabel(event.target.value);
                    }}
                  />
                </label>
                {relationshipType.isSymmetric ? null : (
                  <label className="field">
                    <span className="field-label">Reverse label for {relationshipType.label}</span>
                    <input
                      disabled={submitting}
                      value={reverseLabel}
                      onChange={(event) => {
                        setReverseLabel(event.target.value);
                      }}
                    />
                  </label>
                )}
                <button
                  className="text-button"
                  disabled={submitting || !isDirty || !isValid}
                  type="button"
                  onClick={() => void saveLabels()}
                >
                  Save
                </button>
                <button
                  className="text-button"
                  disabled={submitting}
                  type="button"
                  onClick={() => {
                    setEditingKey(null);
                    setForwardLabel("");
                    setReverseLabel("");
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                className="text-button"
                disabled={submitting || (editingKey !== null && isDirty)}
                type="button"
                onClick={() => {
                  setEditingKey(relationshipType.key);
                  setForwardLabel(relationshipType.label);
                  setReverseLabel(relationshipType.isSymmetric ? "" : (relationshipType.reverseLabel ?? ""));
                }}
              >
                Edit labels
              </button>
            )}
            <button
              className="text-button"
              disabled={submitting || isEditing}
              type="button"
              onClick={() => {
                onRequestDelete(relationshipType);
              }}
            >
              Delete
            </button>
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <div className="relationship-type-inventory">
      <h4 className="relationship-type-list-heading">Custom Relationship Types</h4>
      {submitError ? <p className="field-error">{submitError}</p> : null}
      {customTypes.length === 0 ? (
        <div className="relationship-type-empty-state">
          <p className="section-copy">No custom relationship types yet. Create one to tailor this campaign.</p>
          <Link className="secondary-button" to={createPath}>
            Create custom type
          </Link>
        </div>
      ) : null}
      <div className="relationship-type-list">
        {customTypes.map((relationshipType) => renderCard(relationshipType, true))}
      </div>
      <h4 className="relationship-type-list-heading">Built-in Relationship Types</h4>
      <div className="relationship-type-list">
        {builtInTypes.map((relationshipType) => renderCard(relationshipType, false))}
      </div>
    </div>
  );
}
