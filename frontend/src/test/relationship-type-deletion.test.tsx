import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

type DeferredValue<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferredValue<T>(): DeferredValue<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    headers: new Headers({ "Content-Type": "application/json" }),
    json: () => Promise.resolve(body),
    ok: status >= 200 && status < 300,
    status,
  } as Response;
}

function emptyResponse(): Response {
  return {
    headers: new Headers(),
    ok: true,
    status: 204,
  } as Response;
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

const customRelationshipType = {
  allowed_source_types: ["person"],
  allowed_target_types: ["person", "organization"],
  created_at: "2026-04-12T12:00:00Z",
  family: "social",
  family_label: "Social",
  is_custom: true,
  is_symmetric: false,
  key: "bodyguard_of",
  label: "bodyguard of",
  reverse_label: "guarded by",
  updated_at: "2026-04-12T12:00:00Z",
};

const builtInRelationshipType = {
  allowed_source_types: ["person", "organization"],
  allowed_target_types: ["location", "organization"],
  created_at: null,
  family: "political",
  family_label: "Political",
  is_custom: false,
  is_symmetric: false,
  key: "governs",
  label: "governs",
  reverse_label: "governed by",
  updated_at: null,
};

type DeleteImplementation = () => Promise<Response>;

function installRelationshipTypeApiMock(deleteImplementation: DeleteImplementation) {
  const deleteRequests: string[] = [];
  let relationshipTypeListRequestCount = 0;

  vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = getRequestUrl(input);

      if (requestUrl.endsWith("/campaigns/campaign-1")) {
        return Promise.resolve(
          jsonResponse({
            created_at: "2026-04-08T12:00:00Z",
            description: "Urban intrigue campaign",
            id: "campaign-1",
            name: "Shadows of Glass",
            owner_id: "owner-1",
            updated_at: "2026-04-08T12:00:00Z",
          }),
        );
      }

      if (requestUrl.endsWith("/relationship-families")) {
        return Promise.resolve(
          jsonResponse([
            { label: "Political", value: "political" },
            { label: "Social", value: "social" },
          ]),
        );
      }

      if (requestUrl.includes("/relationship-types?campaign_id=campaign-1")) {
        relationshipTypeListRequestCount += 1;
        return Promise.resolve(jsonResponse([customRelationshipType, builtInRelationshipType]));
      }

      if (requestUrl.endsWith("/campaigns/campaign-1/relationship-types/bodyguard_of") && init?.method === "DELETE") {
        deleteRequests.push(requestUrl);
        return deleteImplementation();
      }

      throw new Error(`Unhandled request URL: ${requestUrl}`);
    }),
  );

  return {
    deleteRequests,
    relationshipTypeListRequestCount: () => relationshipTypeListRequestCount,
  };
}

async function renderRelationshipTypeManagementPage() {
  const [{ UnsavedChangesProvider }, { RelationshipTypeManagementPage }] = await Promise.all([
    import("../app/UnsavedChangesContext"),
    import("../routes/RelationshipTypeManagementPage"),
  ]);
  const router = createMemoryRouter(
    [
      {
        path: "/campaigns/:campaignId/relationship-types",
        element: (
          <UnsavedChangesProvider>
            <RelationshipTypeManagementPage />
          </UnsavedChangesProvider>
        ),
      },
    ],
    { initialEntries: ["/campaigns/campaign-1/relationship-types"] },
  );

  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Relationship Type Management" });
}

function getCustomTypeDeleteButton(): HTMLButtonElement {
  const customTypeCard = screen.getByText("bodyguard of").closest("article");
  if (!customTypeCard) {
    throw new Error("Expected the custom relationship type card.");
  }

  return within(customTypeCard).getByRole("button", { name: "Delete" });
}

describe("relationship type deletion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("requires confirmation to delete a custom type while built-in types remain undeletable", async () => {
    const { deleteRequests } = installRelationshipTypeApiMock(() => Promise.resolve(emptyResponse()));
    await renderRelationshipTypeManagementPage();
    const builtInTypeCard = screen.getByText("governs").closest("article");
    if (!builtInTypeCard) {
      throw new Error("Expected the built-in relationship type card.");
    }

    fireEvent.click(getCustomTypeDeleteButton());

    expect(screen.getByRole("dialog", { name: "Delete bodyguard of?" })).toHaveTextContent(
      "This custom relationship type will be permanently deleted. Types currently used by relationships cannot be deleted.",
    );
    expect(deleteRequests).toHaveLength(0);
    expect(within(builtInTypeCard).queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("cancels a requested deletion without issuing DELETE", async () => {
    const { deleteRequests } = installRelationshipTypeApiMock(() => Promise.resolve(emptyResponse()));
    await renderRelationshipTypeManagementPage();

    fireEvent.click(getCustomTypeDeleteButton());
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Delete bodyguard of?" })).getByRole("button", { name: "Cancel" }),
    );

    expect(deleteRequests).toHaveLength(0);
    expect(screen.queryByRole("dialog", { name: "Delete bodyguard of?" })).toBeNull();
  });

  it("synchronously guards a pending deletion and removes the deleted type without reloading", async () => {
    const deferredDeleteResponse = createDeferredValue<Response>();
    const { deleteRequests, relationshipTypeListRequestCount } = installRelationshipTypeApiMock(
      () => deferredDeleteResponse.promise,
    );
    await renderRelationshipTypeManagementPage();
    fireEvent.click(getCustomTypeDeleteButton());
    const confirmationDialog = screen.getByRole("dialog", { name: "Delete bodyguard of?" });
    const confirmButton = within(confirmationDialog).getByRole("button", { name: "Delete" });

    act(() => {
      confirmButton.click();
      confirmButton.click();
    });

    expect(deleteRequests).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Deleting..." })).toBeDisabled();

    deferredDeleteResponse.resolve(emptyResponse());

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Delete bodyguard of?" })).toBeNull();
    });
    expect(screen.queryByText("bodyguard of")).toBeNull();
    expect(relationshipTypeListRequestCount()).toBe(1);
  });

  it("retains a failed deletion and clears its error when the confirmation is cancelled", async () => {
    installRelationshipTypeApiMock(() =>
      Promise.resolve(jsonResponse({ detail: "Relationship type cannot be deleted while it is in use." }, 409)),
    );
    await renderRelationshipTypeManagementPage();
    fireEvent.click(getCustomTypeDeleteButton());

    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Delete bodyguard of?" })).getByRole("button", { name: "Delete" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Relationship type cannot be deleted while it is in use.");
    expect(screen.getByRole("dialog", { name: "Delete bodyguard of?" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Delete bodyguard of?" })).toBeNull();

    fireEvent.click(getCustomTypeDeleteButton());
    expect(screen.getByRole("dialog", { name: "Delete bodyguard of?" })).not.toHaveTextContent(
      "Relationship type cannot be deleted while it is in use.",
    );
  });
});
