import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

type RelationshipTypeResponse = {
  allowed_source_types: string[];
  allowed_target_types: string[];
  created_at: string;
  family: string;
  family_label: string;
  is_custom: boolean;
  is_symmetric: boolean;
  key: string;
  label: string;
  reverse_label: string | null;
  updated_at: string;
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    headers: new Headers({ "Content-Type": "application/json" }),
    json: () => Promise.resolve(body),
    ok: status >= 200 && status < 300,
    status,
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

function createRelationshipTypeResponse(
  key: string,
  label: string,
  reverseLabel: string | null,
  isSymmetric: boolean,
): RelationshipTypeResponse {
  return {
    allowed_source_types: ["person"],
    allowed_target_types: ["person"],
    created_at: "2026-07-31T12:00:00Z",
    family: "social",
    family_label: "Social",
    is_custom: true,
    is_symmetric: isSymmetric,
    key,
    label,
    reverse_label: reverseLabel,
    updated_at: "2026-07-31T12:00:00Z",
  };
}

function installRelationshipTypeApiMock(options?: { patchFails?: boolean }) {
  const patchRequests: Array<{ body: Record<string, unknown>; key: string }> = [];
  const relationshipTypes = [
    createRelationshipTypeResponse("bodyguard_of", "bodyguard of", "guarded by", false),
    createRelationshipTypeResponse("sibling_oath", "sibling oath", null, true),
  ];

  vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = getRequestUrl(input);

      if (requestUrl.endsWith("/campaigns/campaign-1")) {
        return Promise.resolve(
          jsonResponse({
            created_at: "2026-07-31T12:00:00Z",
            description: "Urban intrigue campaign",
            id: "campaign-1",
            name: "Shadows of Glass",
            owner_id: "owner-1",
            updated_at: "2026-07-31T12:00:00Z",
          }),
        );
      }

      if (requestUrl.endsWith("/relationship-families")) {
        return Promise.resolve(jsonResponse([{ label: "Social", value: "social" }]));
      }

      if (requestUrl.includes("/relationship-types?campaign_id=campaign-1")) {
        return Promise.resolve(jsonResponse(relationshipTypes));
      }

      const patchMatch = requestUrl.match(/relationship-types\/(bodyguard_of|sibling_oath)$/);
      if (patchMatch && init?.method === "PATCH") {
        const body = JSON.parse(typeof init.body === "string" ? init.body : "{}") as Record<string, unknown>;
        const key = patchMatch[1];
        patchRequests.push({ body, key });

        if (options?.patchFails) {
          return Promise.resolve(jsonResponse({ detail: "Relationship type label already exists for this campaign." }, 422));
        }

        const relationshipType = relationshipTypes.find((candidate) => candidate.key === key);
        if (!relationshipType) {
          throw new Error(`Unknown relationship type key: ${key}`);
        }
        relationshipType.label = typeof body.label === "string" ? body.label : relationshipType.label;
        if ("reverse_label" in body) {
          relationshipType.reverse_label = body.reverse_label as string | null;
        }

        return Promise.resolve(jsonResponse(relationshipType));
      }

      throw new Error(`Unhandled request URL: ${requestUrl}`);
    }),
  );

  return { patchRequests };
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

function getCard(label: string): HTMLElement {
  const card = screen.getByText(label).closest("article");
  if (!card) {
    throw new Error(`Expected ${label} relationship type card.`);
  }

  return card;
}

describe("relationship type directional label editing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("displays, edits, and serializes both asymmetric directional labels", async () => {
    const { patchRequests } = installRelationshipTypeApiMock();
    await renderRelationshipTypeManagementPage();
    const bodyguardCard = getCard("bodyguard of");

    expect(within(bodyguardCard).getByText("Forward label: bodyguard of")).toBeInTheDocument();
    expect(within(bodyguardCard).getByText("Reverse label: guarded by")).toBeInTheDocument();

    fireEvent.click(within(bodyguardCard).getByRole("button", { name: "Edit labels" }));
    expect(within(bodyguardCard).getByLabelText("Forward label for bodyguard of")).toHaveValue("bodyguard of");
    const reverseLabelInput = within(bodyguardCard).getByLabelText("Reverse label for bodyguard of");
    expect(reverseLabelInput).toHaveValue("guarded by");
    fireEvent.change(reverseLabelInput, { target: { value: "protected by" } });
    fireEvent.click(within(bodyguardCard).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(patchRequests).toEqual([
        { body: { label: "bodyguard of", reverse_label: "protected by" }, key: "bodyguard_of" },
      ]);
    });
    expect(within(getCard("bodyguard of")).getByText("Reverse label: protected by")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    fireEvent.click(within(getCard("bodyguard of")).getByRole("button", { name: "Edit labels" }));
    expect(within(getCard("bodyguard of")).getByLabelText("Forward label for bodyguard of")).toHaveValue("bodyguard of");
    expect(within(getCard("bodyguard of")).getByLabelText("Reverse label for bodyguard of")).toHaveValue("protected by");
  });

  it("preserves both asymmetric drafts after a failed save", async () => {
    installRelationshipTypeApiMock({ patchFails: true });
    await renderRelationshipTypeManagementPage();
    const bodyguardCard = getCard("bodyguard of");

    fireEvent.click(within(bodyguardCard).getByRole("button", { name: "Edit labels" }));
    fireEvent.change(within(bodyguardCard).getByLabelText("Forward label for bodyguard of"), {
      target: { value: "protects" },
    });
    fireEvent.change(within(bodyguardCard).getByLabelText("Reverse label for bodyguard of"), {
      target: { value: "protected by" },
    });
    fireEvent.click(within(bodyguardCard).getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("A relationship type with that label already exists in this campaign."),
    ).toBeInTheDocument();
    expect(within(bodyguardCard).getByLabelText("Forward label for bodyguard of")).toHaveValue("protects");
    expect(within(bodyguardCard).getByLabelText("Reverse label for bodyguard of")).toHaveValue("protected by");
    expect(within(bodyguardCard).getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("omits reverse labels from symmetric cards, forms, and PATCH payloads", async () => {
    const { patchRequests } = installRelationshipTypeApiMock();
    await renderRelationshipTypeManagementPage();
    const siblingOathCard = getCard("sibling oath");

    expect(within(siblingOathCard).getByText("Forward label: sibling oath")).toBeInTheDocument();
    expect(within(siblingOathCard).queryByText(/^Reverse label:/)).toBeNull();
    fireEvent.click(within(siblingOathCard).getByRole("button", { name: "Edit labels" }));
    expect(within(siblingOathCard).getByLabelText("Forward label for sibling oath")).toHaveValue("sibling oath");
    expect(within(siblingOathCard).queryByLabelText("Reverse label for sibling oath")).toBeNull();
    fireEvent.change(within(siblingOathCard).getByLabelText("Forward label for sibling oath"), {
      target: { value: "sworn siblings" },
    });
    fireEvent.click(within(siblingOathCard).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(patchRequests).toEqual([{ body: { label: "sworn siblings" }, key: "sibling_oath" }]);
    });
  });

  it("disables save for blank required directional labels", async () => {
    installRelationshipTypeApiMock();
    await renderRelationshipTypeManagementPage();
    const bodyguardCard = getCard("bodyguard of");
    const siblingOathCard = getCard("sibling oath");

    fireEvent.click(within(bodyguardCard).getByRole("button", { name: "Edit labels" }));
    fireEvent.change(within(bodyguardCard).getByLabelText("Forward label for bodyguard of"), { target: { value: "   " } });
    expect(within(bodyguardCard).getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(within(bodyguardCard).getByLabelText("Forward label for bodyguard of"), {
      target: { value: "bodyguard of" },
    });
    fireEvent.change(within(bodyguardCard).getByLabelText("Reverse label for bodyguard of"), { target: { value: "   " } });
    expect(within(bodyguardCard).getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(within(bodyguardCard).getByRole("button", { name: "Cancel" }));

    fireEvent.click(within(siblingOathCard).getByRole("button", { name: "Edit labels" }));
    fireEvent.change(within(siblingOathCard).getByLabelText("Forward label for sibling oath"), {
      target: { value: "   " },
    });
    expect(within(siblingOathCard).getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(within(siblingOathCard).getByLabelText("Forward label for sibling oath"), {
      target: { value: "sworn siblings" },
    });
    expect(within(siblingOathCard).getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("restores both asymmetric drafts after cancelling an edit", async () => {
    installRelationshipTypeApiMock();
    await renderRelationshipTypeManagementPage();
    const bodyguardCard = getCard("bodyguard of");

    fireEvent.click(within(bodyguardCard).getByRole("button", { name: "Edit labels" }));
    fireEvent.change(within(bodyguardCard).getByLabelText("Forward label for bodyguard of"), {
      target: { value: "protects" },
    });
    fireEvent.change(within(bodyguardCard).getByLabelText("Reverse label for bodyguard of"), {
      target: { value: "protected by" },
    });
    fireEvent.click(within(bodyguardCard).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(bodyguardCard).getByRole("button", { name: "Edit labels" }));

    expect(within(bodyguardCard).getByLabelText("Forward label for bodyguard of")).toHaveValue("bodyguard of");
    expect(within(bodyguardCard).getByLabelText("Reverse label for bodyguard of")).toHaveValue("guarded by");
  });
});
