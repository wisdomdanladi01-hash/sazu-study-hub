from datetime import datetime, timedelta, timezone
from hashlib import sha256
from pathlib import Path

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.private_storage import (
    delete_private_storage_key,
    resolve_private_storage_key,
    store_verification_document,
)
from app.models.academic import (
    AcademicLevel,
    AcademicSession,
    Department,
    Programme,
    StudentAcademicProfile,
)
from app.models.audit import AuditEvent
from app.models.identity import VerificationDocument, VerificationSubmission
from app.models.user import User
from app.schemas.auth import StudentRegistration
from app.schemas.verification import VerificationDecision, VerificationSubmissionCreate
from app.services.errors import ConflictError, NotFoundError, PolicyError


def _clean_identifier(value: str | None) -> str | None:
    normalized = value.strip().upper() if value else None
    return normalized or None


def _validate_academic_references(
    db: Session,
    programme_id: int | None,
    department_id: int | None,
    session_id: int | None,
    claimed_level_id: int | None,
) -> None:
    if programme_id is not None and db.get(Programme, programme_id) is None:
        raise PolicyError("The selected programme does not exist.")
    if department_id is not None:
        department = db.get(Department, department_id)
        programme = db.get(Programme, programme_id) if programme_id is not None else None
        if department is None or (
            programme is not None
            and (
                department.programme_id not in (None, programme_id)
                or (
                    department.faculty_id is not None
                    and programme.faculty_id is not None
                    and department.faculty_id != programme.faculty_id
                )
            )
        ):
            raise PolicyError("The selected department does not belong to that programme.")
    if session_id is not None and db.get(AcademicSession, session_id) is None:
        raise PolicyError("The selected admission session does not exist.")
    if claimed_level_id is not None and db.get(AcademicLevel, claimed_level_id) is None:
        raise PolicyError("The selected academic level does not exist.")


def _check_identity_conflict(
    db: Session,
    user_id: int | None,
    jamb_number: str | None,
    matriculation_number: str | None,
) -> None:
    conditions = []
    if jamb_number:
        conditions.append(StudentAcademicProfile.jamb_registration_number == jamb_number)
    if matriculation_number:
        conditions.append(StudentAcademicProfile.matriculation_number == matriculation_number)
    if not conditions:
        raise PolicyError("Provide a JAMB registration number or matriculation number.")

    query = select(StudentAcademicProfile.id).where(or_(*conditions))
    if user_id is not None:
        query = query.where(StudentAcademicProfile.user_id != user_id)
    if db.scalar(query) is not None:
        raise ConflictError("The student identifier is already associated with another account.")


def register_student(db: Session, data: StudentRegistration) -> tuple[User, VerificationSubmission | None]:
    email = str(data.email).strip().lower()
    jamb_number = _clean_identifier(data.jamb_registration_number)
    matric_number = _clean_identifier(data.matriculation_number)

    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise ConflictError("An account already exists for this email address.")
    if data.programme_id or data.department_id or data.admission_session_id or data.claimed_level_id:
        _validate_academic_references(
            db,
            data.programme_id,
            data.department_id,
            data.admission_session_id,
            data.claimed_level_id,
        )
    if jamb_number or matric_number:
        _check_identity_conflict(db, None, jamb_number, matric_number)

    from app.core.security import hash_password

    user = User(email=email, full_name=data.full_name.strip(), password_hash=hash_password(data.password))
    try:
        db.add(user)
        db.flush()

        profile = None
        submission = None
        if jamb_number or matric_number:
            profile = StudentAcademicProfile(
                user_id=user.id,
                jamb_registration_number=jamb_number,
                matriculation_number=matric_number,
                programme_id=data.programme_id,
                department_id=data.department_id,
                admission_session_id=data.admission_session_id,
            )
            submission = VerificationSubmission(
                user_id=user.id,
                status="pending",
                verification_method="manual",
                jamb_registration_number=jamb_number,
                matriculation_number=matric_number,
                programme_id=data.programme_id,
                department_id=data.department_id,
                admission_session_id=data.admission_session_id,
                claimed_level_id=data.claimed_level_id,
            )
            db.add_all([profile, submission])
            db.flush()
            db.add(
                AuditEvent(
                    actor_user_id=user.id,
                    action="student.verification_submitted",
                    target_type="verification_submission",
                    target_id=str(submission.id),
                    event_metadata={"status": "pending", "verification_method": "manual"},
                )
            )
        db.commit()
        db.refresh(user)
        if submission is not None:
            db.refresh(submission)
        return user, submission
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("The account or student identifier conflicts with an existing record.") from exc


def submit_verification(
    db: Session,
    user: User,
    data: VerificationSubmissionCreate,
) -> VerificationSubmission:
    jamb_number = _clean_identifier(data.jamb_registration_number)
    matric_number = _clean_identifier(data.matriculation_number)
    if not jamb_number and not matric_number:
        raise PolicyError("Provide a JAMB registration number or matriculation number.")

    _validate_academic_references(
        db,
        data.programme_id,
        data.department_id,
        data.admission_session_id,
        data.claimed_level_id,
    )
    _check_identity_conflict(db, user.id, jamb_number, matric_number)

    profile = db.scalar(
        select(StudentAcademicProfile).where(StudentAcademicProfile.user_id == user.id)
    )
    if profile is None:
        profile = StudentAcademicProfile(
            user_id=user.id,
            jamb_registration_number=jamb_number,
            matriculation_number=matric_number,
            programme_id=data.programme_id,
            department_id=data.department_id,
            admission_session_id=data.admission_session_id,
        )
        db.add(profile)
    else:
        if jamb_number:
            profile.jamb_registration_number = jamb_number
        if matric_number:
            profile.matriculation_number = matric_number
        if data.programme_id:
            profile.programme_id = data.programme_id
        if data.department_id:
            profile.department_id = data.department_id
        if data.admission_session_id:
            profile.admission_session_id = data.admission_session_id

    submission = VerificationSubmission(
        user_id=user.id,
        status="pending",
        verification_method="manual",
        jamb_registration_number=jamb_number,
        matriculation_number=matric_number,
        programme_id=data.programme_id,
        department_id=data.department_id,
        admission_session_id=data.admission_session_id,
        claimed_level_id=data.claimed_level_id,
    )
    db.add(submission)
    db.flush()
    db.add(
        AuditEvent(
            actor_user_id=user.id,
            action="student.verification_submitted",
            target_type="verification_submission",
            target_id=str(submission.id),
            event_metadata={"status": "pending", "verification_method": "manual"},
        )
    )
    db.commit()
    db.refresh(submission)
    return submission


def review_verification(
    db: Session,
    reviewer: User,
    submission_id: int,
    decision: VerificationDecision,
) -> VerificationSubmission:
    submission = db.scalar(
        select(VerificationSubmission)
        .where(VerificationSubmission.id == submission_id)
        .with_for_update()
    )
    if submission is None:
        raise NotFoundError("Verification submission not found.")
    if submission.user_id == reviewer.id:
        raise PolicyError("Administrators cannot review their own verification submission.")
    if submission.status not in {"pending", "needs_review"}:
        raise PolicyError("This verification submission has already received a final decision.")
    if decision.decision == "verified":
        if decision.verified_level_id is None or decision.verified_session_id is None:
            raise PolicyError("Approval requires a verified level and academic session.")
        if db.get(AcademicLevel, decision.verified_level_id) is None:
            raise PolicyError("The verified academic level does not exist.")
        if db.get(AcademicSession, decision.verified_session_id) is None:
            raise PolicyError("The verified academic session does not exist.")
    elif decision.decision in {"rejected", "needs_review"} and not decision.reason:
        raise PolicyError("A reason is required for rejection or additional review.")

    now = datetime.now(timezone.utc)
    submission.status = decision.decision
    submission.reviewed_by_id = reviewer.id
    submission.reviewed_at = now
    submission.decision_reason = decision.reason

    if decision.decision == "verified":
        _check_identity_conflict(
            db,
            submission.user_id,
            submission.jamb_registration_number,
            submission.matriculation_number,
        )
        profile = db.scalar(
            select(StudentAcademicProfile).where(
                StudentAcademicProfile.user_id == submission.user_id
            )
        )
        if profile is None:
            profile = StudentAcademicProfile(
                user_id=submission.user_id,
                jamb_registration_number=_clean_identifier(submission.jamb_registration_number),
                matriculation_number=_clean_identifier(submission.matriculation_number),
            )
            db.add(profile)
            db.flush()
        profile.jamb_registration_number = _clean_identifier(submission.jamb_registration_number)
        profile.matriculation_number = _clean_identifier(submission.matriculation_number)
        profile.programme_id = submission.programme_id
        profile.department_id = submission.department_id
        profile.admission_session_id = submission.admission_session_id
        profile.verified_level_id = decision.verified_level_id
        profile.verified_session_id = decision.verified_session_id
        profile.updated_at = now

    if decision.decision in {"verified", "rejected"}:
        documents = db.scalars(
            select(VerificationDocument).where(
                VerificationDocument.submission_id == submission.id,
                VerificationDocument.deleted_at.is_(None),
            )
        )
        retention_until = now + timedelta(
            days=settings.verification_document_retention_days
        )
        for document in documents:
            document.retention_until = retention_until

    db.add(
        AuditEvent(
            actor_user_id=reviewer.id,
            action=f"admin.verification_{decision.decision}",
            target_type="verification_submission",
            target_id=str(submission.id),
            reason=decision.reason,
            event_metadata={"status": decision.decision},
        )
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("The identity conflicts with another student record.") from exc
    db.refresh(submission)
    return submission


def get_verification_state(db: Session, user_id: int) -> tuple[str, int | None, int | None]:
    profile = db.scalar(
        select(StudentAcademicProfile).where(StudentAcademicProfile.user_id == user_id)
    )
    latest = db.scalar(
        select(VerificationSubmission)
        .where(VerificationSubmission.user_id == user_id)
        .order_by(VerificationSubmission.created_at.desc(), VerificationSubmission.id.desc())
        .limit(1)
    )
    status = latest.status if latest is not None else "not_submitted"
    return (
        status,
        profile.verified_level_id if profile else None,
        profile.verified_session_id if profile else None,
    )


def list_pending_verifications(db: Session) -> list[VerificationSubmission]:
    return list(
        db.scalars(
            select(VerificationSubmission)
            .where(VerificationSubmission.status.in_(("pending", "needs_review")))
            .order_by(VerificationSubmission.created_at.asc(), VerificationSubmission.id.asc())
        )
    )


def list_verification_documents(
    db: Session, submission_id: int
) -> list[VerificationDocument]:
    if db.get(VerificationSubmission, submission_id) is None:
        raise NotFoundError("Verification submission not found.")
    now = datetime.now(timezone.utc)
    return list(
        db.scalars(
            select(VerificationDocument)
            .where(
                VerificationDocument.submission_id == submission_id,
                VerificationDocument.deleted_at.is_(None),
                or_(
                    VerificationDocument.retention_until.is_(None),
                    VerificationDocument.retention_until > now,
                ),
            )
            .order_by(VerificationDocument.created_at.asc(), VerificationDocument.id.asc())
        )
    )


def record_verification_document(
    db: Session,
    user: User,
    submission_id: int,
    original_filename: str,
    content_type: str | None,
    content: bytes,
) -> VerificationDocument:
    submission = db.get(VerificationSubmission, submission_id)
    if submission is None or submission.user_id != user.id:
        raise NotFoundError("Verification submission not found.")
    if submission.status not in {"pending", "needs_review"}:
        raise PolicyError("Documents can only be added to an open verification submission.")

    storage_key, detected_type = store_verification_document(content, content_type)
    document = VerificationDocument(
        submission_id=submission.id,
        storage_key=storage_key,
        original_filename=Path(original_filename).name[:255],
        mime_type=detected_type,
        size_bytes=len(content),
        content_sha256=sha256(content).hexdigest(),
    )
    try:
        db.add(document)
        db.flush()
        db.add(
            AuditEvent(
                actor_user_id=user.id,
                action="student.verification_document_uploaded",
                target_type="verification_submission",
                target_id=str(submission.id),
                event_metadata={"document_id": str(document.id)},
            )
        )
        db.commit()
        db.refresh(document)
        return document
    except SQLAlchemyError:
        db.rollback()
        delete_private_storage_key(storage_key)
        raise


def get_authorized_verification_document(
    db: Session,
    requester: User,
    document_id: int,
    requester_is_admin: bool,
) -> tuple[VerificationDocument, Path]:
    document = db.get(VerificationDocument, document_id)
    if document is None or document.deleted_at is not None:
        raise NotFoundError("Verification document not found.")
    submission = db.get(VerificationSubmission, document.submission_id)
    if submission is None or (
        submission.user_id != requester.id and not requester_is_admin
    ):
        raise NotFoundError("Verification document not found.")
    if document.retention_until is not None and document.retention_until <= datetime.now(timezone.utc):
        raise NotFoundError("Verification document not found.")
    path = resolve_private_storage_key(document.storage_key)
    if not path.is_file():
        raise NotFoundError("Verification document not found.")
    return document, path


def audit_verification_document_access(
    db: Session,
    requester: User,
    document: VerificationDocument,
    requester_is_admin: bool,
) -> None:
    db.add(
        AuditEvent(
            actor_user_id=requester.id,
            action="security.verification_document_accessed",
            target_type="verification_document",
            target_id=str(document.id),
            event_metadata={
                "submission_id": str(document.submission_id),
                "requester_is_admin": requester_is_admin,
            },
        )
    )
    db.commit()


def purge_expired_verification_documents(
    db: Session, now: datetime | None = None
) -> int:
    current_time = now or datetime.now(timezone.utc)
    documents = list(
        db.scalars(
            select(VerificationDocument).where(
                VerificationDocument.deleted_at.is_(None),
                VerificationDocument.retention_until <= current_time,
            )
        )
    )
    for document in documents:
        path = resolve_private_storage_key(document.storage_key)
        if path.exists():
            delete_private_storage_key(document.storage_key)
        document.deleted_at = current_time
        db.add(
            AuditEvent(
                actor_user_id=None,
                action="system.verification_document_deleted",
                target_type="verification_document",
                target_id=str(document.id),
                event_metadata={"retention_expired": True},
            )
        )
    db.commit()
    return len(documents)
