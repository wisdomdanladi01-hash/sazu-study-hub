"""Add email verification to users and level target plus subscriber discounts to access packages.

Revision ID: 20261122_email_verification_and_level_plans
Revises: 20261121_plan_types_and_roles
Create Date: 2026-11-22 01:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261122_email_verification_and_level_plans"
down_revision: Union[str, None] = "20261121_plan_types_and_roles"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add email verification fields to users
    op.add_column(
        "users",
        sa.Column("email_verified", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column(
        "users",
        sa.Column("email_verification_code", sa.String(length=10), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("email_verification_expires_at", sa.DateTime(timezone=True), nullable=True),
    )

    # 2. Add level target and subscriber discount fields to access_packages
    op.add_column(
        "access_packages",
        sa.Column("academic_level_id", sa.Integer(), sa.ForeignKey("academic_levels.id"), nullable=True),
    )
    op.add_column(
        "access_packages",
        sa.Column("subscriber_price_minor", sa.Integer(), nullable=True),
    )
    op.create_index("ix_access_packages_academic_level_id", "access_packages", ["academic_level_id"])

    # 3. Update check constraints on access_packages
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.drop_constraint("ck_access_package_type", "access_packages", type_="check")
        op.create_check_constraint(
            "ck_access_package_type",
            "access_packages",
            "package_type IN ('subscription', 'semester', 'session', 'level', 'course', 'resource', 'resource_package')",
        )
        op.drop_constraint("ck_active_package_target", "access_packages", type_="check")
        op.create_check_constraint(
            "ck_active_package_target",
            "access_packages",
            "is_active = false OR semester_id IS NOT NULL OR academic_session_id IS NOT NULL OR academic_level_id IS NOT NULL OR course_id IS NOT NULL OR resource_id IS NOT NULL",
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.drop_constraint("ck_active_package_target", "access_packages", type_="check")
        op.create_check_constraint(
            "ck_active_package_target",
            "access_packages",
            "is_active = false OR semester_id IS NOT NULL OR academic_session_id IS NOT NULL OR course_id IS NOT NULL OR resource_id IS NOT NULL",
        )
        op.drop_constraint("ck_access_package_type", "access_packages", type_="check")
        op.create_check_constraint(
            "ck_access_package_type",
            "access_packages",
            "package_type IN ('subscription', 'semester', 'session', 'course', 'resource', 'resource_package')",
        )

    op.drop_index("ix_access_packages_academic_level_id", table_name="access_packages")
    op.drop_column("access_packages", "subscriber_price_minor")
    op.drop_column("access_packages", "academic_level_id")
    op.drop_column("users", "email_verification_expires_at")
    op.drop_column("users", "email_verification_code")
    op.drop_column("users", "email_verified")
