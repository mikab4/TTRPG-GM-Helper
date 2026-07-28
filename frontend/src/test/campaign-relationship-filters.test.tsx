import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CampaignRelationshipsTab } from "../routes/CampaignRelationshipsTab";
import type { Campaign } from "../types/campaigns";
import type { Entity } from "../types/entities";
import type { Relationship } from "../types/relationships";
import type { RelationshipType } from "../types/relationshipTypes";

const apiMocks = vi.hoisted(() => ({
  listCampaignEntities: vi.fn(),
  listRelationshipTypes: vi.fn(),
  listRelationships: vi.fn(),
}));

vi.mock("../api/entities", () => ({ listCampaignEntities: apiMocks.listCampaignEntities }));
vi.mock("../api/relationships", () => ({
  deleteRelationship: vi.fn(),
  listRelationships: apiMocks.listRelationships,
}));
vi.mock("../api/relationshipTypes", () => ({ listRelationshipTypes: apiMocks.listRelationshipTypes }));

const campaignOne: Campaign = {
  id: "campaign-1",
  ownerId: "owner-1",
  name: "Shadows of Glass",
  description: null,
  createdAt: "2026-04-08T12:00:00Z",
  updatedAt: "2026-04-08T12:00:00Z",
};

const campaignOneEntities: Entity[] = [
  {
    id: "entity-1",
    campaignId: "campaign-1",
    type: "person",
    name: "Rowan",
    summary: null,
    metadata: {},
    sourceAssetId: null,
    provenanceExcerpt: null,
    provenanceData: {},
    createdAt: "2026-04-08T12:00:00Z",
    updatedAt: "2026-04-08T12:00:00Z",
  },
  {
    id: "entity-2",
    campaignId: "campaign-1",
    type: "location",
    name: "Blackharbor",
    summary: null,
    metadata: {},
    sourceAssetId: null,
    provenanceExcerpt: null,
    provenanceData: {},
    createdAt: "2026-04-08T12:00:00Z",
    updatedAt: "2026-04-08T12:00:00Z",
  },
  {
    id: "entity-3",
    campaignId: "campaign-1",
    type: "organization",
    name: "Harbor Watch",
    summary: null,
    metadata: {},
    sourceAssetId: null,
    provenanceExcerpt: null,
    provenanceData: {},
    createdAt: "2026-04-08T12:00:00Z",
    updatedAt: "2026-04-08T12:00:00Z",
  },
];

const campaignOneRelationships: Relationship[] = [
  {
    id: "relationship-1",
    campaignId: "campaign-1",
    sourceEntityId: "entity-1",
    targetEntityId: "entity-2",
    relationshipType: "governs",
    relationshipFamily: "political",
    relationshipFamilyLabel: "Political",
    forwardLabel: "governs",
    reverseLabel: "governed by",
    isSymmetric: false,
    lifecycleStatus: "current",
    visibilityStatus: "public",
    certaintyStatus: "confirmed",
    notes: null,
    confidence: null,
    sourceAssetId: null,
    provenanceExcerpt: null,
    provenanceData: {},
    createdAt: "2026-04-08T12:00:00Z",
    updatedAt: "2026-04-08T12:00:00Z",
  },
  {
    id: "relationship-2",
    campaignId: "campaign-1",
    sourceEntityId: "entity-2",
    targetEntityId: "entity-3",
    relationshipType: "governs",
    relationshipFamily: "political",
    relationshipFamilyLabel: "Political",
    forwardLabel: "governs",
    reverseLabel: "governed by",
    isSymmetric: false,
    lifecycleStatus: "current",
    visibilityStatus: "public",
    certaintyStatus: "confirmed",
    notes: null,
    confidence: null,
    sourceAssetId: null,
    provenanceExcerpt: null,
    provenanceData: {},
    createdAt: "2026-04-08T12:00:00Z",
    updatedAt: "2026-04-08T12:00:00Z",
  },
];

const relationshipTypes: RelationshipType[] = [
  {
    id: null,
    campaignId: "campaign-1",
    key: "governs",
    label: "governs",
    family: "political",
    familyLabel: "Political",
    reverseLabel: "governed by",
    isSymmetric: false,
    allowedSourceTypes: ["person"],
    allowedTargetTypes: ["location"],
    isCustom: false,
    createdAt: null,
    updatedAt: null,
  },
];

function RelationshipTestLayout({ campaign }: { campaign: Campaign }) {
  return <Outlet context={{ campaign }} />;
}

function LocationSearch() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

function NavigationControls() {
  const navigate = useNavigate();

  return (
    <>
      <button type="button" onClick={() => void navigate(-1)}>
        Back
      </button>
      <button type="button" onClick={() => void navigate(-2)}>
        Back two steps
      </button>
      <button type="button" onClick={() => void navigate(1)}>
        Forward
      </button>
    </>
  );
}

function RelationshipFilterTestApp({
  campaign,
  initialEntries,
  initialIndex,
}: {
  campaign: Campaign;
  initialEntries: string[];
  initialIndex?: number;
}) {
  return (
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
      <LocationSearch />
      <NavigationControls />
      <Routes>
        <Route element={<RelationshipTestLayout campaign={campaign} />}>
          <Route path="/campaigns/:campaignId/relationships" element={<CampaignRelationshipsTab />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("campaign relationship entity filters", () => {
  beforeEach(() => {
    apiMocks.listCampaignEntities.mockResolvedValue(campaignOneEntities);
    apiMocks.listRelationships.mockResolvedValue(campaignOneRelationships);
    apiMocks.listRelationshipTypes.mockResolvedValue(relationshipTypes);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("clears a selected entity once while preserving other URL filters during further edits", async () => {
    render(
      <RelationshipFilterTestApp
        campaign={campaignOne}
        initialEntries={["/campaigns/campaign-1/relationships?entity_id=entity-1&relationship_type=governs&scope=campaign"]}
      />,
    );

    const entityPicker = await screen.findByRole("combobox", { name: "Filter by entity" });
    expect(entityPicker).toHaveValue("Rowan");

    fireEvent.change(entityPicker, { target: { value: "" } });

    await waitFor(() => {
      expect(screen.getByTestId("location-search")).toHaveTextContent("?relationship_type=governs&scope=campaign");
    });

    fireEvent.change(entityPicker, { target: { value: "R" } });
    expect(screen.getByTestId("location-search")).toHaveTextContent("?relationship_type=governs&scope=campaign");
  });

  it("selects a new entity after editing and displays the URL-selected name", async () => {
    render(
      <RelationshipFilterTestApp
        campaign={campaignOne}
        initialEntries={["/campaigns/campaign-1/relationships?entity_id=entity-1&relationship_type=governs"]}
      />,
    );

    const entityPicker = await screen.findByRole("combobox", { name: "Filter by entity" });
    fireEvent.change(entityPicker, { target: { value: "Black" } });
    fireEvent.click(await screen.findByRole("option", { name: "Blackharbor" }));

    await waitFor(() => {
      const selectedFilters = new URLSearchParams(screen.getByTestId("location-search").textContent);
      expect(selectedFilters.get("entity_id")).toBe("entity-2");
      expect(selectedFilters.get("relationship_type")).toBe("governs");
    });
    expect(entityPicker).toHaveValue("Blackharbor");
  });

  it("restores the URL-selected entity name and relationship filtering on Back navigation", async () => {
    render(
      <RelationshipFilterTestApp
        campaign={campaignOne}
        initialEntries={[
          "/campaigns/campaign-1/relationships?entity_id=entity-1&relationship_type=governs",
          "/campaigns/campaign-1/relationships?entity_id=entity-2&relationship_type=governs",
        ]}
        initialIndex={1}
      />,
    );

    const entityPicker = await screen.findByRole("combobox", { name: "Filter by entity" });
    expect(entityPicker).toHaveValue("Blackharbor");
    expect(screen.getByText("Blackharbor governs Harbor Watch")).toBeInTheDocument();

    fireEvent.change(entityPicker, { target: { value: "Blackh" } });
    fireEvent.click(screen.getByRole("button", { name: "Back two steps" }));

    await waitFor(() => {
      expect(entityPicker).toHaveValue("Rowan");
    });
    expect(screen.getByText("Rowan governs Blackharbor")).toBeInTheDocument();
    expect(screen.queryByText("Blackharbor governs Harbor Watch")).toBeNull();
  });

  it("clears an in-progress entity query when the campaign changes", async () => {
    const { rerender } = render(
      <RelationshipFilterTestApp campaign={campaignOne} initialEntries={["/campaigns/campaign-1/relationships"]} />,
    );

    const entityPicker = await screen.findByRole("combobox", { name: "Filter by entity" });
    fireEvent.change(entityPicker, { target: { value: "Row" } });
    expect(entityPicker).toHaveValue("Row");

    rerender(
      <RelationshipFilterTestApp
        campaign={{ ...campaignOne, id: "campaign-2", name: "Amber Coast" }}
        initialEntries={["/campaigns/campaign-1/relationships"]}
      />,
    );

    await waitFor(() => {
      expect(entityPicker).toHaveValue("");
    });
  });

  it("replaces an invalid entity filter without restoring it through Back navigation", async () => {
    render(
      <RelationshipFilterTestApp
        campaign={campaignOne}
        initialEntries={[
          "/campaigns/campaign-1/relationships?entity_id=entity-1&relationship_type=governs&scope=campaign",
          "/campaigns/campaign-1/relationships?entity_id=deleted&relationship_type=governs&scope=campaign",
        ]}
        initialIndex={1}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("location-search")).toHaveTextContent("?relationship_type=governs&scope=campaign");
    });

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => {
      expect(screen.getByTestId("location-search")).toHaveTextContent(
        "?entity_id=entity-1&relationship_type=governs&scope=campaign",
      );
    });
  });
});
