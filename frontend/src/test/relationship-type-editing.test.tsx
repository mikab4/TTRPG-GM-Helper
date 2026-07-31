import { act, fireEvent, render, screen, within } from "@testing-library/react";
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

type ApiMockOptions = {
  listTypesFailsAfterPatch?: boolean;
  postFails?: boolean;
  patchFails?: boolean;
  relationshipFamiliesFail?: boolean;
  relationshipTypes?: RelationshipTypeResponse[];
  relationshipTypesFail?: boolean;
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    headers: new Headers({ "Content-Type": "application/json" }),
    json: () => Promise.resolve(body),
    ok: status < 300,
    status,
  } as Response;
}

function relationshipType(
  key: string,
  label: string,
  createdAt: string,
  isCustom = true,
  reverseLabel: string | null = null,
): RelationshipTypeResponse {
  return {
    allowed_source_types: ["person"],
    allowed_target_types: ["person"],
    created_at: createdAt,
    family: "social",
    family_label: "Social",
    is_custom: isCustom,
    is_symmetric: reverseLabel === null,
    key,
    label,
    reverse_label: reverseLabel,
    updated_at: createdAt,
  };
}

function campaign(id: string, name: string) {
  return {
    created_at: "2026-07-31T12:00:00Z",
    description: null,
    id,
    name,
    owner_id: "owner-1",
    updated_at: "2026-07-31T12:00:00Z",
  };
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestBody(init: RequestInit | undefined): string {
  return typeof init?.body === "string" ? init.body : "{}";
}

function installApiMock(options: ApiMockOptions = {}) {
  const relationshipTypes = options.relationshipTypes ?? [
    relationshipType("older", "older custom", "2026-07-01T00:00:00Z"),
    relationshipType("newer", "newer custom", "2026-07-02T00:00:00Z", true, "newer reverse"),
    relationshipType("allies", "allies", "2020-01-01T00:00:00Z", false),
    relationshipType("betrays", "betrays", "2020-01-01T00:00:00Z", false, "betrayed by"),
  ];
  const calls = {
    families: 0,
    listTypes: 0,
    patch: [] as Array<{ body: Record<string, unknown>; key: string }>,
    post: 0,
  };
  vi.stubEnv("VITE_API_BASE_URL", "http://example.test/api");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/compatibility/entity-types"))
        return Promise.resolve(jsonResponse({ has_issues: false, issue_count: 0, issues: [] }));
      if (url.endsWith("/campaigns"))
        return Promise.resolve(
          jsonResponse([campaign("campaign-1", "Shadows of Glass"), campaign("campaign-2", "Ashes of Dawn")]),
        );
      if (url.endsWith("/campaigns/campaign-1"))
        return Promise.resolve(jsonResponse(campaign("campaign-1", "Shadows of Glass")));
      if (url.endsWith("/campaigns/campaign-2"))
        return Promise.resolve(jsonResponse(campaign("campaign-2", "Ashes of Dawn")));
      if (url.endsWith("/relationship-families")) {
        calls.families += 1;
        return Promise.resolve(
          options.relationshipFamiliesFail
            ? jsonResponse({ detail: "Families unavailable" }, 500)
            : jsonResponse([{ label: "Social", value: "social" }]),
        );
      }
      if (url.includes("/relationship-types?campaign_id=")) {
        calls.listTypes += 1;
        return Promise.resolve(
          options.relationshipTypesFail || (options.listTypesFailsAfterPatch && calls.patch.length > 0)
            ? jsonResponse({ detail: "Types unavailable" }, 500)
            : jsonResponse(relationshipTypes),
        );
      }
      if (url.endsWith("/campaigns/campaign-1/relationship-types") && init?.method === "POST") {
        calls.post += 1;
        const body = JSON.parse(requestBody(init)) as {
          label: string;
          reverse_label: string | null;
          is_symmetric: boolean;
        };
        if (options.postFails) {
          return Promise.resolve(jsonResponse({ detail: "Relationship type label already exists for this campaign." }, 422));
        }
        relationshipTypes.push(
          relationshipType(
            "bodyguard_of",
            body.label,
            "2026-07-31T12:00:00Z",
            true,
            body.is_symmetric ? null : body.reverse_label,
          ),
        );
        return Promise.resolve(jsonResponse(relationshipTypes.at(-1)));
      }
      const patchMatch = url.match(/relationship-types\/([^/]+)$/);
      if (patchMatch && init?.method === "PATCH") {
        const body = JSON.parse(requestBody(init)) as Record<string, unknown>;
        calls.patch.push({ body, key: patchMatch[1] });
        if (options.patchFails) {
          return Promise.resolve(jsonResponse({ detail: "Relationship type label already exists for this campaign." }, 422));
        }
        const updatedType = relationshipTypes.find((candidate) => candidate.key === patchMatch[1]);
        if (!updatedType) throw new Error(`Unknown relationship type key: ${patchMatch[1]}`);
        if (typeof body.label === "string") updatedType.label = body.label;
        if ("reverse_label" in body) updatedType.reverse_label = body.reverse_label as string | null;
        return Promise.resolve(jsonResponse(updatedType));
      }
      throw new Error(`Unhandled request URL: ${url}`);
    }),
  );
  return calls;
}

async function renderApplication(initialEntries: string[], initialIndex = initialEntries.length - 1) {
  const { routes } = await import("../app/routes");
  const router = createMemoryRouter(routes, { initialEntries, initialIndex });
  render(<RouterProvider router={router} />);
  return router;
}

function card(label: string): HTMLElement {
  const result = screen.getByText(label).closest("article");
  if (!result) throw new Error(`Missing relationship type card ${label}.`);
  return result;
}

describe("relationship type routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("loads the shipped inventory route with custom newest-first and built-ins alphabetical", async () => {
    installApiMock();
    await renderApplication(["/campaigns/campaign-1/relationship-types"]);
    await screen.findByRole("heading", { name: "Relationship Type Management" });

    expect(screen.getAllByRole("strong").map((element) => element.textContent)).toEqual([
      "newer custom",
      "older custom",
      "allies",
      "betrays",
    ]);
    expect(within(card("allies")).queryByRole("button", { name: /Edit labels|Delete/ })).toBeNull();
    expect(within(card("newer custom")).getByRole("button", { name: "Edit labels" })).toBeEnabled();
    expect(within(card("newer custom")).getByText("Reverse label: newer reverse")).toBeInTheDocument();
  });

  it("shows a contextual creation action when the inventory has no custom types", async () => {
    installApiMock({ relationshipTypes: [relationshipType("allies", "allies", "2020-01-01T00:00:00Z", false)] });
    await renderApplication(["/campaigns/campaign-1/relationship-types"]);
    await screen.findByText("No custom relationship types yet. Create one to tailor this campaign.");
    expect(screen.getAllByRole("link", { name: "Create custom type" })).toHaveLength(2);
  });

  it("renders the inventory load failure through the real workspace route", async () => {
    installApiMock({ relationshipTypesFail: true });
    await renderApplication(["/campaigns/campaign-1/relationship-types"]);
    expect(await screen.findByRole("heading", { name: "Relationship types unavailable" })).toBeInTheDocument();
  });

  it("directly loads the creation route without fetching the inventory", async () => {
    const calls = installApiMock();
    await renderApplication(["/campaigns/campaign-1/relationship-types/new"]);
    expect(await screen.findByRole("heading", { name: "Create Custom Relationship Type" })).toBeInTheDocument();
    expect(calls.families).toBe(1);
    expect(calls.listTypes).toBe(0);
  });

  it("renders the creation route load failure", async () => {
    installApiMock({ relationshipFamiliesFail: true });
    await renderApplication(["/campaigns/campaign-1/relationship-types/new"]);
    expect(await screen.findByRole("heading", { name: "Relationship types unavailable" })).toBeInTheDocument();
  });

  it("guards dirty creation Back navigation and dirty inline edits during campaign switching", async () => {
    installApiMock();
    const createRouter = await renderApplication(["/campaigns/campaign-1/relationship-types/new"]);
    await screen.findByRole("heading", { name: "Create Custom Relationship Type" });
    fireEvent.change(screen.getByLabelText("Custom Type Label"), { target: { value: "bodyguard of" } });
    fireEvent.click(screen.getByRole("link", { name: "Back To Relationship Types" }));
    expect(await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeInTheDocument();
    expect(createRouter.state.location.pathname).toBe("/campaigns/campaign-1/relationship-types/new");

    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    await screen.findByRole("heading", { name: "Relationship Type Management" });
    fireEvent.click(within(card("newer custom")).getByRole("button", { name: "Edit labels" }));
    fireEvent.change(within(card("newer custom")).getByLabelText("Forward label for newer custom"), {
      target: { value: "revised" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Select campaign" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Ashes of Dawn" }));
    expect(await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeInTheDocument();
  });

  it("clears the creation guard, prevents double submit, and replaces the completed form history entry", async () => {
    const calls = installApiMock();
    const router = await renderApplication([
      "/campaigns/campaign-1/relationship-types",
      "/campaigns/campaign-1/relationship-types/new",
    ]);
    await screen.findByRole("heading", { name: "Create Custom Relationship Type" });
    fireEvent.change(screen.getByLabelText("Custom Type Label"), { target: { value: "bodyguard of" } });
    fireEvent.change(screen.getByLabelText("Reverse Label"), { target: { value: "guarded by" } });
    const submit = screen.getByRole("button", { name: "Add Custom Type" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await screen.findByRole("heading", { name: "Relationship Type Management" });
    expect(calls.post).toBe(1);
    await act(async () => {
      await router.navigate(-1);
    });
    expect(await screen.findByRole("heading", { name: "Relationship Type Management" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Create Custom Relationship Type" })).toBeNull();
  });

  it("does not submit a blank forward label or a blank asymmetric reverse label", async () => {
    const calls = installApiMock();
    await renderApplication(["/campaigns/campaign-1/relationship-types/new"]);
    await screen.findByRole("heading", { name: "Create Custom Relationship Type" });

    fireEvent.click(screen.getByRole("button", { name: "Add Custom Type" }));
    expect(await screen.findByText("Enter a custom type label.")).toBeInTheDocument();
    expect(calls.post).toBe(0);

    fireEvent.change(screen.getByLabelText("Custom Type Label"), { target: { value: "bodyguard of" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Custom Type" }));
    expect(await screen.findByText("Enter a reverse label for an asymmetric type.")).toBeInTheDocument();
    expect(calls.post).toBe(0);
  });

  it("saves both asymmetric labels and serializes them in the PATCH request", async () => {
    const calls = installApiMock();
    await renderApplication(["/campaigns/campaign-1/relationship-types"]);
    await screen.findByRole("heading", { name: "Relationship Type Management" });
    const relationshipCard = card("newer custom");
    fireEvent.click(within(relationshipCard).getByRole("button", { name: "Edit labels" }));
    fireEvent.change(within(relationshipCard).getByLabelText("Forward label for newer custom"), {
      target: { value: "protects" },
    });
    fireEvent.change(within(relationshipCard).getByLabelText("Reverse label for newer custom"), {
      target: { value: "protected by" },
    });
    fireEvent.click(within(relationshipCard).getByRole("button", { name: "Save" }));
    await screen.findByText("Forward label: protects");
    expect(calls.patch).toEqual([{ body: { label: "protects", reverse_label: "protected by" }, key: "newer" }]);
  });

  it("omits the reverse label when saving a symmetric type", async () => {
    const calls = installApiMock();
    await renderApplication(["/campaigns/campaign-1/relationship-types"]);
    await screen.findByRole("heading", { name: "Relationship Type Management" });
    const relationshipCard = card("older custom");
    fireEvent.click(within(relationshipCard).getByRole("button", { name: "Edit labels" }));
    fireEvent.change(within(relationshipCard).getByLabelText("Forward label for older custom"), {
      target: { value: "sworn siblings" },
    });
    expect(within(relationshipCard).queryByLabelText("Reverse label for older custom")).toBeNull();
    fireEvent.click(within(relationshipCard).getByRole("button", { name: "Save" }));
    await screen.findByText("Forward label: sworn siblings");
    expect(calls.patch).toEqual([{ body: { label: "sworn siblings" }, key: "older" }]);
  });

  it("keeps a successful label update when the subsequent type reload would fail", async () => {
    const calls = installApiMock({ listTypesFailsAfterPatch: true });
    await renderApplication(["/campaigns/campaign-1/relationship-types"]);
    await screen.findByRole("heading", { name: "Relationship Type Management" });
    const relationshipCard = card("newer custom");
    fireEvent.click(within(relationshipCard).getByRole("button", { name: "Edit labels" }));
    fireEvent.change(within(relationshipCard).getByLabelText("Forward label for newer custom"), {
      target: { value: "protects" },
    });
    fireEvent.click(within(relationshipCard).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Forward label: protects")).toBeInTheDocument();
    expect(calls.listTypes).toBe(1);
    expect(screen.queryByText(/could not be saved/i)).toBeNull();
  });

  it("does not save blank directional labels and restores both labels when editing is cancelled", async () => {
    installApiMock();
    await renderApplication(["/campaigns/campaign-1/relationship-types"]);
    await screen.findByRole("heading", { name: "Relationship Type Management" });
    const relationshipCard = card("newer custom");
    fireEvent.click(within(relationshipCard).getByRole("button", { name: "Edit labels" }));
    const forwardLabel = within(relationshipCard).getByLabelText("Forward label for newer custom");
    const reverseLabel = within(relationshipCard).getByLabelText("Reverse label for newer custom");
    fireEvent.change(forwardLabel, { target: { value: " " } });
    expect(within(relationshipCard).getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(forwardLabel, { target: { value: "protects" } });
    fireEvent.change(reverseLabel, { target: { value: " " } });
    expect(within(relationshipCard).getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(within(relationshipCard).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(relationshipCard).getByRole("button", { name: "Edit labels" }));
    expect(within(relationshipCard).getByLabelText("Forward label for newer custom")).toHaveValue("newer custom");
    expect(within(relationshipCard).getByLabelText("Reverse label for newer custom")).toHaveValue("newer reverse");
  });

  it("preserves a failed asymmetric edit and keeps it guarded", async () => {
    installApiMock({ patchFails: true });
    const router = await renderApplication(["/campaigns/campaign-1/relationship-types"]);
    await screen.findByRole("heading", { name: "Relationship Type Management" });
    const relationshipCard = card("newer custom");
    fireEvent.click(within(relationshipCard).getByRole("button", { name: "Edit labels" }));
    fireEvent.change(within(relationshipCard).getByLabelText("Forward label for newer custom"), {
      target: { value: "protects" },
    });
    fireEvent.change(within(relationshipCard).getByLabelText("Reverse label for newer custom"), {
      target: { value: "protected by" },
    });
    fireEvent.click(within(relationshipCard).getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("A relationship type with that label already exists in this campaign."),
    ).toBeInTheDocument();
    expect(within(relationshipCard).getByLabelText("Forward label for newer custom")).toHaveValue("protects");
    expect(within(relationshipCard).getByLabelText("Reverse label for newer custom")).toHaveValue("protected by");
    fireEvent.click(screen.getByRole("link", { name: "Back To Relationships" }));
    expect(await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/campaigns/campaign-1/relationship-types");
  });

  it("preserves a failed creation draft and keeps it guarded", async () => {
    installApiMock({ postFails: true });
    const router = await renderApplication(["/campaigns/campaign-1/relationship-types/new"]);
    await screen.findByRole("heading", { name: "Create Custom Relationship Type" });
    fireEvent.change(screen.getByLabelText("Custom Type Label"), { target: { value: "bodyguard of" } });
    fireEvent.change(screen.getByLabelText("Reverse Label"), { target: { value: "guarded by" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Custom Type" }));
    expect(
      await screen.findByText("A relationship type with that label already exists in this campaign."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Custom Type Label")).toHaveValue("bodyguard of");
    expect(screen.getByLabelText("Reverse Label")).toHaveValue("guarded by");
    fireEvent.click(screen.getByRole("link", { name: "Back To Relationship Types" }));
    expect(await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/campaigns/campaign-1/relationship-types/new");
  });
});
