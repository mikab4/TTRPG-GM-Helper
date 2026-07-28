import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";

import { useUnsavedChanges, type UnsavedChangesRegistration } from "../app/UnsavedChangesContext";

import {
  ENTITY_TYPE_OPTIONS,
  formatEntityTypeLabel,
  isEntityTypeValue,
  type EntityTypeValue,
} from "../entities/entityTypes";
import type { Campaign } from "../types/campaigns";

export type EntityFormValues = {
  campaignId: string;
  name: string;
  summary: string;
  type: EntityTypeValue;
};

type EntityFormInitialValues = {
  campaignId: string;
  name: string;
  summary: string;
  type: string;
};

type EntityFormProps = {
  campaignOptions: Campaign[];
  fixedCampaignId?: string;
  initialValues: EntityFormInitialValues;
  submitError: string | null;
  submitLabel: string;
  submitting: boolean;
  onRegistrationChange?: (registration: UnsavedChangesRegistration | null) => void;
  onSubmit: (values: EntityFormValues, registration: UnsavedChangesRegistration) => Promise<void>;
};

export function EntityForm({
  campaignOptions,
  fixedCampaignId,
  initialValues,
  submitError,
  submitLabel,
  submitting,
  onSubmit,
  onRegistrationChange,
}: EntityFormProps) {
  const { registerForm } = useUnsavedChanges();
  const registrationRef = useRef<UnsavedChangesRegistration | null>(null);
  const [campaignId, setCampaignId] = useState(initialValues.campaignId);
  const [type, setType] = useState(initialValues.type);
  const [name, setName] = useState(initialValues.name);
  const [summary, setSummary] = useState(initialValues.summary);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const selectedCampaignId = useMemo(() => fixedCampaignId ?? campaignId, [campaignId, fixedCampaignId]);
  const hasLegacyTypeSelection = useMemo(
    () => Boolean(type) && !ENTITY_TYPE_OPTIONS.some((entityTypeOption) => entityTypeOption.value === type),
    [type],
  );

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
      selectedCampaignId !== (fixedCampaignId ?? initialValues.campaignId) ||
        type !== initialValues.type ||
        name !== initialValues.name ||
        summary !== initialValues.summary,
    );
  }, [fixedCampaignId, initialValues, name, selectedCampaignId, summary, type]);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    let hasError = false;

    if (!selectedCampaignId) {
      setCampaignError("Campaign is required.");
      hasError = true;
    } else {
      setCampaignError(null);
    }

    if (!type) {
      setTypeError("Entity type is required.");
      hasError = true;
    } else {
      setTypeError(null);
    }

    if (!trimmedName) {
      setNameError("Entity name is required.");
      hasError = true;
    } else {
      setNameError(null);
    }

    if (hasError) {
      return;
    }

    if (!selectedCampaignId || !isEntityTypeValue(type)) {
      return;
    }

    const registration = registrationRef.current;
    if (registration === null) {
      return;
    }

    await onSubmit(
      {
        campaignId: selectedCampaignId,
        name: trimmedName,
        summary,
        type,
      },
      registration,
    );
  }

  return (
    <form
      className="record-form"
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      {fixedCampaignId ? null : (
        <label className="field">
          <span className="field-label">Campaign</span>
          <select
            value={campaignId}
            onChange={(event) => {
              setCampaignId(event.target.value);
            }}
          >
            <option value="">Select a campaign</option>
            {campaignOptions.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
          {campaignError ? <span className="field-error">{campaignError}</span> : null}
        </label>
      )}
      <label className="field">
        <span className="field-label">Type</span>
        <select
          value={type}
          onChange={(event) => {
            const nextType = event.target.value;
            setType(isEntityTypeValue(nextType) ? nextType : "");
          }}
        >
          <option value="">Select an entity type</option>
          {hasLegacyTypeSelection ? <option value={type}>{formatEntityTypeLabel(type)} (legacy)</option> : null}
          {ENTITY_TYPE_OPTIONS.map((entityTypeOption) => (
            <option key={entityTypeOption.value} value={entityTypeOption.value}>
              {entityTypeOption.label}
            </option>
          ))}
        </select>
        {typeError ? <span className="field-error">{typeError}</span> : null}
      </label>
      <label className="field">
        <span className="field-label">Name</span>
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        {nameError ? <span className="field-error">{nameError}</span> : null}
      </label>
      <label className="field">
        <span className="field-label">Summary</span>
        <textarea
          rows={6}
          value={summary}
          onChange={(event) => {
            setSummary(event.target.value);
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
