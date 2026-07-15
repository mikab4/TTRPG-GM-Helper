from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_db_session
from app.schemas import SessionCreate, SessionResponse, SessionUpdate
from app.services import NotFoundError, session_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db_session)]


@router.post(
    "/campaigns/{campaign_id}/sessions",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_session(
    campaign_id: UUID,
    session_create: SessionCreate,
    db_session: DbSession,
) -> SessionResponse:
    try:
        created_session = session_service.create_session(
            db_session,
            campaign_id=campaign_id,
            session_create=session_create,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return SessionResponse.model_validate(created_session)


@router.get("/campaigns/{campaign_id}/sessions", response_model=list[SessionResponse])
def list_sessions(campaign_id: UUID, db_session: DbSession) -> list[SessionResponse]:
    try:
        listed_sessions = session_service.list_sessions(
            db_session,
            campaign_id=campaign_id,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return [SessionResponse.model_validate(listed_session) for listed_session in listed_sessions]


@router.get("/campaigns/{campaign_id}/sessions/{session_id}", response_model=SessionResponse)
def get_session(campaign_id: UUID, session_id: UUID, db_session: DbSession) -> SessionResponse:
    try:
        stored_session = session_service.get_session(
            db_session,
            campaign_id=campaign_id,
            session_id=session_id,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return SessionResponse.model_validate(stored_session)


@router.patch("/campaigns/{campaign_id}/sessions/{session_id}", response_model=SessionResponse)
def update_session(
    campaign_id: UUID,
    session_id: UUID,
    session_update: SessionUpdate,
    db_session: DbSession,
) -> SessionResponse:
    try:
        updated_session = session_service.update_session(
            db_session,
            campaign_id=campaign_id,
            session_id=session_id,
            session_update=session_update,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return SessionResponse.model_validate(updated_session)


@router.delete(
    "/campaigns/{campaign_id}/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_session(campaign_id: UUID, session_id: UUID, db_session: DbSession) -> Response:
    try:
        session_service.delete_session(
            db_session,
            campaign_id=campaign_id,
            session_id=session_id,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)
