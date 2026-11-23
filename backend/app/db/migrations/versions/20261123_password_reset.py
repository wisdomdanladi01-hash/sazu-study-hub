"""Add password reset code and expires_at to users table.

Revision ID: 20261123_password_reset
Revises: 20261122_profile_edits
Create Date: 2026-11-23 19:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "20261123_password_reset"
down_revision: Union[str, None] = "20261122_profile_edits"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_reset_code", sa.String(length=10), nullable=True))
    op.add_column("users", sa.Column("password_reset_expires_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "password_reset_expires_at")
    op.drop_column("users", "password_reset_code")
