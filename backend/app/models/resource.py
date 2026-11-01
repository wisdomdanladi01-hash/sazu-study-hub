from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class ResourceCategory(Base):
    __tablename__ = "resource_categories"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class Resource(Base):
    __tablename__ = "resources"
    __table_args__ = (
        CheckConstraint(
            "access_policy IN ('subscription_or_entitlement', 'entitlement_only', 'public')",
            name="ck_resource_access_policy",
        ),
        CheckConstraint(
            "preview_policy IN ('none', 'public_sample', 'authenticated_only')",
            name="ck_resource_preview_policy",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    storage_provider: Mapped[str] = mapped_column(
        String(50), default="local_private", server_default="local_private", nullable=False
    )
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    file_checksum_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("resource_categories.id"), nullable=True, index=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), nullable=True, index=True)
    course_offering_id: Mapped[int | None] = mapped_column(
        ForeignKey("course_offerings.id"), nullable=True, index=True
    )
    academic_level_id: Mapped[int | None] = mapped_column(
        ForeignKey("academic_levels.id"), nullable=True, index=True
    )
    academic_session_id: Mapped[int | None] = mapped_column(
        ForeignKey("academic_sessions.id"), nullable=True, index=True
    )
    semester_id: Mapped[int | None] = mapped_column(ForeignKey("semesters.id"), nullable=True, index=True)
    resource_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("resource_types.id"), nullable=True, index=True
    )
    is_published: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false(), nullable=False, index=True
    )
    access_policy: Mapped[str] = mapped_column(
        String(30),
        default="subscription_or_entitlement",
        server_default="subscription_or_entitlement",
        nullable=False,
    )
    preview_policy: Mapped[str] = mapped_column(
        String(30),
        default="none",
        server_default="none",
        nullable=False,
    )
    preview_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    requires_verification: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )
    available_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    available_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Multi-file support (e.g. 5 ordered photos of test pages or attachments)
    files: Mapped[list[ResourceFile]] = relationship(
        "ResourceFile", back_populates="resource", cascade="all, delete-orphan", order_by="ResourceFile.page_order"
    )

    # Multi-course offering association
    course_offerings: Mapped[list[ResourceCourseOffering]] = relationship(
        "ResourceCourseOffering", back_populates="resource", cascade="all, delete-orphan"
    )

    @property
    def course_offering_ids(self) -> list[int]:
        ids = [co.course_offering_id for co in self.course_offerings]
        if self.course_offering_id and self.course_offering_id not in ids:
            ids.insert(0, self.course_offering_id)
        return ids


class ResourceFile(Base):
    __tablename__ = "resource_files"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    resource_id: Mapped[int] = mapped_column(
        ForeignKey("resources.id", ondelete="CASCADE"), nullable=False, index=True
    )
    storage_provider: Mapped[str] = mapped_column(String(50), nullable=False, default="local_private")
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    file_checksum_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    page_order: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    resource: Mapped[Resource] = relationship("Resource", back_populates="files")


class ResourceCourseOffering(Base):
    __tablename__ = "resource_course_offerings"
    __table_args__ = (
        UniqueConstraint("resource_id", "course_offering_id", name="uq_resource_course_offering"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    resource_id: Mapped[int] = mapped_column(
        ForeignKey("resources.id", ondelete="CASCADE"), nullable=False, index=True
    )
    course_offering_id: Mapped[int] = mapped_column(
        ForeignKey("course_offerings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    resource: Mapped[Resource] = relationship("Resource", back_populates="course_offerings")
