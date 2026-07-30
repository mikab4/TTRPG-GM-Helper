import { useEffect, useRef, useState } from "react";

import { deleteCampaign } from "../api/campaigns";
import type { Campaign } from "../types/campaigns";

type CampaignDeleteDialogProps = {
  campaign: Campaign | null;
  onCancel: () => void;
  onDeleted: (campaign: Campaign) => void;
};

const supportsNativeModalDialog =
  typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal === "function";

export function CampaignDeleteDialog({ campaign, onCancel, onDeleted }: CampaignDeleteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const deletionInFlightRef = useRef(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const campaignId = campaign?.id;

  useEffect(() => {
    setDeleteError(null);

    if (!campaignId) {
      return;
    }

    const dialog = dialogRef.current;
    if (dialog && !dialog.open && typeof dialog.showModal === "function") {
      dialog.showModal();
    }
    deleteButtonRef.current?.focus();
  }, [campaignId]);

  useEffect(() => {
    if (deleteError) {
      deleteButtonRef.current?.focus();
    }
  }, [deleteError]);

  if (!campaign) {
    return null;
  }

  function closeDialog({ resetDeletionGuard }: { resetDeletionGuard: boolean }) {
    if (resetDeletionGuard) {
      deletionInFlightRef.current = false;
    }
    if (dialogRef.current?.open && typeof dialogRef.current.close === "function") {
      dialogRef.current.close();
    }
  }

  function handleCancel() {
    if (deletionInFlightRef.current) {
      return;
    }

    setDeleteError(null);
    closeDialog({ resetDeletionGuard: true });
    onCancel();
  }

  async function handleDelete() {
    const campaignToDelete = campaign;
    if (!campaignToDelete || deletionInFlightRef.current) {
      return;
    }

    deletionInFlightRef.current = true;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteCampaign(campaignToDelete.id);
      closeDialog({ resetDeletionGuard: false });
      onDeleted(campaignToDelete);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unknown campaign delete failure.");
    } finally {
      deletionInFlightRef.current = false;
      setIsDeleting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-describedby="campaign-delete-description"
      aria-labelledby="campaign-delete-title"
      className="campaign-delete-dialog"
      open={supportsNativeModalDialog ? undefined : true}
      onCancel={(event) => {
        event.preventDefault();
        handleCancel();
      }}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <h2 id="campaign-delete-title">Delete {campaign.name}?</h2>
        <p id="campaign-delete-description">
          This will permanently delete this campaign and its campaign-owned records. This action cannot be undone.
        </p>
        {deleteError ? (
          <p className="field-error" role="alert">
            {deleteError}
          </p>
        ) : null}
        <div className="campaign-delete-dialog-actions">
          <button disabled={isDeleting} type="button" onClick={handleCancel}>
            Cancel
          </button>
          <button
            ref={deleteButtonRef}
            className="danger-button"
            disabled={isDeleting}
            type="button"
            onClick={() => {
              void handleDelete();
            }}
          >
            {isDeleting ? "Deleting..." : "Delete campaign"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
