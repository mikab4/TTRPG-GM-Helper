import { useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";

import { useUnsavedChanges } from "./UnsavedChangesContext";

export function UnsavedChangesGuard() {
  const { hasDirtyForms, hasDirtyFormsRef } = useUnsavedChanges();
  const blocker = useBlocker(() => hasDirtyFormsRef.current);
  const stayButtonRef = useRef<HTMLButtonElement>(null);
  const initiatingElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!hasDirtyFormsRef.current) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasDirtyForms, hasDirtyFormsRef]);

  useEffect(() => {
    if (blocker.state !== "blocked") {
      return;
    }

    initiatingElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stayButtonRef.current?.focus();
  }, [blocker.state]);

  if (blocker.state !== "blocked") {
    return null;
  }

  function stayOnPage() {
    blocker.reset?.();
    initiatingElementRef.current?.focus();
  }

  return (
    <div
      className="unsaved-changes-backdrop"
      onMouseDown={() => {
        stayOnPage();
      }}
    >
      <section
        aria-describedby="unsaved-changes-description"
        aria-labelledby="unsaved-changes-title"
        aria-modal="true"
        className="unsaved-changes-dialog"
        role="alertdialog"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            stayOnPage();
          }
        }}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <h2 id="unsaved-changes-title">Discard unsaved changes?</h2>
        <p id="unsaved-changes-description">Your edits have not been saved.</p>
        <div className="action-row">
          <button ref={stayButtonRef} className="secondary-button" type="button" onClick={stayOnPage}>
            Stay
          </button>
          <button
            className="danger-button"
            type="button"
            onClick={() => {
              blocker.proceed();
            }}
          >
            Discard changes
          </button>
        </div>
      </section>
    </div>
  );
}
