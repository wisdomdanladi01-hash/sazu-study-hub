"""Add question bank, test configurations and attempts.

Revision ID: 20261120_assessments
Revises: 20261031_stage1_resource_storage
Create Date: 2026-11-20 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261120_assessments"
down_revision: Union[str, None] = "20261031_stage1_resource_storage"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assessment_questions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("resource_id", sa.Integer(), sa.ForeignKey("resources.id", ondelete="SET NULL"), nullable=True),
        sa.Column("topic", sa.String(150), nullable=True),
        sa.Column("source_label", sa.String(150), nullable=True),
        sa.Column("difficulty", sa.String(10), nullable=False, server_default="medium"),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("options", sa.JSON(), nullable=False),
        sa.Column("correct_key", sa.String(1), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("difficulty IN ('easy', 'medium', 'hard')", name="ck_question_difficulty"),
    )
    op.create_index("ix_assessment_questions_course_id", "assessment_questions", ["course_id"])
    op.create_index("ix_assessment_questions_resource_id", "assessment_questions", ["resource_id"])
    op.create_index("ix_assessment_questions_topic", "assessment_questions", ["topic"])
    op.create_index("ix_assessment_questions_is_active", "assessment_questions", ["is_active"])

    op.create_table(
        "assessment_configs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("semester_id", sa.Integer(), sa.ForeignKey("semesters.id"), nullable=True),
        sa.Column("question_count", sa.Integer(), nullable=False, server_default="20"),
        sa.Column("duration_minutes", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("pass_mark_percent", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("shuffle_questions", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("shuffle_options", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("reveal_answers", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("max_attempts", sa.Integer(), nullable=True),
        sa.Column("requires_subscription", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("topics", sa.JSON(), nullable=True),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("question_count > 0", name="ck_config_question_count"),
        sa.CheckConstraint("duration_minutes > 0", name="ck_config_duration"),
        sa.CheckConstraint("pass_mark_percent BETWEEN 0 AND 100", name="ck_config_pass_mark"),
    )
    op.create_index("ix_assessment_configs_course_id", "assessment_configs", ["course_id"])
    op.create_index("ix_assessment_configs_semester_id", "assessment_configs", ["semester_id"])
    op.create_index("ix_assessment_configs_is_published", "assessment_configs", ["is_published"])

    op.create_table(
        "assessment_config_resources",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("config_id", sa.Integer(), sa.ForeignKey("assessment_configs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("resource_id", sa.Integer(), sa.ForeignKey("resources.id", ondelete="CASCADE"), nullable=False),
        sa.UniqueConstraint("config_id", "resource_id", name="uq_config_resource"),
    )
    op.create_index("ix_assessment_config_resources_config_id", "assessment_config_resources", ["config_id"])
    op.create_index("ix_assessment_config_resources_resource_id", "assessment_config_resources", ["resource_id"])

    op.create_table(
        "assessment_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("config_id", sa.Integer(), sa.ForeignKey("assessment_configs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(12), nullable=False, server_default="in_progress"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("question_ids", sa.JSON(), nullable=False),
        sa.Column("option_orders", sa.JSON(), nullable=False),
        sa.Column("answers", sa.JSON(), nullable=False),
        sa.Column("total_questions", sa.Integer(), nullable=False),
        sa.Column("correct_count", sa.Integer(), nullable=True),
        sa.Column("score_percent", sa.Float(), nullable=True),
        sa.Column("passed", sa.Boolean(), nullable=True),
        sa.CheckConstraint("status IN ('in_progress', 'submitted', 'expired')", name="ck_attempt_status"),
    )
    op.create_index("ix_assessment_attempts_config_id", "assessment_attempts", ["config_id"])
    op.create_index("ix_assessment_attempts_user_id", "assessment_attempts", ["user_id"])
    op.create_index("ix_assessment_attempts_status", "assessment_attempts", ["status"])


def downgrade() -> None:
    op.drop_table("assessment_attempts")
    op.drop_table("assessment_config_resources")
    op.drop_table("assessment_configs")
    op.drop_table("assessment_questions")
