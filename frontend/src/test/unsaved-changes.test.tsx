import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { createMemoryRouter, Link, Outlet, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { UnsavedChangesProvider, useUnsavedChanges } from "../app/UnsavedChangesContext";
import { UnsavedChangesGuard } from "../app/UnsavedChangesGuard";

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
});
