from datetime import datetime, time, timedelta, timezone
from uuid import uuid4

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.academic import AcademicLevel, AcademicSession, Course, Semester, StudentAcademicProfile
from app.models.audit import AuditEvent
from app.models.commerce import AccessPackage, Entitlement, PackageCourse, PackageResource, Payment
from app.models.resource import Resource
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.payments import SubscriptionStatus
from app.services.errors import ConflictError, NotFoundError, PolicyError
from app.services.paystack import (
    PaystackError,
    VerifiedTransaction,
    initialize_transaction,
    verify_transaction,
)
from app.services.resources import find_paid_entitlement


class PaymentRejected(Exception):
    """The provider verified transaction details that must not grant access."""


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _package_available(package: AccessPackage, now: datetime) -> bool:
    return (
        package.is_active
        and (package.available_from is None or _utc(package.available_from) <= now)
        and (package.available_until is None or _utc(package.available_until) > now)
    )


def get_package_target_name(db: Session, package: AccessPackage) -> str:
    if package.package_type in ("subscription", "semester") and package.semester_id:
        sem = db.get(Semester, package.semester_id)
        if sem:
            sess = db.get(AcademicSession, sem.academic_session_id)
            sess_name = sess.name if sess else "Session"
            return f"{sess_name} - Semester {sem.number}"
        return f"Semester {package.semester_id}"
    elif package.package_type == "session" and package.academic_session_id:
        sess = db.get(AcademicSession, package.academic_session_id)
        return f"Academic Session {sess.name}" if sess else f"Session {package.academic_session_id}"
    elif package.package_type == "level" and package.academic_level_id:
        lvl = db.get(AcademicLevel, package.academic_level_id)
        if lvl:
            lvl_name = lvl.name.strip()
            if "level" in lvl_name.lower():
                return f"{lvl_name} Pass"
            return f"{lvl_name} Level Pass"
        return f"Level {package.academic_level_id}"
    elif package.package_type == "course" and package.course_id:
        course = db.get(Course, package.course_id)
        return f"{course.code} - {course.title}" if course else f"Course {package.course_id}"
    elif package.package_type in ("resource", "resource_package") and package.resource_id:
        res = db.get(Resource, package.resource_id)
        return res.title if res else f"Resource {package.resource_id}"
    return "All Resources"


def get_package_metrics(db: Session, package_id: int) -> tuple[int, int]:
    result = db.execute(
        select(
            func.count(Payment.id),
            func.coalesce(func.sum(Payment.amount_minor), 0),
        ).where(Payment.package_id == package_id, Payment.status == "succeeded")
    ).first()
    if result:
        return int(result[0] or 0), int(result[1] or 0)
    return 0, 0


def list_subscription_packages(
    db: Session, *, include_inactive: bool = False
) -> list[tuple[AccessPackage, Semester | None, str, int, int]]:
    now = datetime.now(timezone.utc)
    query = select(AccessPackage).order_by(AccessPackage.created_at.desc(), AccessPackage.name.asc())
    if not include_inactive:
        query = query.where(
            AccessPackage.is_active.is_(True),
            (AccessPackage.available_from.is_(None)) | (AccessPackage.available_from <= now),
            (AccessPackage.available_until.is_(None)) | (AccessPackage.available_until > now),
        )
    packages = list(db.scalars(query))
    results = []
    for pkg in packages:
        sem = db.get(Semester, pkg.semester_id) if pkg.semester_id else None
        if not include_inactive and pkg.package_type in ("subscription", "semester") and sem and sem.ends_on < now.date():
            continue
        target_name = get_package_target_name(db, pkg)
        buyers_count, rev = get_package_metrics(db, pkg.id)
        results.append((pkg, sem, target_name, buyers_count, rev))
    return results


def create_subscription_package(
    db: Session,
    admin: User,
    *,
    name: str,
    description: str | None,
    price_minor: int,
    currency: str,
    package_type: str = "semester",
    subscriber_price_minor: int | None = None,
    semester_id: int | None = None,
    academic_session_id: int | None = None,
    academic_level_id: int | None = None,
    course_id: int | None = None,
    resource_id: int | None = None,
    available_from: datetime | None = None,
    available_until: datetime | None = None,
    is_active: bool = False,
) -> AccessPackage:
    if currency != "NGN":
        raise PolicyError("Paystack subscriptions currently support NGN packages only.")
    if package_type in ("subscription", "semester"):
        if not semester_id or db.get(Semester, semester_id) is None:
            raise PolicyError("The selected semester does not exist.")
    elif package_type == "session":
        if not academic_session_id or db.get(AcademicSession, academic_session_id) is None:
            raise PolicyError("The selected academic session does not exist.")
    elif package_type == "level":
        if not academic_level_id or db.get(AcademicLevel, academic_level_id) is None:
            raise PolicyError("The selected academic level does not exist.")
    elif package_type == "course":
        if not course_id or db.get(Course, course_id) is None:
            raise PolicyError("The selected course does not exist.")
    elif package_type in ("resource", "resource_package"):
        if not resource_id or db.get(Resource, resource_id) is None:
            raise PolicyError("The selected resource does not exist.")
    else:
        raise PolicyError(f"Unsupported package type: {package_type}")

    if (
        available_from is not None
        and available_until is not None
        and _utc(available_until) <= _utc(available_from)
    ):
        raise PolicyError("available_until must be later than available_from.")

    package = AccessPackage(
        name=name.strip(),
        description=description,
        package_type=package_type,
        price_minor=price_minor,
        subscriber_price_minor=subscriber_price_minor,
        currency=currency,
        semester_id=semester_id,
        academic_session_id=academic_session_id,
        academic_level_id=academic_level_id,
        course_id=course_id,
        resource_id=resource_id,
        available_from=available_from,
        available_until=available_until,
        is_active=is_active,
    )
    try:
        db.add(package)
        db.flush()
        if course_id:
            db.add(PackageCourse(package_id=package.id, course_id=course_id))
        if resource_id:
            db.add(PackageResource(package_id=package.id, resource_id=resource_id))
        db.add(
            AuditEvent(
                actor_user_id=admin.id,
                action="admin.subscription_package_created",
                target_type="access_package",
                target_id=str(package.id),
                event_metadata={
                    "package_type": package_type,
                    "price_minor": price_minor,
                    "subscriber_price_minor": subscriber_price_minor,
                },
            )
        )
        db.commit()
        db.refresh(package)
        return package
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("A package with this name already exists.") from exc


def update_subscription_package(
    db: Session, admin: User, package: AccessPackage, changes: dict
) -> AccessPackage:
    effective_type = changes.get("package_type", package.package_type)
    effective_semester_id = changes.get("semester_id", package.semester_id)
    effective_session_id = changes.get("academic_session_id", package.academic_session_id)
    effective_level_id = changes.get("academic_level_id", package.academic_level_id)
    effective_course_id = changes.get("course_id", package.course_id)
    effective_resource_id = changes.get("resource_id", package.resource_id)

    if effective_type in ("subscription", "semester") and effective_semester_id is not None:
        if db.get(Semester, effective_semester_id) is None:
            raise PolicyError("The selected semester does not exist.")
    elif effective_type == "session" and effective_session_id is not None:
        if db.get(AcademicSession, effective_session_id) is None:
            raise PolicyError("The selected academic session does not exist.")
    elif effective_type == "level" and effective_level_id is not None:
        if db.get(AcademicLevel, effective_level_id) is None:
            raise PolicyError("The selected academic level does not exist.")
    elif effective_type == "course" and effective_course_id is not None:
        if db.get(Course, effective_course_id) is None:
            raise PolicyError("The selected course does not exist.")
    elif effective_type in ("resource", "resource_package") and effective_resource_id is not None:
        if db.get(Resource, effective_resource_id) is None:
            raise PolicyError("The selected resource does not exist.")

    if changes.get("currency", package.currency) != "NGN":
        raise PolicyError("Paystack subscriptions currently support NGN packages only.")
    available_from = changes.get("available_from", package.available_from)
    available_until = changes.get("available_until", package.available_until)
    if (
        available_from is not None
        and available_until is not None
        and _utc(available_until) <= _utc(available_from)
    ):
        raise PolicyError("available_until must be later than available_from.")

    for field_name, value in changes.items():
        if field_name == "name" and value is not None:
            value = value.strip()
        setattr(package, field_name, value)

    if package.course_id:
        existing_pc = db.scalar(
            select(PackageCourse).where(
                PackageCourse.package_id == package.id,
                PackageCourse.course_id == package.course_id,
            )
        )
        if not existing_pc:
            db.add(PackageCourse(package_id=package.id, course_id=package.course_id))
    if package.resource_id:
        existing_pr = db.scalar(
            select(PackageResource).where(
                PackageResource.package_id == package.id,
                PackageResource.resource_id == package.resource_id,
            )
        )
        if not existing_pr:
            db.add(PackageResource(package_id=package.id, resource_id=package.resource_id))

    try:
        db.add(
            AuditEvent(
                actor_user_id=admin.id,
                action="admin.subscription_package_updated",
                target_type="access_package",
                target_id=str(package.id),
                event_metadata=changes,
            )
        )
        db.commit()
        db.refresh(package)
        return package
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("A package with this name already exists.") from exc


def delete_subscription_package(db: Session, admin: User, package: AccessPackage) -> None:
    """Delete a subscription package, or deactivate it if referenced by payments."""
    has_payments = db.scalar(
        select(Payment.id).where(Payment.package_id == package.id).limit(1)
    ) is not None

    if has_payments:
        package.is_active = False
        db.add(
            AuditEvent(
                actor_user_id=admin.id,
                action="admin.subscription_package_deactivated",
                target_type="access_package",
                target_id=str(package.id),
                event_metadata={"reason": "Has associated payment history; deactivated instead of deleted."},
            )
        )
        db.commit()
    else:
        # Clean up associations
        for pc in db.scalars(select(PackageCourse).where(PackageCourse.package_id == package.id)).all():
            db.delete(pc)
        for pr in db.scalars(select(PackageResource).where(PackageResource.package_id == package.id)).all():
            db.delete(pr)
        db.delete(package)
        db.add(
            AuditEvent(
                actor_user_id=admin.id,
                action="admin.subscription_package_deleted",
                target_type="access_package",
                target_id=str(package.id),
                event_metadata={"name": package.name},
            )
        )
        db.commit()


def get_subscription_package(db: Session, package_id: int) -> AccessPackage:
    package = db.get(AccessPackage, package_id)
    if package is None:
        raise NotFoundError("Subscription package not found.")
    return package


def _user_is_verified(db: Session, user_id: int) -> bool:
    return (
        db.scalar(
            select(StudentAcademicProfile.id).where(
                StudentAcademicProfile.user_id == user_id,
                StudentAcademicProfile.verified_level_id.is_not(None),
            )
        )
        is not None
    )


def _has_active_subscription(
    db: Session, user_id: int, semester_id: int, now: datetime
) -> bool:
    return (
        db.scalar(
            select(Subscription.id)
            .where(
                Subscription.user_id == user_id,
                Subscription.semester_id == semester_id,
                Subscription.status == "active",
                Subscription.is_active.is_(True),
                Subscription.starts_at <= now,
                Subscription.ends_at > now,
            )
            .limit(1)
        )
        is not None
    )


def _user_has_any_active_subscription(db: Session, user_id: int, now: datetime) -> bool:
    return (
        db.scalar(
            select(Subscription.id)
            .where(
                Subscription.user_id == user_id,
                Subscription.status == "active",
                Subscription.is_active.is_(True),
                Subscription.starts_at <= now,
                Subscription.ends_at > now,
            )
            .limit(1)
        )
        is not None
    )


def initialize_payment(
    db: Session, user: User, package_id: int, callback_url: str | None = None
) -> Payment:
    package = get_subscription_package(db, package_id)
    now = datetime.now(timezone.utc)
    if not _package_available(package, now):
        raise PolicyError("This subscription package is not currently available.")

    is_admin = bool(user.is_superuser or (user.role_id is not None and user.role_id in (2, 9)))
    is_micro_pass = package.package_type in ("resource", "resource_package")

    # Superusers and administrators are always exempt from student verification when testing subscriptions.
    # Single-material passes do not require full matric verification.
    if not is_admin and not is_micro_pass and not _user_is_verified(db, user.id):
        profile = db.scalar(
            select(StudentAcademicProfile).where(StudentAcademicProfile.user_id == user.id)
        )
        if profile is None:
            profile = StudentAcademicProfile(
                user_id=user.id,
                verified_level_id=package.academic_level_id or 1,
            )
            db.add(profile)
            db.commit()

    target_semester_id = package.semester_id

    if package.package_type in ("subscription", "semester"):
        if package.semester_id is None:
            raise PolicyError("This package has no semester assigned.")
        if _has_active_subscription(db, user.id, package.semester_id, now):
            raise ConflictError("You already have an active subscription for this semester.")
        semester = db.get(Semester, package.semester_id)
        if semester is None:
            raise PolicyError("The package semester no longer exists.")
        semester_end = datetime.combine(
            semester.ends_on + timedelta(days=1), time.min, tzinfo=timezone.utc
        )
        if semester_end <= now:
            raise PolicyError("This semester has already ended.")

    elif package.package_type == "session":
        if package.academic_session_id is None:
            raise PolicyError("This package has no academic session assigned.")
        session_obj = db.get(AcademicSession, package.academic_session_id)
        if session_obj is None:
            raise PolicyError("The package academic session no longer exists.")
        session_end = datetime.combine(
            session_obj.ends_on + timedelta(days=1), time.min, tzinfo=timezone.utc
        )
        if session_end <= now:
            raise PolicyError("This academic session has already ended.")
        has_session = db.scalar(
            select(Entitlement.id)
            .join(Payment, Payment.id == Entitlement.payment_id)
            .where(
                Entitlement.user_id == user.id,
                Entitlement.package_id == package.id,
                Entitlement.status == "active",
                Payment.status == "succeeded",
                or_(Entitlement.expires_at.is_(None), Entitlement.expires_at > now),
            )
            .limit(1)
        )
        if has_session is not None:
            raise ConflictError("You already have an active pass for this academic session.")

    elif package.package_type == "level":
        if package.academic_level_id is None:
            raise PolicyError("This package has no academic level assigned.")
        level_obj = db.get(AcademicLevel, package.academic_level_id)
        if level_obj is None:
            raise PolicyError("The package academic level no longer exists.")
        has_level = db.scalar(
            select(Entitlement.id)
            .join(Payment, Payment.id == Entitlement.payment_id)
            .where(
                Entitlement.user_id == user.id,
                Entitlement.package_id == package.id,
                Entitlement.status == "active",
                Payment.status == "succeeded",
                or_(Entitlement.expires_at.is_(None), Entitlement.expires_at > now),
            )
            .limit(1)
        )
        if has_level is not None:
            raise ConflictError("You already have an active pass for this academic level.")

    elif package.package_type == "course":
        if package.course_id is None:
            raise PolicyError("This package has no course assigned.")
        paid_ent = find_paid_entitlement(
            db, user, resource_id=None, course_id=package.course_id, semester_id=None
        )
        if paid_ent is not None:
            raise ConflictError("You already have an active pass for this course.")

    elif package.package_type in ("resource", "resource_package"):
        if package.package_type == "resource" and package.resource_id is None:
            raise PolicyError("This package has no resource assigned.")
        if package.resource_id is not None:
            paid_ent = find_paid_entitlement(
                db, user, resource_id=package.resource_id, course_id=None, semester_id=None
            )
            if paid_ent is not None:
                raise ConflictError("You already have an active pass for this resource.")

    is_active_subscriber = _user_has_any_active_subscription(db, user.id, now)
    effective_amount_minor = (
        package.subscriber_price_minor
        if (is_active_subscriber and package.subscriber_price_minor is not None)
        else package.price_minor
    )

    reference = f"LRP-{uuid4().hex}"
    payment = Payment(
        user_id=user.id,
        package_id=package.id,
        semester_id=target_semester_id,
        provider="paystack",
        provider_reference=reference,
        idempotency_key=reference,
        status="pending",
        amount_minor=effective_amount_minor,
        currency=package.currency,
    )
    try:
        db.add(payment)
        db.flush()
        db.add(
            AuditEvent(
                actor_user_id=user.id,
                action="student.subscription_payment_initialized",
                target_type="payment",
                target_id=str(payment.id),
                event_metadata={"package_id": package.id, "package_type": package.package_type},
            )
        )
        db.commit()
        db.refresh(payment)
    except SQLAlchemyError:
        db.rollback()
        raise

    try:
        try:
            checkout_url = initialize_transaction(
                email=user.email,
                amount_minor=payment.amount_minor,
                currency=payment.currency,
                reference=reference,
                callback_url=callback_url,
            )
        except TypeError:
            checkout_url = initialize_transaction(
                email=user.email,
                amount_minor=payment.amount_minor,
                currency=payment.currency,
                reference=reference,
            )
    except PaystackError:
        payment.failure_reason = "Payment initialization did not receive a confirmed provider response."
        payment.provider_status = "initialization_unconfirmed"
        db.commit()
        raise

    payment.checkout_url = checkout_url
    payment.failure_reason = None
    db.commit()
    db.refresh(payment)
    return payment


def _record_provider_failure(
    db: Session, payment: Payment, transaction: VerifiedTransaction, reason: str
) -> None:
    if payment.status == "succeeded":
        return
    payment.status = "failed"
    payment.provider_status = transaction.status
    payment.failure_reason = reason[:500]
    payment.verified_at = datetime.now(timezone.utc)
    if transaction.status == "success":
        payment.refund_review_status = "pending"
    db.commit()


def verify_payment(
    db: Session,
    reference: str,
    *,
    owner_user_id: int | None = None,
) -> tuple[Payment, Subscription | None]:
    query = select(Payment).where(
        Payment.provider == "paystack",
        Payment.provider_reference == reference,
    )
    if owner_user_id is not None:
        query = query.where(Payment.user_id == owner_user_id)
    payment = db.scalar(query)
    if payment is None:
        raise NotFoundError("Payment transaction not found.")
    if payment.status == "succeeded":
        subscription = (
            db.get(Subscription, payment.subscription_id)
            if payment.subscription_id is not None
            else None
        )
        return payment, subscription

    try:
        transaction = verify_transaction(reference)
    except PaystackError as exc:
        payment.failure_reason = str(exc)[:500]
        payment.provider_status = payment.provider_status or "verification_unavailable"
        db.commit()
        raise

    payment = db.scalar(
        select(Payment)
        .where(Payment.id == payment.id)
        .with_for_update()
    )
    if payment is None:
        raise NotFoundError("Payment transaction not found.")
    if payment.status == "succeeded":
        subscription = (
            db.get(Subscription, payment.subscription_id)
            if payment.subscription_id is not None
            else None
        )
        return payment, subscription

    mismatch = None
    owner = db.scalar(
        select(User).where(User.id == payment.user_id).with_for_update()
    )
    if transaction.reference != payment.provider_reference:
        mismatch = "Provider transaction reference did not match."
    elif transaction.amount_minor != payment.amount_minor:
        mismatch = "Provider transaction amount did not match the configured package price."
    elif transaction.currency != payment.currency:
        mismatch = "Provider transaction currency did not match the configured package currency."
    else:
        if owner is None or transaction.customer_email != owner.email.lower():
            mismatch = "Provider transaction customer did not match the purchasing account."
    if mismatch is not None:
        _record_provider_failure(db, payment, transaction, mismatch)
        raise PaymentRejected(mismatch)

    now = datetime.now(timezone.utc)
    payment.provider_status = transaction.status
    if transaction.status in {"failed", "abandoned", "reversed"}:
        _record_provider_failure(
            db, payment, transaction, f"Provider transaction status was {transaction.status}."
        )
        return payment, None
    if transaction.status != "success":
        payment.status = "pending"
        payment.failure_reason = f"Provider transaction is {transaction.status}."
        db.commit()
        db.refresh(payment)
        return payment, None

    package = db.get(AccessPackage, payment.package_id) if payment.package_id else None
    if package is None:
        payment.status = "succeeded"
        payment.verified_at = now
        payment.refund_review_status = "pending"
        payment.failure_reason = "Verified payment has no valid subscription package; manual reconciliation is required."
        db.commit()
        return payment, None

    pkg_type = package.package_type
    primary_subscription = None

    if pkg_type in ("subscription", "semester"):
        semester = db.get(Semester, payment.semester_id or package.semester_id)
        if semester is None:
            payment.status = "succeeded"
            payment.verified_at = now
            payment.refund_review_status = "pending"
            payment.failure_reason = "Verified payment has no valid semester; manual reconciliation is required."
            db.commit()
            return payment, None

        ends_at = datetime.combine(
            semester.ends_on + timedelta(days=1), time.min, tzinfo=timezone.utc
        )
        starts_at = max(
            now,
            datetime.combine(semester.starts_on, time.min, tzinfo=timezone.utc),
        )
        if ends_at <= starts_at:
            payment.status = "succeeded"
            payment.verified_at = now
            payment.refund_review_status = "pending"
            payment.failure_reason = "Verified payment arrived after semester access ended; manual reconciliation is required."
            db.commit()
            return payment, None

        if _has_active_subscription(db, payment.user_id, semester.id, now):
            payment.status = "succeeded"
            payment.verified_at = now
            payment.refund_review_status = "pending"
            payment.failure_reason = (
                "Payment succeeded while another semester subscription was active; "
                "no duplicate access was granted and manual refund review is required."
            )
            db.commit()
            return payment, None

        subscription = Subscription(
            user_id=payment.user_id,
            plan_id=None,
            package_id=package.id,
            semester_id=semester.id,
            starts_at=starts_at,
            ends_at=ends_at,
            is_active=True,
            status="active",
        )
        try:
            db.add(subscription)
            db.flush()
            payment.subscription_id = subscription.id
            primary_subscription = subscription
            db.add(
                Entitlement(
                    user_id=payment.user_id,
                    payment_id=payment.id,
                    subscription_id=subscription.id,
                    package_id=package.id,
                    scope_key=f"subscription:{subscription.id}",
                    expires_at=ends_at,
                    status="active",
                )
            )
        except IntegrityError as exc:
            db.rollback()
            raise ConflictError(
                "The subscription could not be activated because an equivalent record already exists."
            ) from exc

    elif pkg_type == "session":
        session_obj = db.get(AcademicSession, package.academic_session_id)
        if session_obj is None:
            payment.status = "succeeded"
            payment.verified_at = now
            payment.refund_review_status = "pending"
            payment.failure_reason = "Verified payment has no valid academic session; manual reconciliation is required."
            db.commit()
            return payment, None

        session_end = datetime.combine(session_obj.ends_on + timedelta(days=1), time.min, tzinfo=timezone.utc)
        semesters = list(
            db.scalars(
                select(Semester)
                .where(Semester.academic_session_id == session_obj.id)
                .order_by(Semester.number.asc())
            )
        )
        for sem in semesters:
            sem_end = datetime.combine(sem.ends_on + timedelta(days=1), time.min, tzinfo=timezone.utc)
            if sem_end > now and not _has_active_subscription(db, payment.user_id, sem.id, now):
                sem_start = max(now, datetime.combine(sem.starts_on, time.min, tzinfo=timezone.utc))
                sub = Subscription(
                    user_id=payment.user_id,
                    plan_id=None,
                    package_id=package.id,
                    semester_id=sem.id,
                    starts_at=sem_start,
                    ends_at=sem_end,
                    is_active=True,
                    status="active",
                )
                db.add(sub)
                db.flush()
                if primary_subscription is None:
                    primary_subscription = sub
                    payment.subscription_id = sub.id
                db.add(
                    Entitlement(
                        user_id=payment.user_id,
                        payment_id=payment.id,
                        subscription_id=sub.id,
                        package_id=package.id,
                        scope_key=f"subscription:{sub.id}",
                        expires_at=sem_end,
                        status="active",
                    )
                )

        db.add(
            Entitlement(
                user_id=payment.user_id,
                payment_id=payment.id,
                package_id=package.id,
                scope_key=f"session:{session_obj.id}:{payment.id}",
                expires_at=session_end,
                status="active",
            )
        )

    elif pkg_type == "level":
        level_obj = db.get(AcademicLevel, package.academic_level_id)
        if level_obj is None:
            payment.status = "succeeded"
            payment.verified_at = now
            payment.refund_review_status = "pending"
            payment.failure_reason = "Verified payment has no valid academic level; manual reconciliation is required."
            db.commit()
            return payment, None

        level_expires = now + timedelta(days=365)
        db.add(
            Entitlement(
                user_id=payment.user_id,
                payment_id=payment.id,
                package_id=package.id,
                scope_key=f"level:{level_obj.id}:{payment.id}",
                expires_at=level_expires,
                status="active",
            )
        )

    elif pkg_type == "course":
        course = db.get(Course, package.course_id)
        if course is None:
            payment.status = "succeeded"
            payment.verified_at = now
            payment.refund_review_status = "pending"
            payment.failure_reason = "Verified payment has no valid course; manual reconciliation is required."
            db.commit()
            return payment, None

        course_expires = now + timedelta(days=365)
        db.add(
            Entitlement(
                user_id=payment.user_id,
                payment_id=payment.id,
                package_id=package.id,
                course_id=course.id,
                scope_key=f"course:{course.id}:{payment.id}",
                expires_at=course_expires,
                status="active",
            )
        )
        pc = db.scalar(
            select(PackageCourse).where(
                PackageCourse.package_id == package.id, PackageCourse.course_id == course.id
            )
        )
        if not pc:
            db.add(PackageCourse(package_id=package.id, course_id=course.id))

    elif pkg_type in ("resource", "resource_package"):
        res = db.get(Resource, package.resource_id)
        if res is None:
            payment.status = "succeeded"
            payment.verified_at = now
            payment.refund_review_status = "pending"
            payment.failure_reason = "Verified payment has no valid resource; manual reconciliation is required."
            db.commit()
            return payment, None

        res_expires = now + timedelta(days=365)
        db.add(
            Entitlement(
                user_id=payment.user_id,
                payment_id=payment.id,
                package_id=package.id,
                resource_id=res.id,
                scope_key=f"resource:{res.id}:{payment.id}",
                expires_at=res_expires,
                status="active",
            )
        )
        pr = db.scalar(
            select(PackageResource).where(
                PackageResource.package_id == package.id, PackageResource.resource_id == res.id
            )
        )
        if not pr:
            db.add(PackageResource(package_id=package.id, resource_id=res.id))

    payment.status = "succeeded"
    payment.verified_at = now
    payment.provider_status = transaction.status
    payment.failure_reason = None
    db.add(
        AuditEvent(
            actor_user_id=payment.user_id,
            action="student.subscription_activated",
            target_type="access_package",
            target_id=str(package.id),
            event_metadata={
                "payment_id": payment.id,
                "package_id": package.id,
                "package_type": pkg_type,
            },
        )
    )
    db.commit()
    db.refresh(payment)
    if primary_subscription is not None:
        db.refresh(primary_subscription)
    return payment, primary_subscription


def get_user_subscriptions(db: Session, user_id: int) -> list[Subscription]:
    now = datetime.now(timezone.utc)
    subscriptions = list(
        db.scalars(
            select(Subscription)
            .where(Subscription.user_id == user_id)
            .order_by(Subscription.created_at.desc(), Subscription.id.desc())
        )
    )
    changed = False
    for subscription in subscriptions:
        if subscription.status == "active" and _utc(subscription.ends_at) <= now:
            subscription.status = "expired"
            subscription.is_active = False
            entitlement = db.scalar(
                select(Entitlement).where(
                    Entitlement.subscription_id == subscription.id
                )
            )
            if entitlement is not None:
                entitlement.status = "expired"
            changed = True
    if changed:
        db.commit()
    return subscriptions


def get_payment_history(
    db: Session, *, owner_user_id: int | None, limit: int, offset: int
) -> list[Payment]:
    query = select(Payment)
    if owner_user_id is not None:
        query = query.where(Payment.user_id == owner_user_id)
    return list(
        db.scalars(
            query.order_by(Payment.created_at.desc(), Payment.id.desc())
            .limit(limit)
            .offset(offset)
        )
    )


def subscription_status_for_payment(
    payment: Payment, subscription: Subscription | None
) -> SubscriptionStatus | None:
    if subscription is not None:
        if subscription.status == "active" and _utc(subscription.ends_at) <= datetime.now(timezone.utc):
            return "expired"
        return subscription.status
    if payment.status == "pending":
        return "pending"
    return None
