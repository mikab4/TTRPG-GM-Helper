import { useEffect, useRef, useState, type SyntheticEvent } from "react";

import { useUnsavedChanges, type UnsavedChangesRegistration } from "../app/UnsavedChangesContext";

type CampaignFormValues = {
  description: string;
  name: string;
};

type CampaignFormProps = {
  initialValues: CampaignFormValues;
  submitLabel: string;
  submitError: string | null;
  submitting: boolean;
  onRegistrationChange?: (registration: UnsavedChangesRegistration | null) => void;
  onSubmit: (values: CampaignFormValues, registration: UnsavedChangesRegistration) => Promise<void>;
};

export function CampaignForm({
  initialValues,
  submitLabel,
  submitError,
  submitting,
  onRegistrationChange,
  onSubmit,
}: CampaignFormProps) {
  const { registerForm } = useUnsavedChanges();
  const registrationRef = useRef<UnsavedChangesRegistration | null>(null);
  const [name, setName] = useState(initialValues.name);
  const [description, setDescription] = useState(initialValues.description);
  const [nameError, setNameError] = useState<string | null>(null);

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
    registrationRef.current?.setDirty(name !== initialValues.name || description !== initialValues.description);
  }, [description, initialValues.description, initialValues.name, name]);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("Campaign name is required.");
      return;
    }

    setNameError(null);

    const registration = registrationRef.current;
    if (registration === null) {
      return;
    }

    await onSubmit(
      {
        description,
        name: trimmedName,
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
        <span className="field-label">Description</span>
        <textarea
          rows={5}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
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
