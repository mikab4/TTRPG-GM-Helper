import { useCallback, useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";

import { useUnsavedChanges } from "./UnsavedChangesContext";

function supportsNativeModalDialog(): boolean {
  return typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal === "function";
}

export function UnsavedChangesGuard() {
  const { hasDirtyForms, hasDirtyFormsRef } = useUnsavedChanges();
  const blocker = useBlocker(() => hasDirtyFormsRef.current);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isDialogOpenRef = useRef(false);
  const stayButtonRef = useRef<HTMLButtonElement>(null);
  const initiatingElementRef = useRef<HTMLElement | null>(null);

  const closeDialog = useCallback(() => {
    const dialog = dialogRef.current;
    if (isDialogOpenRef.current && dialog && typeof dialog.close === "function") {
      dialog.close();
    }
    isDialogOpenRef.current = false;
  }, []);

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
    const dialog = dialogRef.current;

    if (blocker.state === "blocked") {
      initiatingElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (dialog && !dialog.open && typeof dialog.showModal === "function") {
        dialog.showModal();
      }
      isDialogOpenRef.current = true;
      stayButtonRef.current?.focus();
    } else {
      closeDialog();
    }

    return () => {
      closeDialog();
    };
  }, [blocker.state, closeDialog]);

  function stayOnPage() {
    closeDialog();
    blocker.reset?.();
    window.setTimeout(() => {
      initiatingElementRef.current?.focus();
    }, 0);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-describedby="unsaved-changes-description"
      aria-labelledby="unsaved-changes-title"
      className="unsaved-changes-dialog"
      open={!supportsNativeModalDialog() && blocker.state === "blocked"}
      role="alertdialog"
      onCancel={(event) => {
        event.preventDefault();
        stayOnPage();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          stayOnPage();
        }
      }}
    >
      <div className="unsaved-changes-dialog-content">
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
              closeDialog();
              blocker.proceed?.();
            }}
          >
            Discard changes
          </button>
        </div>
      </div>
    </dialog>
  );
}
