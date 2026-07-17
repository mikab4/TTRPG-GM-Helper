from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.dependencies import get_asset_storage, get_db_session
from app.config import Settings, get_settings
from app.schemas import AssetCreateFormData, AssetResponse, AssetUpdate
from app.services import AssetUploadTooLargeError, ConflictError, NotFoundError, UnsupportedMediaTypeError, asset_service
from app.services.asset_storage import AssetStorage

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db_session)]
AppSettings = Annotated[Settings, Depends(get_settings)]
ConfiguredAssetStorage = Annotated[AssetStorage, Depends(get_asset_storage)]


def parse_asset_create_form_data(
    title: str | None = Form(default=None),
    truth_status: str = Form(default="uncertain"),
    session_id: UUID | None = Form(default=None),
) -> AssetCreateFormData:
    try:
        return AssetCreateFormData(
            title=title,
            truth_status=truth_status,
            session_id=session_id,
        )
    except ValidationError as exc:
        raise RequestValidationError(
            [
                {
                    **validation_error,
                    "loc": ("body", *validation_error["loc"]),
                }
                for validation_error in exc.errors(include_url=False)
            ]
        ) from exc


@router.post(
    "/campaigns/{campaign_id}/assets",
    response_model=AssetResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_asset(
    campaign_id: UUID,
    asset_create: Annotated[AssetCreateFormData, Depends(parse_asset_create_form_data)],
    file: UploadFile = File(...),
    asset_storage: ConfiguredAssetStorage = None,
    settings: AppSettings = None,
    db_session: DbSession = None,
) -> AssetResponse:
    try:
        created_asset = asset_service.create_asset(
            db_session,
            campaign_id=campaign_id,
            asset_create=asset_create,
            upload_file=file,
            asset_storage=asset_storage,
            max_upload_bytes=settings.asset_upload_max_bytes,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except AssetUploadTooLargeError as exc:
        raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail=str(exc)) from exc
    except UnsupportedMediaTypeError as exc:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=str(exc)) from exc

    return AssetResponse.model_validate(created_asset)


@router.get("/campaigns/{campaign_id}/assets", response_model=list[AssetResponse])
def list_assets(campaign_id: UUID, db_session: DbSession) -> list[AssetResponse]:
    try:
        listed_assets = asset_service.list_assets(
            db_session,
            campaign_id=campaign_id,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return [AssetResponse.model_validate(listed_asset) for listed_asset in listed_assets]


@router.get("/campaigns/{campaign_id}/assets/{asset_id}", response_model=AssetResponse)
def get_asset(campaign_id: UUID, asset_id: UUID, db_session: DbSession) -> AssetResponse:
    try:
        stored_asset = asset_service.get_asset(
            db_session,
            campaign_id=campaign_id,
            asset_id=asset_id,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return AssetResponse.model_validate(stored_asset)


@router.patch("/campaigns/{campaign_id}/assets/{asset_id}", response_model=AssetResponse)
def update_asset(
    campaign_id: UUID,
    asset_id: UUID,
    asset_update: AssetUpdate,
    db_session: DbSession,
) -> AssetResponse:
    try:
        updated_asset = asset_service.update_asset(
            db_session,
            campaign_id=campaign_id,
            asset_id=asset_id,
            asset_update=asset_update,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return AssetResponse.model_validate(updated_asset)


@router.delete(
    "/campaigns/{campaign_id}/assets/{asset_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_asset(
    campaign_id: UUID,
    asset_id: UUID,
    asset_storage: ConfiguredAssetStorage,
    db_session: DbSession,
) -> Response:
    try:
        asset_service.delete_asset(
            db_session,
            campaign_id=campaign_id,
            asset_id=asset_id,
            asset_storage=asset_storage,
        )
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)
