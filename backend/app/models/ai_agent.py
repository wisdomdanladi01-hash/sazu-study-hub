from __future__ import annotations

from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class StudentDiagnosticProfile(Base):
    """Stores student academic performance metrics, weak areas, and target CGPA for AI study planning."""

    __tablename__ = "student_diagnostic_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False, index=True)
    target_cgpa: Mapped[float] = mapped_column(Float, default=4.0, nullable=False)
    current_cgpa: Mapped[float | None] = mapped_column(Float, nullable=True)
    daily_study_hours: Mapped[float] = mapped_column(Float, default=2.5, nullable=False)
    challenging_course_codes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    diagnostic_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class AIGeneratedQuestion(Base):
    """Questions synthesized automatically from uploaded PDFs, test papers, and syllabi."""

    __tablename__ = "ai_generated_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    resource_id: Mapped[int | None] = mapped_column(ForeignKey("resources.id"), nullable=True, index=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), nullable=True, index=True)
    question_type: Mapped[str] = mapped_column(String(30), default="multiple_choice", nullable=False)
    prompt_text: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON-encoded array of options
    correct_answer: Mapped[str] = mapped_column(Text, nullable=False)
    step_by_step_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    difficulty_level: Mapped[str] = mapped_column(String(20), default="medium", nullable=False)
    is_reviewed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class AIStudySchedulePlan(Base):
    """Personalized revision schedules and timetable synthesized for students targeting a specific GPA."""

    __tablename__ = "ai_study_schedule_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    target_cgpa_bracket: Mapped[str] = mapped_column(String(50), nullable=False)
    weekly_hours_allocated: Mapped[float] = mapped_column(Float, nullable=False)
    schedule_details_json: Mapped[str] = mapped_column(Text, nullable=False)  # Timetable & study blocks
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class AIAgentConsultationLog(Base):
    """Conversation history and query log with student consent escalation to admin."""

    __tablename__ = "ai_agent_consultation_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    query_text: Mapped[str] = mapped_column(Text, nullable=False)
    response_text: Mapped[str] = mapped_column(Text, nullable=False)
    suggested_resource_ids: Mapped[str | None] = mapped_column(String(255), nullable=True)
    escalated_to_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    support_ticket_id: Mapped[int | None] = mapped_column(ForeignKey("student_support_tickets.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
