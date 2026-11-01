"""Add ResourceFile, ResourceCourseOffering, and Stage 1 storage columns.

Revision ID: 20261031_stage1_resource_storage
Revises: 20261029_resource_previews
Create Date: 2026-10-31 22:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261031_stage1_resource_storage"
down_revision: Union[str, None] = "20261029_resource_previews"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Update resources table
    with op.batch_alter_table("resources") as batch_op:
        batch_op.add_column(
            sa.Column(
                "course_offering_id",
                sa.Integer(),
                sa.ForeignKey("course_offerings.id", ondelete="SET NULL"),
                nullable=True,
            )
        )
        batch_op.add_column(
            sa.Column(
                "storage_provider",
                sa.String(50),
                nullable=False,
                server_default="local_private",
            )
        )
        batch_op.add_column(
            sa.Column("file_checksum_sha256", sa.String(64), nullable=True)
        )
        batch_op.create_index(
            "ix_resources_course_offering_id", ["course_offering_id"], unique=False
        )

    # 2. Create resource_files table
    op.create_table(
        "resource_files",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "resource_id",
            sa.Integer(),
            sa.ForeignKey("resources.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "storage_provider",
            sa.String(50),
            nullable=False,
            server_default="local_private",
        ),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column("file_checksum_sha256", sa.String(64), nullable=True),
        sa.Column("page_order", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # 3. Create resource_course_offerings table
    op.create_table(
        "resource_course_offerings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "resource_id",
            sa.Integer(),
            sa.ForeignKey("resources.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "course_offering_id",
            sa.Integer(),
            sa.ForeignKey("course_offerings.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "resource_id", "course_offering_id", name="uq_resource_course_offering"
        ),
    )


def downgrade() -> None:
    op.drop_table("resource_course_offerings")
    op.drop_table("resource_files")
    with op.batch_alter_table("resources") as batch_op:
        batch_op.drop_index("ix_resources_course_offering_id")
        batch_op.drop_column("file_checksum_sha256")
        batch_op.drop_column("storage_provider")
        batch_op.drop_column("course_offering_id")

