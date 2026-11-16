from __future__ import annotations

from uuid import UUID

from sqlalchemy import exists, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.enums import SourceAssetLifecycleStatus
from app.models import Campaign, Owner, SourceAsset
from app.schemas import CampaignCreate, CampaignUpdate
from app.services import asset_service
from app.services.asset_storage import AssetStorage
from app.services.campaign_lookup import get_campaign_or_raise
from app.services.errors import ConflictError, NotFoundError

CAMPAIGN_NAME_CONFLICT_MESSAGE = "Campaign name already exists for this owner."
_CAMPAIGN_OWNER_NAME_UNIQUE_CONSTRAINT = "uq_campaign_owner_name"
CAMPAIGN_ASSETS_ADDED_DURING_DELETE_MESSAGE = (
    "Assets were added while the campaign was being deleted. Delete the campaign again to finish."
)


def create_campaign(db_session: Session, campaign_create: CampaignCreate) -> Campaign:
    if db_session.get(Owner, campaign_create.owner_id) is None:
        raise NotFoundError("Owner not found.")

    conflicting_campaign = db_session.scalar(
        select(Campaign).where(
            Campaign.owner_id == campaign_create.owner_id,
            Campaign.name == campaign_create.name,
        )
    )
    if conflicting_campaign is not None:
        raise ConflictError(CAMPAIGN_NAME_CONFLICT_MESSAGE)

    created_campaign = Campaign(
        owner_id=campaign_create.owner_id,
        name=campaign_create.name,
        description=campaign_create.description,
    )
    db_session.add(created_campaign)
    try:
        db_session.commit()
    except IntegrityError as exc:
        db_session.rollback()
        if _violates_campaign_owner_name_uniqueness(exc):
            raise ConflictError(CAMPAIGN_NAME_CONFLICT_MESSAGE) from exc
        raise
    db_session.refresh(created_campaign)
    return created_campaign


def list_campaigns(db_session: Session, *, owner_id: UUID | None = None) -> list[Campaign]:
    statement = select(Campaign)
    if owner_id is not None:
        statement = statement.where(Campaign.owner_id == owner_id)

    statement = statement.order_by(Campaign.updated_at.desc(), Campaign.id)
    return list(db_session.scalars(statement))


def get_campaign(db_session: Session, campaign_id: UUID) -> Campaign:
    return get_campaign_or_raise(db_session, campaign_id)


def update_campaign(
    db_session: Session,
    campaign_id: UUID,
    campaign_update: CampaignUpdate,
) -> Campaign:
    stored_campaign = get_campaign(db_session, campaign_id)

    campaign_update_fields = campaign_update.model_dump(exclude_unset=True)
    new_name = campaign_update_fields.get("name")
    if new_name is not None:
        conflicting_campaign = db_session.scalar(
            select(Campaign).where(
                Campaign.owner_id == stored_campaign.owner_id,
                Campaign.name == new_name,
                Campaign.id != stored_campaign.id,
            )
        )
        if conflicting_campaign is not None:
            raise ConflictError(CAMPAIGN_NAME_CONFLICT_MESSAGE)

    for field_name, field_value in campaign_update_fields.items():
        setattr(stored_campaign, field_name, field_value)

    try:
        db_session.commit()
    except IntegrityError as exc:
        db_session.rollback()
        if _violates_campaign_owner_name_uniqueness(exc):
            raise ConflictError(CAMPAIGN_NAME_CONFLICT_MESSAGE) from exc
        raise
    db_session.refresh(stored_campaign)
    return stored_campaign


def delete_campaign(
    db_session: Session,
    campaign_id: UUID,
    *,
    asset_storage: AssetStorage,
) -> None:
    get_campaign(db_session, campaign_id)
    asset_service.remove_campaign_asset_files(
        db_session,
        campaign_id=campaign_id,
        asset_storage=asset_storage,
    )

    # The row lock blocks asset inserts until this transaction ends.
    stored_campaign = db_session.scalar(select(Campaign).where(Campaign.id == campaign_id).with_for_update())
    if stored_campaign is None:
        db_session.rollback()
        raise NotFoundError("Campaign not found.")
    asset_added_during_delete = db_session.scalar(
        select(
            exists().where(
                SourceAsset.campaign_id == campaign_id,
                SourceAsset.lifecycle_status == SourceAssetLifecycleStatus.ACTIVE.value,
            )
        )
    )
    if asset_added_during_delete:
        db_session.rollback()
        raise ConflictError(CAMPAIGN_ASSETS_ADDED_DURING_DELETE_MESSAGE)

    db_session.delete(stored_campaign)
    db_session.commit()


def _violates_campaign_owner_name_uniqueness(integrity_error: IntegrityError) -> bool:
    driver_diagnostics = getattr(integrity_error.orig, "diag", None)
    violated_constraint_name = getattr(driver_diagnostics, "constraint_name", None)
    return violated_constraint_name == _CAMPAIGN_OWNER_NAME_UNIQUE_CONSTRAINT
