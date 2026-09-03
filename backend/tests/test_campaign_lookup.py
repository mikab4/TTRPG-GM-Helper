from __future__ import annotations

from uuid import uuid4

import pytest

from app.services.campaign_lookup import ensure_campaign_exists, get_campaign_or_raise
from app.services.errors import NotFoundError


def test_get_campaign_or_raise_returns_stored_campaign(
    db_session_factory,
    campaign_factory,
) -> None:
    existing_campaign_id = uuid4()
    with db_session_factory() as db_session:
        stored_campaign = campaign_factory(
            db_session=db_session,
            id=existing_campaign_id,
            name="Iron Vale",
        )
        loaded_campaign = get_campaign_or_raise(db_session, stored_campaign.id)

    assert loaded_campaign.id == stored_campaign.id


def test_get_campaign_or_raise_raises_for_missing_campaign(
    db_session_factory,
    campaign_factory,
) -> None:
    existing_campaign_id = uuid4()
    missing_campaign_id = uuid4()
    with db_session_factory() as db_session:
        campaign_factory(
            db_session=db_session,
            id=existing_campaign_id,
            name="Iron Vale",
        )

        with pytest.raises(NotFoundError, match="Campaign not found\\."):
            get_campaign_or_raise(db_session, missing_campaign_id)


def test_ensure_campaign_exists_raises_for_missing_campaign(
    db_session_factory,
    campaign_factory,
) -> None:
    existing_campaign_id = uuid4()
    missing_campaign_id = uuid4()

    with db_session_factory() as db_session:
        campaign_factory(
            db_session=db_session,
            id=existing_campaign_id,
            name="Iron Vale",
        )
        with pytest.raises(NotFoundError, match="Campaign not found\\."):
            ensure_campaign_exists(db_session, missing_campaign_id)
