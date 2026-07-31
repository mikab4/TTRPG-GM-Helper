import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

import { ApiError } from "../api/client";
import { listRelationshipFamilies } from "../api/relationshipFamilies";
import { createRelationshipType } from "../api/relationshipTypes";
import { PageHeader } from "../components/PageHeader";
import { RelationshipTypeCreateForm } from "../components/RelationshipTypeCreateForm";
import { RequestStateBlock } from "../components/RequestStateBlock";
import { SectionPanel } from "../components/SectionPanel";
import type { RelationshipFamilyOption } from "../types/relationshipFamilies";
import type { RelationshipTypeCreate } from "../types/relationshipTypes";
import type { CampaignWorkspaceContext } from "./CampaignWorkspacePage";

type RelationshipTypeCreateState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { relationshipFamilies: RelationshipFamilyOption[]; status: "ready" };

function getRelationshipTypeErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 422 && error.message.toLowerCase().includes("already exists")) {
    return "A relationship type with that label already exists in this campaign.";
  }

  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Something went wrong while saving the relationship type.";
}

export function RelationshipTypeCreatePage() {
  const workspaceContext = useOutletContext<CampaignWorkspaceContext | null>();
  const { campaignId = "" } = useParams();
  const campaign = workspaceContext?.campaign ?? { id: campaignId, name: "" };
  const navigate = useNavigate();
  const [pageState, setPageState] = useState<RelationshipTypeCreateState>({ status: "loading" });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const createInFlightRef = useRef(false);

  useEffect(() => {
    let isCurrentRequest = true;

    async function loadPageState() {
      try {
        const relationshipFamilies = await listRelationshipFamilies();
        if (!isCurrentRequest) {
          return;
        }
        setPageState({ relationshipFamilies, status: "ready" });
      } catch (error) {
        if (!isCurrentRequest) return;
        setPageState({
          message: error instanceof Error ? error.message : "Unknown relationship type load failure.",
          status: "error",
        });
      }
    }

    void loadPageState();
    return () => {
      isCurrentRequest = false;
    };
  }, []);

  async function handleCreate(relationshipTypeCreate: RelationshipTypeCreate): Promise<boolean> {
    if (createInFlightRef.current) return false;
    createInFlightRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createRelationshipType(campaign.id, relationshipTypeCreate);
      return true;
    } catch (error) {
      setSubmitError(getRelationshipTypeErrorMessage(error));
      return false;
    } finally {
      createInFlightRef.current = false;
      setSubmitting(false);
    }
  }

  if (pageState.status === "loading") {
    return <RequestStateBlock message="Loading relationship type creation." title="Loading relationship types" />;
  }
  if (pageState.status === "error") {
    return <RequestStateBlock message={pageState.message} title="Relationship types unavailable" tone="error" />;
  }

  const inventoryPath = `/campaigns/${campaign.id}/relationship-types`;
  return (
    <div className="page-stack workspace-surface">
      <PageHeader
        actions={
          <Link className="secondary-button" to={inventoryPath}>
            Back To Relationship Types
          </Link>
        }
        description={`Campaign: ${campaign.name}`}
        eyebrow="Relationship Types"
        title="Create Custom Relationship Type"
      />
      <SectionPanel
        description="Define a campaign-specific relationship type for the relationship form."
        title="Custom Relationship Type"
      >
        <RelationshipTypeCreateForm
          relationshipFamilies={pageState.relationshipFamilies}
          submitError={submitError}
          submitting={submitting}
          onCreate={handleCreate}
          onCreated={() => {
            void navigate(inventoryPath, { replace: true });
          }}
        />
      </SectionPanel>
    </div>
  );
}
