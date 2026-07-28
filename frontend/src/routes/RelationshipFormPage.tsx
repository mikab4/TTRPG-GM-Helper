import { Link, useNavigate, useParams } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";

import { getCampaign } from "../api/campaigns";
import { listCampaignEntities } from "../api/entities";
import { listRelationshipFamilies } from "../api/relationshipFamilies";
import { getRelationship, createRelationship, updateRelationship, deleteRelationship } from "../api/relationships";
import { listRelationshipTypes } from "../api/relationshipTypes";
import { RelationshipForm, type RelationshipFormValues } from "../components/RelationshipForm";
import type { UnsavedChangesRegistration } from "../app/UnsavedChangesContext";
import { PageHeader } from "../components/PageHeader";
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";
import { RequestStateBlock } from "../components/RequestStateBlock";
import { SectionPanel } from "../components/SectionPanel";
import type { Campaign } from "../types/campaigns";
import type { Entity } from "../types/entities";
import type { RelationshipFamilyOption } from "../types/relationshipFamilies";
import type { Relationship } from "../types/relationships";
import type { RelationshipType } from "../types/relationshipTypes";

type RelationshipFormPageProps = {
  mode: "create" | "edit";
};

type RelationshipFormPageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      campaign: Campaign;
      entities: Entity[];
      relationshipFamilies: RelationshipFamilyOption[];
      relationship: Relationship | null;
      relationshipTypes: RelationshipType[];
      status: "ready";
    };

export function RelationshipFormPage({ mode }: RelationshipFormPageProps) {
  const navigate = useNavigate();
  const { campaignId, relationshipId } = useParams();
  const [pageState, setPageState] = useState<RelationshipFormPageState>({ status: "loading" });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const formRegistrationRef = useRef<UnsavedChangesRegistration | null>(null);
  const deletionInFlightRef = useRef(false);

  useEffect(() => {
    const abortController = new AbortController();

    async function loadFormData() {
      if (!campaignId) {
        setPageState({ message: "Relationship route is missing a campaign identifier.", status: "error" });
        return;
      }

      try {
        const [campaign, entities, relationshipFamilies, relationshipTypes, relationship] = await Promise.all([
          getCampaign(campaignId, { signal: abortController.signal }),
          listCampaignEntities(campaignId, undefined, abortController.signal),
          listRelationshipFamilies(),
          listRelationshipTypes(campaignId),
          mode === "edit" && relationshipId
            ? getRelationship(campaignId, relationshipId, abortController.signal)
            : Promise.resolve(null),
        ]);

        setPageState({
          campaign,
          entities,
          relationshipFamilies,
          relationship,
          relationshipTypes,
          status: "ready",
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setPageState({
          message: error instanceof Error ? error.message : "Unknown relationship load failure.",
          status: "error",
        });
      }
    }

    void loadFormData();

    return () => {
      abortController.abort();
    };
  }, [campaignId, mode, relationshipId]);

  const handleRegistrationChange = useCallback((registration: UnsavedChangesRegistration | null) => {
    formRegistrationRef.current = registration;
  }, []);

  async function handleSubmit(values: RelationshipFormValues, registration: UnsavedChangesRegistration) {
    if (pageState.status !== "ready" || !campaignId) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const savedRelationship =
        mode === "edit" && relationshipId
          ? await updateRelationship(campaignId, relationshipId, {
              certaintyStatus: values.certaintyStatus,
              lifecycleStatus: values.lifecycleStatus,
              notes: values.notes.trim() || null,
              relationshipType: values.relationshipType,
              visibilityStatus: values.visibilityStatus,
            })
          : await createRelationship(campaignId, {
              certaintyStatus: values.certaintyStatus,
              lifecycleStatus: values.lifecycleStatus,
              notes: values.notes.trim() || null,
              relationshipType: values.relationshipType,
              sourceEntityId: values.sourceEntityId,
              targetEntityId: values.targetEntityId,
              visibilityStatus: values.visibilityStatus,
            });

      registration.markCleanAndNavigate(() => {
        void navigate(`/campaigns/${savedRelationship.campaignId}/relationships`);
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unknown relationship save failure.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDeletion() {
    if (pageState.status !== "ready" || !campaignId || !relationshipId || deletionInFlightRef.current) {
      return;
    }

    deletionInFlightRef.current = true;
    setDeleting(true);
    setDeleteError(null);

    try {
      await deleteRelationship(campaignId, relationshipId);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unknown relationship delete failure.");
      return;
    } finally {
      deletionInFlightRef.current = false;
      setDeleting(false);
    }

    setDeletePending(false);
    setDeleteError(null);
    const navigateToRelationships = () => {
      void navigate(`/campaigns/${campaignId}/relationships`);
    };
    if (formRegistrationRef.current !== null) {
      formRegistrationRef.current.markCleanAndNavigate(navigateToRelationships);
    } else {
      navigateToRelationships();
    }
  }

  if (pageState.status === "loading") {
    return <RequestStateBlock message="Loading relationship form context." title="Loading relationship" />;
  }

  if (pageState.status === "error") {
    return <RequestStateBlock message={pageState.message} title="Relationship unavailable" tone="error" />;
  }

  const initialRelationship = pageState.relationship;

  return (
    <div className="page-stack workspace-surface">
      <PageHeader
        actions={
          <div className="action-row">
            <Link className="secondary-button" to={`/campaigns/${pageState.campaign.id}/relationships`}>
              Back To Relationships
            </Link>
            {mode === "edit" ? (
              <button
                className="danger-button"
                disabled={deleting}
                type="button"
                onClick={() => {
                  setDeleteError(null);
                  setDeletePending(true);
                }}
              >
                Delete Relationship
              </button>
            ) : null}
          </div>
        }
        description={`Campaign: ${pageState.campaign.name}`}
        eyebrow="Relationship Editor"
        title={mode === "edit" ? "Edit Relationship" : "New Relationship"}
      />
      <SectionPanel title="Relationship Details">
        <RelationshipForm
          campaignId={pageState.campaign.id}
          entities={pageState.entities}
          initialValues={{
            certaintyStatus: initialRelationship?.certaintyStatus ?? "confirmed",
            lifecycleStatus: initialRelationship?.lifecycleStatus ?? "current",
            notes: initialRelationship?.notes ?? "",
            relationshipType: initialRelationship?.relationshipType ?? "",
            sourceEntityId: initialRelationship?.sourceEntityId ?? "",
            targetEntityId: initialRelationship?.targetEntityId ?? "",
            visibilityStatus: initialRelationship?.visibilityStatus ?? "public",
          }}
          relationshipFamilies={pageState.relationshipFamilies}
          relationshipTypes={pageState.relationshipTypes}
          submitError={submitError}
          submitLabel={mode === "edit" ? "Save Relationship" : "Create Relationship"}
          submitting={submitting}
          onRegistrationChange={handleRegistrationChange}
          onSubmit={handleSubmit}
        />
      </SectionPanel>
      {deletePending && initialRelationship ? (
        <DeleteConfirmationDialog
          error={deleteError}
          isDeleting={deleting}
          recordName={`${initialRelationship.sourceEntityId} ${initialRelationship.relationshipType} ${initialRelationship.targetEntityId}`}
          warningText="This relationship will be permanently deleted. This action cannot be undone."
          onCancel={() => {
            setDeleteError(null);
            setDeletePending(false);
          }}
          onConfirm={() => void confirmDeletion()}
        />
      ) : null}
    </div>
  );
}
