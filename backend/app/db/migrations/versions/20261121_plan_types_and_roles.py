"""Add academic session, course, and resource to access packages and seed admin roles.

Revision ID: 20261121_plan_types_and_roles
Revises: 20261120_assessments
Create Date: 2026-11-21 16:00:00.000000
"""

from typing import Sequence, Union
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


revision: str = "20261121_plan_types_and_roles"
down_revision: Union[str, None] = "20261120_assessments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add columns to access_packages
    op.add_column(
        "access_packages",
        sa.Column("academic_session_id", sa.Integer(), sa.ForeignKey("academic_sessions.id"), nullable=True),
    )
    op.add_column(
        "access_packages",
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id"), nullable=True),
    )
    op.add_column(
        "access_packages",
        sa.Column("resource_id", sa.Integer(), sa.ForeignKey("resources.id"), nullable=True),
    )
    op.create_index("ix_access_packages_academic_session_id", "access_packages", ["academic_session_id"])
    op.create_index("ix_access_packages_course_id", "access_packages", ["course_id"])
    op.create_index("ix_access_packages_resource_id", "access_packages", ["resource_id"])

    # 2. Update check constraints on access_packages
    # Some SQLite or Postgres engines handle constraints differently, use batch or safe check
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.drop_constraint("ck_access_package_type", "access_packages", type_="check")
        op.create_check_constraint(
            "ck_access_package_type",
            "access_packages",
            "package_type IN ('subscription', 'semester', 'session', 'course', 'resource', 'resource_package')",
        )
        op.drop_constraint("ck_active_package_has_semester", "access_packages", type_="check")
        op.create_check_constraint(
            "ck_active_package_target",
            "access_packages",
            "is_active = false OR semester_id IS NOT NULL OR academic_session_id IS NOT NULL OR course_id IS NOT NULL OR resource_id IS NOT NULL",
        )

    # 3. Seed canonical admin roles
    now = datetime.now(timezone.utc)
    roles_table = sa.table(
        "roles",
        sa.column("name", sa.String),
        sa.column("description", sa.Text),
        sa.column("created_at", sa.DateTime(timezone=True)),
    )
    roles_data = [
        {"name": "super_admin", "description": "Full access including administrator account management", "created_at": now},
        {"name": "admin", "description": "Full administrative access", "created_at": now},
        {"name": "content_admin", "description": "Curriculum, learning materials, and practice test management", "created_at": now},
        {"name": "finance_admin", "description": "Subscription packages, payments, and refund reviews", "created_at": now},
        {"name": "verification_officer", "description": "Student identity and academic verification", "created_at": now},
    ]
    for r in roles_data:
        # Insert if not exists
        bind.execute(
            sa.text(
                "INSERT INTO roles (name, description, created_at) "
                "SELECT :name, :description, :created_at "
                "WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = :name)"
            ),
            r,
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.drop_constraint("ck_active_package_target", "access_packages", type_="check")
        op.create_check_constraint(
            "ck_active_package_has_semester",
            "access_packages",
            "is_active = false OR semester_id IS NOT NULL",
        )
        op.drop_constraint("ck_access_package_type", "access_packages", type_="check")
        op.create_check_constraint(
            "ck_access_package_type",
            "access_packages",
            "package_type IN ('course', 'resource_package', 'subscription')",
        )

    op.drop_index("ix_access_packages_resource_id", table_name="access_packages")
    op.drop_index("ix_access_packages_course_id", table_name="access_packages")
    op.drop_index("ix_access_packages_academic_session_id", table_name="access_packages")
    op.drop_column("access_packages", "resource_id")
    op.drop_column("access_packages", "course_id")
    op.drop_column("access_packages", "academic_session_id")
