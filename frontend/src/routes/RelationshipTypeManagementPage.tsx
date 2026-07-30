import { Link, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

import { getCampaign } from "../api/campaigns";
import { ApiError } from "../api/client";
import { listRelationshipFamilies } from "../api/relationshipFamilies";
import {
  createRelationshipType,
  deleteRelationshipType,
  listRelationshipTypes,
  updateRelationshipType,
} from "../api/relationshipTypes";
import { PageHeader } from "../components/PageHeader";
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";
import { RelationshipTypeManager } from "../components/RelationshipTypeManager";
import { RequestStateBlock } from "../components/RequestStateBlock";
import { SectionPanel } from "../components/SectionPanel";
import type { Campaign } from "../types/campaigns";
import type { RelationshipFamilyOption } from "../types/relationshipFamilies";
import type { RelationshipType, RelationshipTypeCreate, RelationshipTypeUpdate } from "../types/relationshipTypes";

type RelationshipTypeManagementState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      campaign: Campaign;
      relationshipFamilies: RelationshipFamilyOption[];
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
  const { campaignId } = useParams();
  const [pageState, setPageState] = useState<RelationshipTypeManagementState>({ status: "loading" });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<RelationshipType | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const deletionInFlightRef = useRef(false);

  useEffect(() => {
    const abortController = new AbortController();

    async function loadPageState() {
      if (!campaignId) {
        setPageState({ message: "Relationship type route is missing a campaign identifier.", status: "error" });
        return;
      }

      try {
        const [campaign, relationshipFamilies, relationshipTypes] = await Promise.all([
          getCampaign(campaignId, { signal: abortController.signal }),
          listRelationshipFamilies(),
          listRelationshipTypes(campaignId),
        ]);

        setPageState({ campaign, relationshipFamilies, relationshipTypes, status: "ready" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
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
      abortController.abort();
    };
  }, [campaignId]);

  async function reloadRelationshipTypes() {
    if (!campaignId || pageState.status !== "ready") {
      return;
    }

    const relationshipTypes = await listRelationshipTypes(campaignId);
    setPageState({
      campaign: pageState.campaign,
      relationshipFamilies: pageState.relationshipFamilies,
      relationshipTypes,
      status: "ready",
    });
  }

  async function handleCreate(relationshipTypeCreate: RelationshipTypeCreate): Promise<boolean> {
    if (!campaignId) {
      return false;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      await createRelationshipType(campaignId, relationshipTypeCreate);
      await reloadRelationshipTypes();
      return true;
    } catch (error) {
      setSubmitError(getRelationshipTypeErrorMessage(error));
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(
    relationshipTypeKey: string,
    relationshipTypeUpdate: RelationshipTypeUpdate,
  ): Promise<boolean> {
    if (!campaignId) {
      return false;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      await updateRelationshipType(campaignId, relationshipTypeKey, relationshipTypeUpdate);
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
    if (!campaignId || !relationshipType || deletionInFlightRef.current) {
      return;
    }

    deletionInFlightRef.current = true;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteRelationshipType(campaignId, relationshipType.key);
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
            <Link className="secondary-button" to={`/campaigns/${pageState.campaign.id}/relationships`}>
              Back To Relationships
            </Link>
          </div>
        }
        description={`Campaign: ${pageState.campaign.name}`}
        eyebrow="Relationship Types"
        title="Relationship Type Management"
      />
      <SectionPanel
        description="Create and maintain campaign-specific relationship types here, separate from the main relationship list."
        title="Custom Relationship Types"
      >
        <RelationshipTypeManager
          relationshipFamilies={pageState.relationshipFamilies}
          relationshipTypes={pageState.relationshipTypes}
          submitError={submitError}
          submitting={submitting}
          onCreate={handleCreate}
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
