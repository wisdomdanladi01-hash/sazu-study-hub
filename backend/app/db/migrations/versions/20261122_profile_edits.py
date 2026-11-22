"""Add nickname, avatar_url, and last_profile_edit_at to users.

Revision ID: 20261122_profile_edits
Revises: 20261122_email_level_plans
Create Date: 2026-11-22 14:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "20261122_profile_edits"
down_revision: Union[str, None] = "20261122_email_level_plans"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("nickname", sa.String(length=100), nullable=True))
    op.add_column("users", sa.Column("avatar_url", sa.String(length=500), nullable=True))
    op.add_column("users", sa.Column("last_profile_edit_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "last_profile_edit_at")
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "nickname")
