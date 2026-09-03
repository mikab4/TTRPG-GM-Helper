from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_db_session
from app.schemas import CampaignCreate, CampaignResponse, CampaignUpdate
from app.services import ConflictError, NotFoundError, campaign_service

router = APIRouter(prefix="/campaigns")

DbSession = Annotated[Session, Depends(get_db_session)]


@router.post("", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
def create_campaign(campaign_create: CampaignCreate, db_session: DbSession) -> CampaignResponse:
    try:
        created_campaign = campaign_service.create_campaign(db_session, campaign_create)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return CampaignResponse.model_validate(created_campaign)


@router.get("", response_model=list[CampaignResponse])
def list_campaigns(db_session: DbSession, owner_id: UUID | None = None) -> list[CampaignResponse]:
    listed_campaigns = campaign_service.list_campaigns(db_session, owner_id=owner_id)
    return [CampaignResponse.model_validate(listed_campaign) for listed_campaign in listed_campaigns]


@router.get("/{campaign_id}", response_model=CampaignResponse)
def get_campaign(campaign_id: UUID, db_session: DbSession) -> CampaignResponse:
    try:
        stored_campaign = campaign_service.get_campaign(db_session, campaign_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return CampaignResponse.model_validate(stored_campaign)


@router.patch("/{campaign_id}", response_model=CampaignResponse)
def update_campaign(
    campaign_id: UUID,
    campaign_update: CampaignUpdate,
    db_session: DbSession,
) -> CampaignResponse:
    try:
        updated_campaign = campaign_service.update_campaign(
            db_session,
            campaign_id,
            campaign_update,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return CampaignResponse.model_validate(updated_campaign)


@router.delete("/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campaign(campaign_id: UUID, db_session: DbSession) -> Response:
    try:
        campaign_service.delete_campaign(db_session, campaign_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)
