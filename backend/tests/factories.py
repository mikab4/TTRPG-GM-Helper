from __future__ import annotations

from datetime import date

import factory
from sqlalchemy.orm import Session

from app.models.campaign import Campaign
from app.models.entity import Entity
from app.models.owner import Owner
from app.models.relationship import Relationship
from app.models.session import Session as CampaignSession


class SQLAlchemyModelFactory(factory.Factory):
    class Meta:
        abstract = True

    @classmethod
    def create_in_session(cls, db_session: Session, **kwargs):
        model_instance = cls.build(**kwargs)
        db_session.add(model_instance)
        db_session.flush()
        return model_instance


class OwnerFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Owner

    email = factory.Sequence(lambda n: f"owner{n}@example.com")
    display_name = factory.Sequence(lambda n: f"Owner {n}")


class CampaignFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Campaign

    owner = factory.SubFactory(OwnerFactory)
    owner_id = factory.SelfAttribute("owner.id")
    name = factory.Sequence(lambda n: f"Campaign {n}")
    description = "Urban intrigue campaign"


class EntityFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Entity

    campaign_id = None
    type = "person"
    name = factory.Sequence(lambda n: f"Entity {n}")
    summary = None
    source_asset_id = None
    provenance_excerpt = None
    metadata_ = factory.LazyFunction(dict)
    provenance_data = factory.LazyFunction(dict)


class RelationshipFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Relationship

    campaign_id = None
    source_entity_id = None
    target_entity_id = None
    relationship_type = "knows"
    notes = None
    confidence = None
    source_asset_id = None
    provenance_excerpt = None
    provenance_data = factory.LazyFunction(dict)


class SessionFactory(SQLAlchemyModelFactory):
    class Meta:
        model = CampaignSession

    campaign_id = None
    session_number = factory.Sequence(lambda n: n + 1)
    session_label = None
    played_on = date(2026, 4, 1)
    summary = None
