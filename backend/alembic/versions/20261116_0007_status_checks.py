"""Constrain status columns to their allowed values after refusing rows that hold other values."""

from __future__ import annotations

from typing import NamedTuple

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "20261116_0007"
down_revision = "20261116_0006"
branch_labels = None
depends_on = None


class StatusCheck(NamedTuple):
    table_name: str
    column_name: str
    allowed_values: tuple[str, ...]

    @property
    def constraint_name(self) -> str:
        return f"ck_{self.table_name}_{self.column_name}_allowed"

    @property
    def allowed_values_sql(self) -> str:
        return ", ".join(f"'{allowed_value}'" for allowed_value in self.allowed_values)


STATUS_CHECKS = (
    StatusCheck("entity_relationships", "lifecycle_status", ("current", "former")),
    StatusCheck("entity_relationships", "visibility_status", ("public", "secret")),
    StatusCheck("entity_relationships", "certainty_status", ("confirmed", "rumored")),
    StatusCheck("source_assets", "lifecycle_status", ("active", "deleting")),
    StatusCheck("source_assets", "storage_status", ("available", "missing")),
    StatusCheck("source_assets", "parse_status", ("pending", "running", "succeeded", "failed")),
    StatusCheck("asset_parse_results", "parse_status", ("pending", "running", "succeeded", "failed")),
    StatusCheck("extraction_jobs", "status", ("pending", "running", "completed", "failed")),
    StatusCheck("extraction_candidates", "status", ("pending", "approved", "rejected")),
)


def describe_out_of_range_values(status_check: StatusCheck) -> list[str]:
    out_of_range_value_counts = (
        op.get_bind()
        .execute(
            sa.text(
                f"SELECT {status_check.column_name} AS status_value, count(*) AS row_count "
                f"FROM {status_check.table_name} "
                f"WHERE {status_check.column_name} NOT IN ({status_check.allowed_values_sql}) "
                f"GROUP BY {status_check.column_name} ORDER BY {status_check.column_name}"
            )
        )
        .all()
    )
    return [
        f"{status_check.table_name}.{status_check.column_name}: '{value_count.status_value}' "
        f"in {value_count.row_count} {'row' if value_count.row_count == 1 else 'rows'} "
        f"(allowed: {status_check.allowed_values_sql})"
        for value_count in out_of_range_value_counts
    ]


def refuse_existing_out_of_range_statuses() -> None:
    out_of_range_descriptions = [
        description for status_check in STATUS_CHECKS for description in describe_out_of_range_values(status_check)
    ]
    if not out_of_range_descriptions:
        return
    raise RuntimeError(
        "\n".join(
            [
                "Cannot add status CHECK constraints: status columns hold values outside their allowed set. "
                "Fix those rows and rerun the migration. Nothing was changed.",
                *out_of_range_descriptions,
            ]
        )
    )


def upgrade() -> None:
    refuse_existing_out_of_range_statuses()
    for status_check in STATUS_CHECKS:
        op.create_check_constraint(
            status_check.constraint_name,
            status_check.table_name,
            f"{status_check.column_name} IN ({status_check.allowed_values_sql})",
        )


def downgrade() -> None:
    for status_check in reversed(STATUS_CHECKS):
        op.drop_constraint(status_check.constraint_name, status_check.table_name, type_="check")
