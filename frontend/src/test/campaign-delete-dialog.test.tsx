import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CampaignDeleteDialog } from "../components/CampaignDeleteDialog";
import type { Campaign } from "../types/campaigns";

const { deleteCampaignMock } = vi.hoisted(() => ({ deleteCampaignMock: vi.fn() }));

vi.mock("../api/campaigns", () => ({ deleteCampaign: deleteCampaignMock }));

const campaign: Campaign = {
  id: "campaign-1",
  ownerId: "owner-1",
  name: "Shadows of Glass",
  description: "Urban intrigue campaign",
  createdAt: "2026-04-08T12:00:00Z",
  updatedAt: "2026-04-08T12:00:00Z",
};

describe("CampaignDeleteDialog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cancels a named campaign deletion without issuing DELETE", () => {
    const originalCloseDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
    const closeDialogMock = vi.fn();
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: closeDialogMock });
    const onCancel = vi.fn(() => {
      expect(closeDialogMock).toHaveBeenCalledOnce();
    });

    render(<CampaignDeleteDialog campaign={campaign} onCancel={onCancel} onDeleted={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Delete Shadows of Glass?" })).toHaveTextContent(
      "permanently delete this campaign and its campaign-owned records",
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(deleteCampaignMock).not.toHaveBeenCalled();
    if (originalCloseDescriptor) {
      Object.defineProperty(HTMLDialogElement.prototype, "close", originalCloseDescriptor);
    } else {
      Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
    }
  });

  it("announces a DELETE failure and keeps the dialog open", async () => {
    deleteCampaignMock.mockRejectedValueOnce(new Error("Campaign is locked."));

    render(<CampaignDeleteDialog campaign={campaign} onCancel={vi.fn()} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete campaign" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Campaign is locked.");
    expect(screen.getByRole("dialog", { name: "Delete Shadows of Glass?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete campaign" })).toHaveFocus();
  });

  it("issues one DELETE while a deletion is pending", async () => {
    let resolveDelete: (() => void) | undefined;
    deleteCampaignMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    const onDeleted = vi.fn();

    render(<CampaignDeleteDialog campaign={campaign} onCancel={vi.fn()} onDeleted={onDeleted} />);

    const deleteButton = screen.getByRole("button", { name: "Delete campaign" });
    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);

    expect(deleteCampaignMock).toHaveBeenCalledOnce();
    expect(deleteButton).toBeDisabled();
    resolveDelete?.();

    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalledWith(campaign);
    });
  });

  it("prevents Escape dismissal while deletion is pending", () => {
    deleteCampaignMock.mockImplementationOnce(() => new Promise<void>(() => undefined));
    const onCancel = vi.fn();

    render(<CampaignDeleteDialog campaign={campaign} onCancel={onCancel} onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete campaign" }));
    fireEvent(screen.getByRole("dialog", { name: "Delete Shadows of Glass?" }), new Event("cancel", { cancelable: true }));

    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Delete Shadows of Glass?" })).toBeInTheDocument();
  });
});
