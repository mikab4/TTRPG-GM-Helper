from __future__ import annotations

from enum import StrEnum
from typing import TypeVar

StrEnumType = TypeVar("StrEnumType", bound=StrEnum)


class EntityType(StrEnum):
    PERSON = "person"
    LOCATION = "location"
    ORGANIZATION = "organization"
    ITEM = "item"
    EVENT = "event"
    DEITY = "deity"
    OTHER = "other"


class RelationshipFamily(StrEnum):
    FAMILY = "family"
    ROMANCE = "romance"
    SOCIAL = "social"
    ORGANIZATION = "organization"
    POLITICAL = "political"
    LOCATION = "location"
    CONFLICT = "conflict"
    INFLUENCE = "influence"
    EVENT = "event"


def format_relationship_family_label(relationship_family: "RelationshipFamily | str") -> str:
    raw_value = relationship_family.value if isinstance(relationship_family, RelationshipFamily) else relationship_family
    return " ".join(word.capitalize() for word in raw_value.split("_"))


class RelationshipLifecycleStatus(StrEnum):
    CURRENT = "current"
    FORMER = "former"


class RelationshipVisibilityStatus(StrEnum):
    PUBLIC = "public"
    SECRET = "secret"


class RelationshipCertaintyStatus(StrEnum):
    CONFIRMED = "confirmed"
    RUMORED = "rumored"


class SourceAssetTruthStatus(StrEnum):
    CANONICAL = "canonical"
    UNCERTAIN = "uncertain"
    SUBJECTIVE = "subjective"


class ParseStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class AssetParserKind(StrEnum):
    TEXT = "text"
    SPREADSHEET = "spreadsheet"
    IMAGE = "image"


class AssetStorageBackend(StrEnum):
    LOCAL = "local"


class ExtractionJobStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ExtractorKind(StrEnum):
    RULES = "rules"


class ExtractionCandidateType(StrEnum):
    ENTITY = "entity"
    RELATIONSHIP = "relationship"


class ExtractionCandidateStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class HealthStatus(StrEnum):
    OK = "ok"


def normalize_str_enum_value(enum_type: type[StrEnumType], raw_value: str) -> StrEnumType:
    normalized_value = raw_value.strip().lower()
    try:
        return enum_type(normalized_value)
    except ValueError as exc:
        allowed_values = ", ".join(sorted(enum_member.value for enum_member in enum_type))
        enum_name = enum_type.__name__.replace("_", " ")
        raise ValueError(f"{enum_name} must be one of: {allowed_values}.") from exc
