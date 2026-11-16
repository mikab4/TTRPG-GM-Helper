from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Campaign, Owner
from app.schemas import CampaignCreate, CampaignUpdate
from app.services.campaign_lookup import get_campaign_or_raise
from app.services.errors import ConflictError, NotFoundError


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
        raise ConflictError("Campaign name already exists for this owner.")

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
        raise ConflictError("Campaign name already exists for this owner.") from exc
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
            raise ConflictError("Campaign name already exists for this owner.")

    for field_name, field_value in campaign_update_fields.items():
        setattr(stored_campaign, field_name, field_value)

    try:
        db_session.commit()
    except IntegrityError as exc:
        db_session.rollback()
        raise ConflictError("Campaign name already exists for this owner.") from exc
    db_session.refresh(stored_campaign)
    return stored_campaign


def delete_campaign(db_session: Session, campaign_id: UUID) -> None:
    stored_campaign = get_campaign(db_session, campaign_id)
    db_session.delete(stored_campaign)
    db_session.commit()
