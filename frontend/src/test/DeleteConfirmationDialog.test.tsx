import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";

describe("DeleteConfirmationDialog", () => {
  it("keeps a failed deletion open and exposes the parent-provided error", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <DeleteConfirmationDialog
        error="Relationship is locked."
        isDeleting={false}
        recordName="Rowan governs Blackharbor"
        warningText="This relationship will be permanently deleted."
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Delete Rowan governs Blackharbor?" })).toHaveTextContent(
      "Relationship is locked.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("disables confirmation and cancellation while a deletion is pending", () => {
    render(
      <DeleteConfirmationDialog
        error={null}
        isDeleting
        recordName="Rowan"
        warningText="This entity will be permanently deleted."
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Deleting..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
