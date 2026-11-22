from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class AccessPackage(Base):
    __tablename__ = "access_packages"
    __table_args__ = (
        CheckConstraint(
            "package_type IN ('subscription', 'semester', 'session', 'level', 'course', 'resource', 'resource_package')",
            name="ck_access_package_type",
        ),
        CheckConstraint("price_minor >= 0", name="ck_access_package_price_nonnegative"),
        CheckConstraint(
            "is_active = false OR semester_id IS NOT NULL OR academic_session_id IS NOT NULL OR academic_level_id IS NOT NULL OR course_id IS NOT NULL OR resource_id IS NOT NULL",
            name="ck_active_package_target",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    package_type: Mapped[str] = mapped_column(String(30), nullable=False)
    price_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    subscriber_price_minor: Mapped[int | None] = mapped_column(Integer, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="NGN", nullable=False)
    semester_id: Mapped[int | None] = mapped_column(ForeignKey("semesters.id"), nullable=True, index=True)
    academic_session_id: Mapped[int | None] = mapped_column(
        ForeignKey("academic_sessions.id"), nullable=True, index=True
    )
    academic_level_id: Mapped[int | None] = mapped_column(
        ForeignKey("academic_levels.id"), nullable=True, index=True
    )
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), nullable=True, index=True)
    resource_id: Mapped[int | None] = mapped_column(ForeignKey("resources.id"), nullable=True, index=True)
    available_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    available_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class PackageCourse(Base):
    __tablename__ = "package_courses"
    __table_args__ = (UniqueConstraint("package_id", "course_id", name="uq_package_course"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    package_id: Mapped[int] = mapped_column(ForeignKey("access_packages.id"), nullable=False, index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)


class PackageResource(Base):
    __tablename__ = "package_resources"
    __table_args__ = (UniqueConstraint("package_id", "resource_id", name="uq_package_resource"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    package_id: Mapped[int] = mapped_column(ForeignKey("access_packages.id"), nullable=False, index=True)
    resource_id: Mapped[int] = mapped_column(ForeignKey("resources.id"), nullable=False, index=True)


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'succeeded', 'failed', 'refunded', 'disputed')",
            name="ck_payment_status",
        ),
        CheckConstraint(
            "refund_review_status IN ('not_applicable', 'pending', 'approved', 'rejected')",
            name="ck_payment_refund_review_status",
        ),
        CheckConstraint("amount_minor >= 0", name="ck_payment_amount_nonnegative"),
        CheckConstraint(
            "subscription_id IS NOT NULL OR package_id IS NOT NULL",
            name="ck_payment_has_single_product",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    subscription_id: Mapped[int | None] = mapped_column(
        ForeignKey("subscriptions.id"), nullable=True, unique=True
    )
    package_id: Mapped[int | None] = mapped_column(ForeignKey("access_packages.id"), nullable=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    provider_reference: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True)
    semester_id: Mapped[int | None] = mapped_column(
        ForeignKey("semesters.id"), nullable=True, index=True
    )
    idempotency_key: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False, index=True)
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    checkout_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    provider_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    refund_review_status: Mapped[str] = mapped_column(
        String(20), default="not_applicable", nullable=False
    )
    reviewed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class Entitlement(Base):
    __tablename__ = "entitlements"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'revoked', 'expired')",
            name="ck_entitlement_status",
        ),
        UniqueConstraint(
            "payment_id", "package_id", "course_id", "resource_id", name="uq_payment_entitlement_scope"
        ),
        UniqueConstraint("scope_key", name="uq_entitlement_scope_key"),
        CheckConstraint(
            "package_id IS NOT NULL OR course_id IS NOT NULL OR resource_id IS NOT NULL",
            name="ck_entitlement_has_scope",
        ),
        UniqueConstraint("subscription_id", name="uq_entitlement_subscription"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    payment_id: Mapped[int] = mapped_column(ForeignKey("payments.id"), nullable=False, index=True)
    subscription_id: Mapped[int | None] = mapped_column(
        ForeignKey("subscriptions.id"), nullable=True
    )
    scope_key: Mapped[str] = mapped_column(String(500), nullable=False)
    package_id: Mapped[int | None] = mapped_column(ForeignKey("access_packages.id"), nullable=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), nullable=True)
    resource_id: Mapped[int | None] = mapped_column(ForeignKey("resources.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False, index=True)
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
