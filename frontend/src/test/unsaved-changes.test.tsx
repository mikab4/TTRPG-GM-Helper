import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { createMemoryRouter, Link, Outlet, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UnsavedChangesProvider, useUnsavedChanges } from "../app/UnsavedChangesContext";
import { UnsavedChangesGuard } from "../app/UnsavedChangesGuard";

const originalShowModalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalCloseDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");

function DirtyForm() {
  const { registerForm } = useUnsavedChanges();
  const registrationRef = useRef<ReturnType<typeof registerForm> | null>(null);

  useEffect(() => {
    const registration = registerForm();
    registrationRef.current = registration;

    return registration.unregister;
  }, [registerForm]);

  return (
    <>
      <button type="button" onClick={() => registrationRef.current?.setDirty(true)}>
        Edit form
      </button>
      <Link to="/next">Leave form</Link>
    </>
  );
}

function GuardedLayout() {
  return (
    <UnsavedChangesProvider>
      <UnsavedChangesGuard />
      <Outlet />
    </UnsavedChangesProvider>
  );
}

describe("unsaved changes guard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (originalShowModalDescriptor)
      Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModalDescriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    if (originalCloseDescriptor) Object.defineProperty(HTMLDialogElement.prototype, "close", originalCloseDescriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  });

  it("blocks dirty Link navigation until the user stays on the form", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <GuardedLayout />,
          children: [
            { index: true, element: <DirtyForm /> },
            { path: "next", element: <p>Next page</p> },
          ],
        },
      ],
      { initialEntries: ["/"] },
    );

    render(<RouterProvider router={router} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit form" }));
    fireEvent.click(screen.getByRole("link", { name: "Leave form" }));

    expect(await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");

    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    expect(router.state.location.pathname).toBe("/");
  });

  it("opens and closes a native dialog around a blocked navigation", async () => {
    const showModalMock = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    const closeDialogMock = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    });
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: showModalMock });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: closeDialogMock });

    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <GuardedLayout />,
          children: [
            { index: true, element: <DirtyForm /> },
            { path: "next", element: <p>Next page</p> },
          ],
        },
      ],
      { initialEntries: ["/"] },
    );

    render(<RouterProvider router={router} />);
    closeDialogMock.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Edit form" }));
    fireEvent.click(screen.getByRole("link", { name: "Leave form" }));

    expect(await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeInstanceOf(HTMLDialogElement);
    expect(showModalMock).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    expect(closeDialogMock).toHaveBeenCalledOnce();
  });

  it("keeps navigation blocked for Escape and restores focus after Stay", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <GuardedLayout />,
          children: [
            { index: true, element: <DirtyForm /> },
            { path: "next", element: <p>Next page</p> },
          ],
        },
      ],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit form" }));
    const leaveLink = screen.getByRole("link", { name: "Leave form" });
    leaveLink.focus();
    fireEvent.click(leaveLink);
    const dialog = await screen.findByRole("alertdialog");
    expect(screen.getByRole("button", { name: "Stay" })).toHaveFocus();
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(router.state.location.pathname).toBe("/");
    await waitFor(() => {
      expect(leaveLink).toHaveFocus();
    });
  });

  it("discards changes only from the dialog and treats its backdrop as Stay", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <GuardedLayout />,
          children: [
            { index: true, element: <DirtyForm /> },
            { path: "next", element: <p>Next page</p> },
          ],
        },
      ],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit form" }));
    fireEvent.click(screen.getByRole("link", { name: "Leave form" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByText("Your edits have not been saved."));
    expect(router.state.location.pathname).toBe("/");
    fireEvent.click(dialog);
    expect(router.state.location.pathname).toBe("/");

    fireEvent.click(screen.getByRole("link", { name: "Leave form" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard changes" }));
    expect(router.state.location.pathname).toBe("/next");
  });
});
