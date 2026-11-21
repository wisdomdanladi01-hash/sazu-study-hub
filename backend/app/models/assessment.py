from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class AssessmentQuestion(Base):
    """One multiple-choice question in the bank, tied to a course and optionally a source resource."""

    __tablename__ = "assessment_questions"
    __table_args__ = (
        CheckConstraint("difficulty IN ('easy', 'medium', 'hard')", name="ck_question_difficulty"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)
    resource_id: Mapped[int | None] = mapped_column(
        ForeignKey("resources.id", ondelete="SET NULL"), nullable=True, index=True
    )
    topic: Mapped[str | None] = mapped_column(String(150), nullable=True, index=True)
    source_label: Mapped[str | None] = mapped_column(String(150), nullable=True)
    difficulty: Mapped[str] = mapped_column(String(10), default="medium", server_default="medium", nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    # [{"key": "A", "text": "..."}, ...] - 2 to 5 options
    options: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)
    correct_key: Mapped[str] = mapped_column(String(1), nullable=False)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true(), nullable=False, index=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )


class AssessmentConfig(Base):
    """A configured test: which course, which source resources, how many questions, how long."""

    __tablename__ = "assessment_configs"
    __table_args__ = (
        CheckConstraint("question_count > 0", name="ck_config_question_count"),
        CheckConstraint("duration_minutes > 0", name="ck_config_duration"),
        CheckConstraint("pass_mark_percent BETWEEN 0 AND 100", name="ck_config_pass_mark"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)
    semester_id: Mapped[int | None] = mapped_column(ForeignKey("semesters.id"), nullable=True, index=True)
    question_count: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    pass_mark_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    shuffle_questions: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true(), nullable=False)
    shuffle_options: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false(), nullable=False)
    reveal_answers: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true(), nullable=False)
    max_attempts: Mapped[int | None] = mapped_column(Integer, nullable=True)
    requires_subscription: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true(), nullable=False)
    topics: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false(), nullable=False, index=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )

    resource_links: Mapped[list[AssessmentConfigResource]] = relationship(
        "AssessmentConfigResource", back_populates="config", cascade="all, delete-orphan"
    )

    @property
    def resource_ids(self) -> list[int]:
        return sorted(link.resource_id for link in self.resource_links)


class AssessmentConfigResource(Base):
    """Source resources a test draws its questions from (empty = any question for the course)."""

    __tablename__ = "assessment_config_resources"
    __table_args__ = (UniqueConstraint("config_id", "resource_id", name="uq_config_resource"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    config_id: Mapped[int] = mapped_column(
        ForeignKey("assessment_configs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    resource_id: Mapped[int] = mapped_column(
        ForeignKey("resources.id", ondelete="CASCADE"), nullable=False, index=True
    )

    config: Mapped[AssessmentConfig] = relationship("AssessmentConfig", back_populates="resource_links")


class AssessmentAttempt(Base):
    """A student's sitting of a test. Questions are frozen at start; grading happens on the server."""

    __tablename__ = "assessment_attempts"
    __table_args__ = (
        CheckConstraint("status IN ('in_progress', 'submitted', 'expired')", name="ck_attempt_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    config_id: Mapped[int] = mapped_column(
        ForeignKey("assessment_configs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(12), default="in_progress", nullable=False, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    question_ids: Mapped[list[int]] = mapped_column(JSON, nullable=False)
    # {"<question_id>": ["B", "A", "D", "C"]} - the order options were shown in
    option_orders: Mapped[dict[str, list[str]]] = mapped_column(JSON, nullable=False, default=dict)
    answers: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False, default=dict)
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    correct_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    score_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    passed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    config: Mapped[AssessmentConfig] = relationship("AssessmentConfig")
