import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export type UnsavedChangesRegistration = {
  markCleanAndNavigate: (navigate: () => void) => void;
  setDirty: (isDirty: boolean) => void;
  unregister: () => void;
};

type UnsavedChangesContextValue = {
  hasDirtyForms: boolean;
  hasDirtyFormsRef: { current: boolean };
  registerForm: () => UnsavedChangesRegistration;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const formDirtyStateRef = useRef(new Map<number, boolean>());
  const nextFormIdRef = useRef(0);
  const hasDirtyFormsRef = useRef(false);
  const [hasDirtyForms, setHasDirtyForms] = useState(false);

  const updateDirtyState = useCallback(() => {
    const hasDirtyForms = Array.from(formDirtyStateRef.current.values()).some(Boolean);

    if (hasDirtyFormsRef.current !== hasDirtyForms) {
      hasDirtyFormsRef.current = hasDirtyForms;
      setHasDirtyForms(hasDirtyForms);
    }
  }, []);

  const registerForm = useCallback((): UnsavedChangesRegistration => {
    const formId = nextFormIdRef.current;
    nextFormIdRef.current += 1;
    formDirtyStateRef.current.set(formId, false);

    return {
      markCleanAndNavigate(navigate) {
        if (!formDirtyStateRef.current.has(formId)) {
          return;
        }

        formDirtyStateRef.current.set(formId, false);
        updateDirtyState();
        navigate();
      },
      setDirty(isDirty) {
        if (!formDirtyStateRef.current.has(formId)) {
          return;
        }

        formDirtyStateRef.current.set(formId, isDirty);
        updateDirtyState();
      },
      unregister() {
        if (formDirtyStateRef.current.delete(formId)) {
          updateDirtyState();
        }
      },
    };
  }, [updateDirtyState]);

  return (
    <UnsavedChangesContext.Provider value={{ hasDirtyForms, hasDirtyFormsRef, registerForm }}>
      {children}
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges(): UnsavedChangesContextValue {
  const unsavedChanges = useContext(UnsavedChangesContext);

  if (unsavedChanges === null) {
    throw new Error("Unsaved changes must be managed inside the app shell.");
  }

  return unsavedChanges;
}
