import { useEffect, useRef } from "react";

type DeleteConfirmationDialogProps = {
  error: string | null;
  isDeleting: boolean;
  recordName: string;
  warningText: string;
  onCancel: () => void;
  onConfirm: () => void;
};

const supportsNativeModalDialog =
  typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal === "function";

export function DeleteConfirmationDialog({
  error,
  isDeleting,
  recordName,
  warningText,
  onCancel,
  onConfirm,
}: DeleteConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open && typeof dialog.showModal === "function") {
      dialog.showModal();
    }
    confirmButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (error) {
      confirmButtonRef.current?.focus();
    }
  }, [error]);

  return (
    <dialog
      ref={dialogRef}
      aria-describedby="delete-confirmation-description"
      aria-labelledby="delete-confirmation-title"
      className="campaign-delete-dialog"
      open={supportsNativeModalDialog ? undefined : true}
      onCancel={(event) => {
        event.preventDefault();
        if (!isDeleting) {
          onCancel();
        }
      }}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <h2 id="delete-confirmation-title">Delete {recordName}?</h2>
        <p id="delete-confirmation-description">{warningText}</p>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="campaign-delete-dialog-actions">
          <button disabled={isDeleting} type="button" onClick={onCancel}>
            Cancel
          </button>
          <button ref={confirmButtonRef} className="danger-button" disabled={isDeleting} type="button" onClick={onConfirm}>
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
