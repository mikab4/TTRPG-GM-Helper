from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Session as CampaignSession
from app.schemas import SessionCreate, SessionUpdate
from app.services.campaign_lookup import ensure_campaign_exists
from app.services.errors import NotFoundError


def create_session(
    db_session: Session,
    *,
    campaign_id: UUID,
    session_create: SessionCreate,
) -> CampaignSession:
    ensure_campaign_exists(db_session, campaign_id)

    created_session = CampaignSession(
        campaign_id=campaign_id,
        session_number=session_create.session_number,
        session_label=session_create.session_label,
        played_on=session_create.played_on,
        summary=session_create.summary,
    )
    db_session.add(created_session)
    db_session.commit()
    db_session.refresh(created_session)
    return created_session


def list_sessions(
    db_session: Session,
    *,
    campaign_id: UUID,
) -> list[CampaignSession]:
    ensure_campaign_exists(db_session, campaign_id)
    statement = (
        select(CampaignSession)
        .where(CampaignSession.campaign_id == campaign_id)
        .order_by(CampaignSession.session_number.asc(), CampaignSession.played_on.asc(), CampaignSession.id)
    )
    return list(db_session.scalars(statement))


def get_session(
    db_session: Session,
    *,
    campaign_id: UUID,
    session_id: UUID,
) -> CampaignSession:
    stored_session = db_session.scalar(
        select(CampaignSession).where(
            CampaignSession.id == session_id,
            CampaignSession.campaign_id == campaign_id,
        )
    )
    if stored_session is None:
        raise NotFoundError("Session not found.")
    return stored_session


def update_session(
    db_session: Session,
    *,
    campaign_id: UUID,
    session_id: UUID,
    session_update: SessionUpdate,
) -> CampaignSession:
    stored_session = get_session(
        db_session,
        campaign_id=campaign_id,
        session_id=session_id,
    )
    for field_name, field_value in session_update.model_dump(exclude_unset=True).items():
        setattr(stored_session, field_name, field_value)

    if stored_session.session_number is None and stored_session.session_label is None:
        raise ValueError("Session number or session label must remain set.")

    db_session.commit()
    db_session.refresh(stored_session)
    return stored_session


def delete_session(
    db_session: Session,
    *,
    campaign_id: UUID,
    session_id: UUID,
) -> None:
    stored_session = get_session(
        db_session,
        campaign_id=campaign_id,
        session_id=session_id,
    )
    db_session.delete(stored_session)
    db_session.commit()
