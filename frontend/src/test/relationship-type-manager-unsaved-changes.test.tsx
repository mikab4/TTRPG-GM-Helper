import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, Link, Outlet, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { UnsavedChangesGuard } from "../app/UnsavedChangesGuard";
import { UnsavedChangesProvider } from "../app/UnsavedChangesContext";
import { RelationshipTypeManager } from "../components/RelationshipTypeManager";
import type { RelationshipType } from "../types/relationshipTypes";

const relationshipFamilies = [
  { label: "Political", value: "political" },
  { label: "Social", value: "social" },
];

const relationshipTypes: RelationshipType[] = [
  {
    allowedSourceTypes: ["person"],
    allowedTargetTypes: ["person"],
    campaignId: "campaign-1",
    createdAt: "2026-07-01T00:00:00Z",
    family: "political",
    familyLabel: "Political",
    isCustom: true,
    isSymmetric: false,
    id: "relationship-type-governs",
    key: "governs",
    label: "governs",
    reverseLabel: "governed by",
    updatedAt: "2026-07-01T00:00:00Z",
  },
  {
    allowedSourceTypes: ["person"],
    allowedTargetTypes: ["person"],
    campaignId: "campaign-1",
    createdAt: "2026-07-02T00:00:00Z",
    family: "political",
    familyLabel: "Political",
    id: "relationship-type-advises",
    isCustom: true,
    isSymmetric: false,
    key: "advises",
    label: "advises",
    reverseLabel: "advised by",
    updatedAt: "2026-07-02T00:00:00Z",
  },
];

function RelationshipTypeManagerPage({
  onCreate = vi.fn().mockResolvedValue(true),
  onUpdate = vi.fn().mockResolvedValue(true),
}: {
  onCreate?: ReturnType<typeof vi.fn>;
  onUpdate?: ReturnType<typeof vi.fn>;
}) {
  return (
    <>
      <RelationshipTypeManager
        relationshipFamilies={relationshipFamilies}
        relationshipTypes={relationshipTypes}
        submitError={null}
        submitting={false}
        onCreate={onCreate}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        onUpdate={onUpdate}
      />
      <Link to="/next">Leave relationship types</Link>
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

describe("relationship type manager unsaved changes", () => {
  it("blocks navigation after a create draft changes", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <GuardedLayout />,
          children: [
            { index: true, element: <RelationshipTypeManagerPage /> },
            { path: "next", element: <p>Next page</p> },
          ],
        },
      ],
      { initialEntries: ["/"] },
    );

    render(<RouterProvider router={router} />);

    fireEvent.change(screen.getByLabelText("Custom Type Label"), { target: { value: "bodyguard of" } });
    fireEvent.click(screen.getByRole("link", { name: "Leave relationship types" }));

    expect(await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });

  it.each([
    ["family", () => fireEvent.change(screen.getByLabelText("Family"), { target: { value: "social" } })],
    ["reverse label", () => fireEvent.change(screen.getByLabelText("Reverse Label"), { target: { value: "guarded by" } })],
    ["symmetry", () => fireEvent.click(screen.getByLabelText("Symmetric type"))],
    [
      "source types",
      () => {
        fireEvent.change(screen.getByLabelText("Allowed Source Type"), { target: { value: "organization" } });
        fireEvent.click(screen.getByRole("button", { name: "Add source type" }));
      },
    ],
    [
      "target types",
      () => {
        fireEvent.change(screen.getByLabelText("Allowed Target Type"), { target: { value: "organization" } });
        fireEvent.click(screen.getByRole("button", { name: "Add target type" }));
      },
    ],
  ])("blocks navigation when create %s changes", async (_fieldName, changeField) => {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <GuardedLayout />,
          children: [
            { index: true, element: <RelationshipTypeManagerPage /> },
            { path: "next", element: <p>Next page</p> },
          ],
        },
      ],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);

    changeField();
    fireEvent.click(screen.getByRole("link", { name: "Leave relationship types" }));

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });

  it("keeps picker-only changes clean and clears a reverted create draft", () => {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <GuardedLayout />,
          children: [
            { index: true, element: <RelationshipTypeManagerPage /> },
            { path: "next", element: <p>Next page</p> },
          ],
        },
      ],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);

    fireEvent.change(screen.getByLabelText("Allowed Source Type"), { target: { value: "organization" } });
    fireEvent.change(screen.getByLabelText("Custom Type Label"), { target: { value: "bodyguard of " } });
    fireEvent.change(screen.getByLabelText("Custom Type Label"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("link", { name: "Leave relationship types" }));

    expect(router.state.location.pathname).toBe("/next");
  });

  it("prevents replacing or deleting a dirty rename until it is cancelled", () => {
    render(
      <UnsavedChangesProvider>
        <RelationshipTypeManager
          relationshipFamilies={relationshipFamilies}
          relationshipTypes={relationshipTypes}
          submitError={null}
          submitting={false}
          onCreate={vi.fn().mockResolvedValue(true)}
          onDelete={vi.fn().mockResolvedValue(undefined)}
          onUpdate={vi.fn().mockResolvedValue(true)}
        />
      </UnsavedChangesProvider>,
    );

    const governsCard = screen.getByText("governs").closest("article");
    const advisesCard = screen.getByText("advises").closest("article");
    if (!governsCard || !advisesCard) throw new Error("Expected relationship type cards.");
    fireEvent.click(within(governsCard).getByRole("button", { name: "Rename" }));
    fireEvent.change(within(governsCard).getByDisplayValue("governs"), { target: { value: "rules" } });

    expect(within(advisesCard).getByRole("button", { name: "Rename" })).toBeDisabled();
    expect(within(governsCard).getByRole("button", { name: "Delete" })).toBeDisabled();
    fireEvent.click(within(governsCard).getByRole("button", { name: "Cancel" }));
    expect(within(advisesCard).getByRole("button", { name: "Rename" })).toBeEnabled();
  });

  it("clears a rename guard when its normalized label returns to the baseline", () => {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <GuardedLayout />,
          children: [
            { index: true, element: <RelationshipTypeManagerPage /> },
            { path: "next", element: <p>Next page</p> },
          ],
        },
      ],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);
    const governsCard = screen.getByText("governs").closest("article");
    if (!governsCard) throw new Error("Expected governs card.");
    fireEvent.click(within(governsCard).getByRole("button", { name: "Rename" }));
    fireEvent.change(within(governsCard).getByDisplayValue("governs"), { target: { value: "governs " } });
    fireEvent.click(screen.getByRole("link", { name: "Leave relationship types" }));
    expect(router.state.location.pathname).toBe("/next");
  });

  it("keeps a failed create draft guarded", async () => {
    const failedCreate = vi.fn().mockResolvedValue(false);
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <GuardedLayout />,
          children: [
            { index: true, element: <RelationshipTypeManagerPage onCreate={failedCreate} /> },
            { path: "next", element: <p>Next page</p> },
          ],
        },
      ],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);
    fireEvent.change(screen.getByLabelText("Custom Type Label"), { target: { value: "bodyguard" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Custom Type" }));
    await waitFor(() => {
      expect(failedCreate).toHaveBeenCalledOnce();
    });
    fireEvent.click(screen.getByRole("link", { name: "Leave relationship types" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });

  it("keeps a failed rename draft guarded", async () => {
    const failedUpdate = vi.fn().mockResolvedValue(false);
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <GuardedLayout />,
          children: [
            { index: true, element: <RelationshipTypeManagerPage onUpdate={failedUpdate} /> },
            { path: "next", element: <p>Next page</p> },
          ],
        },
      ],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);
    const governsCard = screen.getByText("governs").closest("article");
    if (!governsCard) throw new Error("Expected governs card.");
    fireEvent.click(within(governsCard).getByRole("button", { name: "Rename" }));
    fireEvent.change(within(governsCard).getByDisplayValue("governs"), { target: { value: "rules" } });
    fireEvent.click(within(governsCard).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(failedUpdate).toHaveBeenCalledOnce();
    });
    fireEvent.click(screen.getByRole("link", { name: "Leave relationship types" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });

  it("keeps a dirty rename after successful create resets its draft", async () => {
    const successfulCreate = vi.fn().mockResolvedValue(true);
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <GuardedLayout />,
          children: [
            {
              index: true,
              element: <RelationshipTypeManagerPage onCreate={successfulCreate} />,
            },
            { path: "next", element: <p>Next page</p> },
          ],
        },
      ],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);
    const governsCard = screen.getByText("governs").closest("article");
    if (!governsCard) throw new Error("Expected governs card.");
    fireEvent.click(within(governsCard).getByRole("button", { name: "Rename" }));
    fireEvent.change(within(governsCard).getByDisplayValue("governs"), { target: { value: "rules" } });
    fireEvent.change(screen.getByLabelText("Custom Type Label"), { target: { value: "bodyguard" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Custom Type" }));
    await waitFor(() => {
      expect(successfulCreate).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Custom Type Label")).toHaveValue("");
    });
    fireEvent.click(screen.getByRole("link", { name: "Leave relationship types" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });

  it("keeps a dirty create draft after successful rename closes its edit mode", async () => {
    const successfulUpdate = vi.fn().mockResolvedValue(true);
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <GuardedLayout />,
          children: [
            { index: true, element: <RelationshipTypeManagerPage onUpdate={successfulUpdate} /> },
            { path: "next", element: <p>Next page</p> },
          ],
        },
      ],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);
    fireEvent.change(screen.getByLabelText("Custom Type Label"), { target: { value: "bodyguard" } });
    const governsCard = screen.getByText("governs").closest("article");
    if (!governsCard) throw new Error("Expected governs card.");
    fireEvent.click(within(governsCard).getByRole("button", { name: "Rename" }));
    fireEvent.change(within(governsCard).getByDisplayValue("governs"), { target: { value: "rules" } });
    fireEvent.click(within(governsCard).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    });
    fireEvent.click(screen.getByRole("link", { name: "Leave relationship types" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });

  it("allows an unchanged rename to switch types and disables every mutation control while submitting", () => {
    const manager = (submitting: boolean) => (
      <RelationshipTypeManager
        relationshipFamilies={relationshipFamilies}
        relationshipTypes={relationshipTypes}
        submitError={null}
        submitting={submitting}
        onCreate={vi.fn().mockResolvedValue(true)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        onUpdate={vi.fn().mockResolvedValue(true)}
      />
    );
    const { rerender } = render(<UnsavedChangesProvider>{manager(false)}</UnsavedChangesProvider>);
    const governsCard = screen.getByText("governs").closest("article");
    const advisesCard = screen.getByText("advises").closest("article");
    if (!governsCard || !advisesCard) throw new Error("Expected relationship type cards.");
    fireEvent.click(within(governsCard).getByRole("button", { name: "Rename" }));
    fireEvent.click(within(advisesCard).getByRole("button", { name: "Rename" }));
    expect(within(advisesCard).getByDisplayValue("advises")).toBeInTheDocument();
    rerender(<UnsavedChangesProvider>{manager(true)}</UnsavedChangesProvider>);
    for (const control of screen.getAllByRole("button")) expect(control).toBeDisabled();
    for (const control of screen.getAllByRole("textbox")) expect(control).toBeDisabled();
    for (const control of screen.getAllByRole("combobox")) expect(control).toBeDisabled();
    expect(screen.getByLabelText("Symmetric type")).toBeDisabled();
  });
});
