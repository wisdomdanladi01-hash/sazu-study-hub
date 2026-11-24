from datetime import datetime, timezone
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.database import get_db
from app.models.academic import (
    AcademicLevel,
    AcademicSession,
    Course,
    CourseOffering,
    CurriculumVersion,
    Department,
    Faculty,
    Institution,
    Programme,
    ResourceType,
    Semester,
    StudentAcademicProfile,
)
from app.models.commerce import AccessPackage, Payment
from app.models.identity import VerificationSubmission
from app.models.resource import Resource, ResourceCategory
from app.models.subscription import Subscription, SubscriptionPlan
from app.models.user import User
from app.services.errors import ConflictError, NotFoundError, PolicyError
from app.services.resources import compute_courses_material_coverage
from app.services.payments import (
    PaymentRejected,
    get_payment_history,
    get_user_subscriptions,
    initialize_payment,
    list_subscription_packages,
    subscription_status_for_payment,
    verify_payment,
)
from app.services.paystack import PaystackError, PaystackNotConfigured

router = APIRouter(tags=["student portal"])


class PaymentInitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    package_id: int = Field(gt=0)


class PaymentVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reference: str | None = Field(default=None, max_length=200)
    payment_id: int | None = Field(default=None, gt=0)


@router.get(
    "/subscriptions/plans",
    response_model=dict[str, Any],
    deprecated=True,
)
def list_subscription_plans(
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    packages = list_subscription_packages(db)
    return {
        "items": [
            {
                "id": package.id,
                "name": package.name,
                "description": package.description,
                "package_type": package.package_type,
                "price_minor": package.price_minor,
                "currency": package.currency,
                "duration_days": max(
                    (
                        semester.ends_on
                        - max(semester.starts_on, datetime.now(timezone.utc).date())
                    ).days,
                    0,
                ),
            }
            for package, semester in packages
        ],
        "total": len(packages),
    }


def _resource_is_available(resource: Resource) -> bool:
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)

    def utc(value):
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)

    return (
        resource.is_published
        and (resource.available_from is None or utc(resource.available_from) <= now)
        and (resource.available_until is None or utc(resource.available_until) > now)
    )


def _public_resource_data(db: Session, resource: Resource) -> dict[str, Any]:
    category = db.get(ResourceCategory, resource.category_id) if resource.category_id is not None else None
    resource_type = (
        db.get(ResourceType, resource.resource_type_id)
        if resource.resource_type_id is not None
        else None
    )
    course = db.get(Course, resource.course_id) if resource.course_id is not None else None
    department = (
        db.get(Department, course.department_id)
        if course is not None and course.department_id is not None
        else None
    )
    programme = (
        db.get(Programme, course.programme_id)
        if course is not None and course.programme_id is not None
        else None
    )
    level = (
        db.get(AcademicLevel, resource.academic_level_id)
        if resource.academic_level_id is not None
        else None
    )
    semester = db.get(Semester, resource.semester_id) if resource.semester_id else None
    academic_session = (
        db.get(AcademicSession, resource.academic_session_id)
        if resource.academic_session_id
        else None
    )
    return {
        "id": resource.id,
        "title": resource.title,
        "description": resource.description,
        "file_name": resource.file_name,
        "mime_type": resource.mime_type,
        "file_size_bytes": resource.file_size_bytes,
        "category": {"id": category.id, "name": category.name} if category else None,
        "resource_type": (
            {"id": resource_type.id, "name": resource_type.name}
            if resource_type
            else None
        ),
        "course": (
            {
                "id": course.id,
                "title": course.title,
                "code": course.code,
                "department": (
                    {"id": department.id, "name": department.name}
                    if department
                    else None
                ),
                "programme": (
                    {"id": programme.id, "name": programme.name}
                    if programme
                    else None
                ),
            }
            if course
            else None
        ),
        "academic_level": (
            {"id": level.id, "code": level.code, "name": level.name}
            if level
            else None
        ),
        "academic_session": (
            {"id": academic_session.id, "name": academic_session.name}
            if academic_session
            else None
        ),
        "semester": (
            {"id": semester.id, "number": semester.number} if semester else None
        ),
        "access_policy": resource.access_policy,
        "is_restricted": resource.access_policy != "public",
        "preview_allowed": resource.access_policy == "public" or getattr(resource, "preview_policy", "none") in ("public_sample", "authenticated_only"),
        "preview_policy": getattr(resource, "preview_policy", "none"),
        # Members-only excerpts must not appear in the anonymous catalogue.
        "preview_content": (
            getattr(resource, "preview_content", None)
            if resource.access_policy == "public" or getattr(resource, "preview_policy", "none") == "public_sample"
            else None
        ),
        "requires_verification": resource.requires_verification,
        "is_available": True,
        "created_at": resource.created_at.isoformat(),
        "updated_at": resource.updated_at.isoformat(),
    }


@router.get("/resources")
def list_resources(
    search: str | None = Query(default=None, max_length=200),
    resource_type: str | None = Query(default=None, max_length=80),
    category_id: int | None = Query(default=None, gt=0),
    course_id: int | None = Query(default=None, gt=0),
    department_id: int | None = Query(default=None, gt=0),
    academic_level_id: int | None = Query(default=None, gt=0),
    semester_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    query = select(Resource).where(Resource.is_published.is_(True))
    if search and search.strip():
        raw_s = search.strip()
        spaceless_s = re.sub(r"\s+", "", raw_s)
        spaced_s = re.sub(r"([a-zA-Z]+)(\d+)", r"\1 \2", raw_s)
        tokens = [t for t in re.split(r"[\s\-_]+", raw_s) if t]

        search_terms = {raw_s, spaceless_s, spaced_s}

        conds = []
        for term in search_terms:
            t_pat = f"%{term}%"
            matching_course = select(Course.id).where(
                Course.id == Resource.course_id,
                Course.code.ilike(t_pat) | Course.title.ilike(t_pat),
            )
            conds.append(
                Resource.title.ilike(t_pat)
                | Resource.description.ilike(t_pat)
                | Resource.file_name.ilike(t_pat)
                | matching_course.exists()
            )

        if len(tokens) > 1:
            token_and_clauses = []
            for tok in tokens:
                tok_pat = f"%{tok}%"
                tok_course = select(Course.id).where(
                    Course.id == Resource.course_id,
                    Course.code.ilike(tok_pat) | Course.title.ilike(tok_pat),
                )
                token_and_clauses.append(
                    Resource.title.ilike(tok_pat)
                    | Resource.description.ilike(tok_pat)
                    | Resource.file_name.ilike(tok_pat)
                    | tok_course.exists()
                )
            query = query.where(or_(*conds) | and_(*token_and_clauses))
        else:
            query = query.where(or_(*conds))
    if resource_type:
        query = query.join(ResourceType, Resource.resource_type_id == ResourceType.id).where(
            ResourceType.name.ilike(f"%{resource_type.strip()}%")
        )
    if category_id is not None:
        query = query.where(Resource.category_id == category_id)
    if course_id is not None:
        query = query.where(Resource.course_id == course_id)
    if department_id is not None:
        query = query.join(Course, Resource.course_id == Course.id).where(
            Course.department_id == department_id
        )
    if academic_level_id is not None:
        query = query.where(Resource.academic_level_id == academic_level_id)
    if semester_id is not None:
        query = query.where(Resource.semester_id == semester_id)
    resources = db.scalars(
        query.order_by(Resource.updated_at.desc(), Resource.id.desc())
    ).all()
    rows = []
    for resource in resources:
        if not _resource_is_available(resource):
            continue
        rows.append(_public_resource_data(db, resource))
    return {"items": rows, "total": len(rows)}


@router.get("/resources/catalogue/{resource_id}")
def public_resource_detail(
    resource_id: int,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    resource = db.get(Resource, resource_id)
    if resource is None or not _resource_is_available(resource):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found.")
    return _public_resource_data(db, resource)


@router.get("/academic/catalogue")
def academic_catalogue(db: Session = Depends(get_db)) -> dict[str, Any]:
    programmes = db.scalars(
        select(Programme).where(Programme.is_active.is_(True)).order_by(Programme.name.asc())
    ).all()
    departments = db.scalars(
        select(Department).where(Department.is_active.is_(True)).order_by(Department.name.asc())
    ).all()
    levels = db.scalars(
        select(AcademicLevel).order_by(AcademicLevel.sort_order.asc())
    ).all()
    semesters = db.scalars(
        select(Semester).order_by(Semester.academic_session_id.desc(), Semester.number.asc())
    ).all()
    resource_types = db.scalars(
        select(ResourceType).where(ResourceType.is_active.is_(True)).order_by(ResourceType.name.asc())
    ).all()
    courses = db.scalars(
        select(Course).where(Course.is_active.is_(True)).order_by(Course.code.asc())
    ).all()
    offerings = db.scalars(
        select(CourseOffering)
        .join(CurriculumVersion, CourseOffering.curriculum_version_id == CurriculumVersion.id)
        .where(CourseOffering.is_active.is_(True))
        .order_by(CourseOffering.id.asc())
    ).all()
    curricula = db.scalars(select(CurriculumVersion)).all()
    institutions = db.scalars(
        select(Institution).where(Institution.is_active.is_(True)).order_by(Institution.name.asc())
    ).all()
    faculties = db.scalars(
        select(Faculty).where(Faculty.is_active.is_(True)).order_by(Faculty.name.asc())
    ).all()
    sessions = db.scalars(
        select(AcademicSession).order_by(AcademicSession.starts_on.asc())
    ).all()
    curriculum_by_id = {curriculum.id: curriculum for curriculum in curricula}
    session_by_id = {session.id: session for session in sessions}
    level_by_id = {level.id: level for level in levels}
    semester_by_id = {semester.id: semester for semester in semesters}
    coverage_by_course = compute_courses_material_coverage(db)

    departments_by_programme: dict[int, list[dict[str, Any]]] = {}
    for department in departments:
        if department.programme_id is not None:
            departments_by_programme.setdefault(department.programme_id, []).append(
                {
                    "id": department.id,
                    "code": department.code,
                    "name": department.name,
                    "programme_id": department.programme_id,
                    "faculty_id": department.faculty_id,
                    "status": department.status,
                }
            )
    offerings_by_course: dict[int, list[dict[str, Any]]] = {}
    for offering in offerings:
        curriculum = curriculum_by_id.get(offering.curriculum_version_id)
        if curriculum is None:
            continue
        session = session_by_id.get(curriculum.academic_session_id)
        level = level_by_id.get(offering.academic_level_id)
        semester = semester_by_id.get(offering.semester_id)
        offerings_by_course.setdefault(offering.course_id, []).append(
            {
                "id": offering.id,
                "curriculum_version_id": curriculum.id,
                "curriculum_version": curriculum.version,
                "academic_session_id": curriculum.academic_session_id,
                "academic_session": session.name if session else None,
                "academic_level_id": offering.academic_level_id,
                "level": level.code if level else None,
                "semester_id": offering.semester_id,
                "semester": semester.number if semester else None,
                "credit_units": offering.credit_units,
                "course_type": offering.course_type,
                "verification_status": offering.verification_status,
                "source_note": offering.source_note,
            }
        )

    return {
        "institutions": [
            {"id": institution.id, "code": institution.code, "name": institution.name,
             "location": institution.location}
            for institution in institutions
        ],
        "faculties": [
            {"id": faculty.id, "code": faculty.code, "name": faculty.name,
             "institution_id": faculty.institution_id}
            for faculty in faculties
        ],
        "departments": [
            {
                "id": department.id,
                "code": department.code,
                "name": department.name,
                "programme_id": department.programme_id,
                "faculty_id": department.faculty_id,
                "status": department.status,
                "source_note": department.source_note,
            }
            for department in departments
        ],
        "programmes": [
            {
                "id": programme.id,
                "code": programme.code,
                "name": programme.name,
                "faculty_id": programme.faculty_id,
                "award": programme.award,
                "study_level": programme.study_level,
                "status": programme.status,
                "commencement_session_id": programme.commencement_session_id,
                "source_note": programme.source_note,
                "departments": departments_by_programme.get(programme.id, []),
            }
            for programme in programmes
        ],
        "levels": [
            {
                "id": level.id,
                "code": level.code,
                "name": level.name,
                "sort_order": level.sort_order,
            }
            for level in levels
        ],
        "semesters": [
            {
                "id": semester.id,
                "number": semester.number,
                "academic_session_id": semester.academic_session_id,
            }
            for semester in semesters
        ],
        "resource_types": [
            {"id": resource_type.id, "name": resource_type.name}
            for resource_type in resource_types
        ],
        "courses": [
            {
                "id": course.id,
                "code": course.code,
                "title": course.title,
                "programme_id": course.programme_id,
                "department_id": course.department_id,
                "academic_level_id": course.academic_level_id,
                "verification_status": course.verification_status,
                "source_note": course.source_note,
                "coverage": coverage_by_course.get(course.id),
                "offerings": offerings_by_course.get(course.id, []),
            }
            for course in courses
        ],
        "sessions": [
            {
                "id": academic_session.id,
                "name": academic_session.name,
                "starts_on": academic_session.starts_on.isoformat(),
                "ends_on": academic_session.ends_on.isoformat(),
                "is_active": academic_session.is_active,
            }
            for academic_session in sessions
        ],
    }


@router.get("/dashboard")
def student_dashboard(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    subscriptions = get_user_subscriptions(db, user.id)
    latest_subscription = subscriptions[0] if subscriptions else None
    package = (
        db.get(AccessPackage, latest_subscription.package_id)
        if latest_subscription is not None and latest_subscription.package_id is not None
        else None
    )
    plan = (
        db.get(SubscriptionPlan, latest_subscription.plan_id)
        if latest_subscription is not None and latest_subscription.plan_id is not None
        else None
    )
    latest_verification = db.scalar(
        select(VerificationSubmission)
        .where(VerificationSubmission.user_id == user.id)
        .order_by(VerificationSubmission.created_at.desc(), VerificationSubmission.id.desc())
        .limit(1)
    )
    academic_profile = db.scalar(
        select(StudentAcademicProfile).where(StudentAcademicProfile.user_id == user.id)
    )
    recent_payment = db.scalar(
        select(Payment)
        .where(Payment.user_id == user.id)
        .order_by(Payment.created_at.desc(), Payment.id.desc())
        .limit(1)
    )
    plan_summary = None
    if package is not None:
        plan_summary = {
            "id": package.id,
            "name": package.name,
            "currency": package.currency,
            "price_minor": package.price_minor,
        }
    elif plan is not None:
        plan_summary = {
            "id": plan.id,
            "name": plan.name,
            "currency": plan.currency,
            "price_minor": plan.price_minor,
        }

    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "nickname": user.nickname,
            "avatar_url": user.avatar_url,
            "is_active": user.is_active,
            "email_verified": user.email_verified,
        },
        "academic_profile": (
            {
                "id": academic_profile.id,
                "jamb_registration_number": academic_profile.jamb_registration_number,
                "matriculation_number": academic_profile.matriculation_number,
                "programme_id": academic_profile.programme_id,
                "department_id": academic_profile.department_id,
                "admission_session_id": academic_profile.admission_session_id,
                "verified_level_id": academic_profile.verified_level_id,
                "verified_session_id": academic_profile.verified_session_id,
            }
            if academic_profile
            else None
        ),
        "verification": {
            "status": latest_verification.status if latest_verification else "not_submitted",
            "submitted_at": (
                latest_verification.created_at.isoformat() if latest_verification else None
            ),
            "decision_reason": (
                latest_verification.decision_reason if latest_verification else None
            ),
        },
        "subscription": (
            {
                "id": latest_subscription.id,
                "status": latest_subscription.status,
                "starts_at": latest_subscription.starts_at.isoformat(),
                "ends_at": latest_subscription.ends_at.isoformat(),
                "is_active": latest_subscription.is_active,
                "plan": plan_summary,
            }
            if latest_subscription
            else None
        ),
        "payment_summary": {
            "latest_status": recent_payment.status if recent_payment else None,
            "latest_amount_minor": recent_payment.amount_minor if recent_payment else None,
            "latest_currency": recent_payment.currency if recent_payment else None,
        },
        "resources": {"items": [], "total": 0},
    }


@router.get("/payments/history")
def payment_history(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    payments = get_payment_history(
        db, owner_user_id=user.id, limit=100, offset=0
    )
    rows = []
    for payment in payments:
        package = db.get(AccessPackage, payment.package_id) if payment.package_id else None
        rows.append(
            {
                "id": payment.id,
                "status": payment.status,
                "provider": payment.provider,
                "provider_reference": payment.provider_reference,
                "amount_minor": payment.amount_minor,
                "currency": payment.currency,
                "verified_at": (
                    payment.verified_at.isoformat() if payment.verified_at else None
                ),
                "created_at": payment.created_at.isoformat(),
                "package": {"id": package.id, "name": package.name} if package else None,
            }
        )
    return {"items": rows, "total": len(rows)}


@router.post("/payments/initiate", status_code=status.HTTP_201_CREATED)
def initiate_payment(
    data: PaymentInitRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        payment = initialize_payment(db, user, data.package_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except PolicyError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except PaystackNotConfigured as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    except PaystackError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    if payment.checkout_url is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The payment provider did not return checkout information.",
        )
    return {
        "payment_id": payment.id,
        "reference": payment.provider_reference,
        "checkout_url": payment.checkout_url,
        "status": payment.status,
        "currency": payment.currency,
        "amount_minor": payment.amount_minor,
    }


@router.post("/payments/verify")
def verify_frontend_payment(
    data: PaymentVerifyRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    reference = data.reference
    if reference is None and data.payment_id is not None:
        payment = db.scalar(
            select(Payment).where(
                Payment.id == data.payment_id,
                Payment.user_id == user.id,
                Payment.provider == "paystack",
            )
        )
        if payment is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Payment transaction not found.",
            )
        reference = payment.provider_reference
    if not reference:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reference or payment_id is required.",
        )
    try:
        payment, subscription = verify_payment(
            db, reference, owner_user_id=user.id
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PaymentRejected as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except PaystackNotConfigured as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    except PaystackError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return {
        "status": payment.status,
        "reference": payment.provider_reference,
        "subscription_status": subscription_status_for_payment(payment, subscription),
        "message": (
            "Payment verified successfully."
            if payment.status == "succeeded"
            else payment.failure_reason or "Payment is still pending backend confirmation."
        ),
    }
