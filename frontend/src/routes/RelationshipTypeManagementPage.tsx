import { Link, useOutletContext, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

import { ApiError } from "../api/client";
import { deleteRelationshipType, listRelationshipTypes, updateRelationshipType } from "../api/relationshipTypes";
import { PageHeader } from "../components/PageHeader";
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";
import { RelationshipTypeInventory } from "../components/RelationshipTypeInventory";
import { RequestStateBlock } from "../components/RequestStateBlock";
import { SectionPanel } from "../components/SectionPanel";
import type { RelationshipType, RelationshipTypeUpdate } from "../types/relationshipTypes";
import type { CampaignWorkspaceContext } from "./CampaignWorkspacePage";

type RelationshipTypeManagementState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      relationshipTypes: RelationshipType[];
      status: "ready";
    };

function getRelationshipTypeErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 422) {
    if (error.message.toLowerCase().includes("already exists")) {
      return "A relationship type with that label already exists in this campaign.";
    }

    return `This relationship type could not be saved. ${error.message}`;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Something went wrong while saving the relationship type.";
}

function getRelationshipTypeDeleteErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 422) {
    return `This relationship type could not be deleted. ${error.message}`;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Something went wrong while deleting the relationship type.";
}

export function RelationshipTypeManagementPage() {
  const workspaceContext = useOutletContext<CampaignWorkspaceContext | null>();
  const { campaignId = "" } = useParams();
  const campaign = workspaceContext?.campaign ?? { id: campaignId, name: "" };
  const [pageState, setPageState] = useState<RelationshipTypeManagementState>({ status: "loading" });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<RelationshipType | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const deletionInFlightRef = useRef(false);

  useEffect(() => {
    let isCurrentRequest = true;

    async function loadPageState() {
      try {
        const relationshipTypes = await listRelationshipTypes(campaign.id);
        if (!isCurrentRequest) {
          return;
        }
        setPageState({ relationshipTypes, status: "ready" });
      } catch (error) {
        if (!isCurrentRequest) {
          return;
        }

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
  }, [campaign.id]);

  async function reloadRelationshipTypes() {
    if (pageState.status !== "ready") {
      return;
    }

    const relationshipTypes = await listRelationshipTypes(campaign.id);
    setPageState({
      relationshipTypes,
      status: "ready",
    });
  }

  async function handleUpdate(
    relationshipTypeKey: string,
    relationshipTypeUpdate: RelationshipTypeUpdate,
  ): Promise<boolean> {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await updateRelationshipType(campaign.id, relationshipTypeKey, relationshipTypeUpdate);
      await reloadRelationshipTypes();
      return true;
    } catch (error) {
      setSubmitError(getRelationshipTypeErrorMessage(error));
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  function requestDeletion(relationshipType: RelationshipType) {
    if (deletionInFlightRef.current) {
      return;
    }

    setDeleteError(null);
    setPendingDeletion(relationshipType);
  }

  function cancelDeletion() {
    if (isDeleting) {
      return;
    }

    setDeleteError(null);
    setPendingDeletion(null);
  }

  async function confirmDeletion() {
    const relationshipType = pendingDeletion;
    if (!relationshipType || deletionInFlightRef.current) {
      return;
    }

    deletionInFlightRef.current = true;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteRelationshipType(campaign.id, relationshipType.key);
      setPageState((currentPageState) =>
        currentPageState.status === "ready"
          ? {
              ...currentPageState,
              relationshipTypes: currentPageState.relationshipTypes.filter(
                (listedRelationshipType) => listedRelationshipType.key !== relationshipType.key,
              ),
            }
          : currentPageState,
      );
      setDeleteError(null);
      setPendingDeletion(null);
    } catch (error) {
      setDeleteError(getRelationshipTypeDeleteErrorMessage(error));
    } finally {
      deletionInFlightRef.current = false;
      setIsDeleting(false);
    }
  }

  if (pageState.status === "loading") {
    return <RequestStateBlock message="Loading relationship type management." title="Loading relationship types" />;
  }

  if (pageState.status === "error") {
    return <RequestStateBlock message={pageState.message} title="Relationship types unavailable" tone="error" />;
  }

  return (
    <div className="page-stack workspace-surface">
      <PageHeader
        actions={
          <div className="action-row">
            <Link className="secondary-button" to={`/campaigns/${campaign.id}/relationships`}>
              Back To Relationships
            </Link>
            <Link className="primary-button" to={`/campaigns/${campaign.id}/relationship-types/new`}>
              Create custom type
            </Link>
          </div>
        }
        description={`Campaign: ${campaign.name}`}
        eyebrow="Relationship Types"
        title="Relationship Type Management"
      />
      <SectionPanel
        description="Review built-in types and maintain campaign-specific custom labels here."
        title="Available Relationship Types"
      >
        <RelationshipTypeInventory
          createPath={`/campaigns/${campaign.id}/relationship-types/new`}
          relationshipTypes={pageState.relationshipTypes}
          submitError={submitError}
          submitting={submitting}
          onRequestDelete={requestDeletion}
          onUpdate={handleUpdate}
        />
      </SectionPanel>
      {pendingDeletion ? (
        <DeleteConfirmationDialog
          error={deleteError}
          isDeleting={isDeleting}
          recordName={pendingDeletion.label}
          warningText="This custom relationship type will be permanently deleted. Types currently used by relationships cannot be deleted."
          onCancel={cancelDeletion}
          onConfirm={() => void confirmDeletion()}
        />
      ) : null}
    </div>
  );
}
