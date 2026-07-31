import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction, type SyntheticEvent } from "react";

import { useUnsavedChanges, type UnsavedChangesRegistration } from "../app/UnsavedChangesContext";
import { ENTITY_TYPE_OPTIONS, formatEntityTypeLabel, type EntityTypeValue } from "../entities/entityTypes";
import type { RelationshipFamilyOption } from "../types/relationshipFamilies";
import type { RelationshipTypeCreate } from "../types/relationshipTypes";

type RelationshipTypeCreateFormProps = {
  relationshipFamilies: RelationshipFamilyOption[];
  submitError: string | null;
  submitting: boolean;
  onCreate: (value: RelationshipTypeCreate) => Promise<boolean>;
  onCreated: () => void;
};
function normalized(types: EntityTypeValue[]) {
  return [...new Set(types)].sort();
}
function same(left: EntityTypeValue[], right: EntityTypeValue[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function RelationshipTypeCreateForm({
  relationshipFamilies,
  submitError,
  submitting,
  onCreate,
  onCreated,
}: RelationshipTypeCreateFormProps) {
  const { registerForm } = useUnsavedChanges();
  const registrationRef = useRef<UnsavedChangesRegistration | null>(null);
  const defaultFamily = relationshipFamilies[0]?.value ?? "";
  const [label, setLabel] = useState("");
  const [family, setFamily] = useState(defaultFamily);
  const [reverseLabel, setReverseLabel] = useState("");
  const [isSymmetric, setIsSymmetric] = useState(false);
  const [sourceTypes, setSourceTypes] = useState<EntityTypeValue[]>(["person"]);
  const [targetTypes, setTargetTypes] = useState<EntityTypeValue[]>(["person"]);
  const [sourcePicker, setSourcePicker] = useState<EntityTypeValue>("person");
  const [targetPicker, setTargetPicker] = useState<EntityTypeValue>("person");
  const value = useMemo(
    () => ({
      label: label.trim(),
      family,
      reverseLabel: isSymmetric ? null : reverseLabel.trim() || null,
      isSymmetric,
      allowedSourceTypes: normalized(sourceTypes),
      allowedTargetTypes: normalized(targetTypes),
    }),
    [family, isSymmetric, label, reverseLabel, sourceTypes, targetTypes],
  );
  const dirty =
    value.label !== "" ||
    value.family !== defaultFamily ||
    value.reverseLabel !== null ||
    value.isSymmetric ||
    !same(value.allowedSourceTypes, ["person"]) ||
    !same(value.allowedTargetTypes, ["person"]);
  useEffect(() => {
    if (!family && defaultFamily) setFamily(defaultFamily);
  }, [defaultFamily, family]);
  useEffect(() => {
    const registration = registerForm();
    registrationRef.current = registration;
    return () => {
      registration.unregister();
    };
  }, [registerForm]);
  useEffect(() => registrationRef.current?.setDirty(dirty), [dirty]);
  function add(next: EntityTypeValue, setValues: Dispatch<SetStateAction<EntityTypeValue[]>>) {
    setValues((values) => (values.includes(next) ? values : [...values, next]));
  }
  function remove(removed: EntityTypeValue, setValues: Dispatch<SetStateAction<EntityTypeValue[]>>) {
    setValues((values) => values.filter((value) => value !== removed));
  }
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await onCreate(value)) {
      setLabel("");
      setReverseLabel("");
      setSourceTypes(["person"]);
      setTargetTypes(["person"]);
      setSourcePicker("person");
      setTargetPicker("person");
      setFamily(defaultFamily);
      setIsSymmetric(false);
      registrationRef.current?.markCleanAndNavigate(onCreated);
    }
  }
  function allowed(
    labelText: string,
    values: EntityTypeValue[],
    picker: EntityTypeValue,
    setPicker: Dispatch<SetStateAction<EntityTypeValue>>,
    setValues: Dispatch<SetStateAction<EntityTypeValue[]>>,
    action: string,
  ) {
    return (
      <label className="field">
        <span className="field-label">{labelText}</span>
        <div className="relationship-type-picker">
          <select
            aria-label={labelText.slice(0, -1)}
            disabled={submitting}
            value={picker}
            onChange={(event) => {
              setPicker(event.target.value as EntityTypeValue);
            }}
          >
            {ENTITY_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            className="secondary-button"
            disabled={submitting}
            type="button"
            onClick={() => {
              add(picker, setValues);
            }}
          >
            {action}
          </button>
        </div>
        <div className="relationship-type-chip-list">
          {values.map((value) => (
            <span key={value} className="relationship-type-chip">
              {formatEntityTypeLabel(value)}
              <button
                aria-label={`Remove ${formatEntityTypeLabel(value)} from ${labelText.toLocaleLowerCase()}`}
                className="text-button"
                disabled={submitting}
                type="button"
                onClick={() => {
                  remove(value, setValues);
                }}
              >
                Remove
              </button>
            </span>
          ))}
        </div>
      </label>
    );
  }
  return (
    <form className="record-form relationship-type-form" onSubmit={(event) => void submit(event)}>
      <label className="field">
        <span className="field-label">Custom Type Label</span>
        <input
          placeholder="bodyguard of"
          disabled={submitting}
          value={label}
          onChange={(event) => {
            setLabel(event.target.value);
          }}
        />
      </label>
      <label className="field">
        <span className="field-label">Family</span>
        <select
          value={family}
          disabled={submitting}
          onChange={(event) => {
            setFamily(event.target.value);
          }}
        >
          {relationshipFamilies.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {allowed("Allowed Source Types", sourceTypes, sourcePicker, setSourcePicker, setSourceTypes, "Add source type")}
      {allowed("Allowed Target Types", targetTypes, targetPicker, setTargetPicker, setTargetTypes, "Add target type")}
      <label className="field checkbox-field">
        <input
          className="relationship-type-checkbox"
          checked={isSymmetric}
          disabled={submitting}
          type="checkbox"
          onChange={(event) => {
            setIsSymmetric(event.target.checked);
          }}
        />
        <span className="field-label">Symmetric type</span>
      </label>
      {isSymmetric ? null : (
        <label className="field">
          <span className="field-label">Reverse Label</span>
          <input
            placeholder="guarded by"
            disabled={submitting}
            value={reverseLabel}
            onChange={(event) => {
              setReverseLabel(event.target.value);
            }}
          />
        </label>
      )}
      {submitError ? <p className="field-error">{submitError}</p> : null}
      <button className="secondary-button" disabled={submitting} type="submit">
        {submitting ? "Saving..." : "Add Custom Type"}
      </button>
    </form>
  );
}
