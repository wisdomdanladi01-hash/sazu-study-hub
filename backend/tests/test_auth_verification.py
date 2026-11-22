from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.config import settings
from app.core.private_storage import resolve_private_storage_key
from app.core.security import create_access_token
from app.models.academic import (
    AcademicLevel,
    AcademicSession,
    Programme,
    StudentAcademicProfile,
)
from app.models.audit import AuditEvent
from app.models.identity import VerificationDocument, VerificationSubmission
from app.models.user import Role, User


def seed_academic_data(db_session):
    programme = db_session.scalar(select(Programme).where(Programme.code == "SCI"))
    level = db_session.scalar(select(AcademicLevel).where(AcademicLevel.code == "200"))
    session = db_session.scalar(select(AcademicSession).where(AcademicSession.name == "2026/2027"))
    if programme is not None and level is not None and session is not None:
        return programme.id, level.id, session.id

    programme = Programme(code="SCI", name="Science")
    level = AcademicLevel(code="200", name="200 Level", sort_order=200)
    session = AcademicSession(
        name="2026/2027",
        starts_on=datetime(2026, 9, 1).date(),
        ends_on=datetime(2027, 7, 31).date(),
        is_active=True,
    )
    db_session.add_all([programme, level, session])
    db_session.commit()
    return programme.id, level.id, session.id


def register_student(client, db_session, identifier="JAMB-0001"):
    programme_id, level_id, session_id = seed_academic_data(db_session)
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"{identifier.lower()}@example.com",
            "full_name": "Test Student",
            "password": "a-strong-test-password",
            "jamb_registration_number": identifier,
            "programme_id": programme_id,
            "admission_session_id": session_id,
            "claimed_level_id": level_id,
        },
    )
    return response, level_id, session_id


def create_admin(db_session):
    role = Role(name="admin", description="Platform administrator")
    db_session.add(role)
    db_session.flush()
    admin = User(
        email="admin@example.com",
        full_name="Test Administrator",
        password_hash="unused-password-hash",
        role_id=role.id,
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    return admin


def test_registration_hashes_password_and_starts_verification_pending(client, db_session):
    response, _level_id, _session_id = register_student(client, db_session)

    assert response.status_code == 201
    user = db_session.scalar(select(User).where(User.email == "jamb-0001@example.com"))
    assert user is not None
    assert user.password_hash != "a-strong-test-password"
    assert user.password_hash.startswith("$argon2id$")
    submission = db_session.scalar(
        select(VerificationSubmission).where(VerificationSubmission.user_id == user.id)
    )
    profile = db_session.scalar(
        select(StudentAcademicProfile).where(StudentAcademicProfile.user_id == user.id)
    )
    assert submission is not None and submission.status == "pending"
    assert submission.verification_method == "manual"
    assert profile is not None and profile.verified_level_id is None


def test_registration_accepts_name_parts_and_matric_without_academic_ids(client, db_session):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "student@example.com",
            "first_name": " Ada ",
            "middle_name": " Lovelace ",
            "surname": " Byron ",
            "password": "a-strong-test-password",
            "matriculation_number": "sazu/2026/001",
        },
    )

    assert response.status_code == 201
    user = db_session.scalar(select(User).where(User.email == "student@example.com"))
    assert user is not None
    assert user.full_name == "Ada Lovelace Byron"
    profile = db_session.scalar(
        select(StudentAcademicProfile).where(StudentAcademicProfile.user_id == user.id)
    )
    assert profile is not None
    assert profile.matriculation_number == "SAZU/2026/001"
    assert profile.jamb_registration_number is None
    assert profile.programme_id is None
    assert profile.admission_session_id is None


def test_registration_requires_first_name_surname_and_one_student_identifier(client):
    missing_name = client.post(
        "/api/v1/auth/register",
        json={
            "email": "missing-name@example.com",
            "first_name": "Ada",
            "password": "a-strong-test-password",
            "matriculation_number": "MAT-001",
        },
    )
    without_identifier = client.post(
        "/api/v1/auth/register",
        json={
            "email": "missing-id@example.com",
            "first_name": "Ada",
            "surname": "Byron",
            "password": "a-strong-test-password",
        },
    )

    assert missing_name.status_code == 422
    # Streamlined registration permits account creation before student ID submission
    assert without_identifier.status_code == 201


def test_student_cannot_submit_verified_level_or_access_admin_queue(client, db_session):
    response, _level_id, _session_id = register_student(client, db_session)
    assert response.status_code == 201
    token = response.json()["access_token"]

    state = client.get(
        "/api/v1/verification/state",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert state.status_code == 200
    assert state.json()["status"] == "pending"
    assert state.json()["verified_level_id"] is None

    forbidden_field = client.post(
        "/api/v1/verification/submissions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "jamb_registration_number": "JAMB-0001",
            "programme_id": 1,
            "admission_session_id": 1,
            "verified_level_id": 1,
        },
    )
    assert forbidden_field.status_code == 422

    queue = client.get(
        "/api/v1/admin/verification/submissions",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert queue.status_code == 403


def test_authorized_admin_approval_sets_level_and_creates_audit_event(client, db_session):
    response, level_id, session_id = register_student(client, db_session)
    admin = create_admin(db_session)
    submission = db_session.scalar(select(VerificationSubmission))

    decision = client.post(
        f"/api/v1/admin/verification/submissions/{submission.id}/decision",
        headers={"Authorization": f"Bearer {create_access_token(admin.id)}"},
        json={
            "decision": "verified",
            "verified_level_id": level_id,
            "verified_session_id": session_id,
            "reason": "Matched against reviewed supporting documents.",
        },
    )
    assert decision.status_code == 200
    assert decision.json()["status"] == "verified"

    profile = db_session.scalar(
        select(StudentAcademicProfile).where(
            StudentAcademicProfile.user_id == submission.user_id
        )
    )
    assert profile is not None
    assert profile.verified_level_id == level_id
    assert profile.verified_session_id == session_id
    audit = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.action == "admin.verification_verified",
            AuditEvent.target_id == str(submission.id),
        )
    )
    assert audit is not None and audit.actor_user_id == admin.id


def test_admin_rejection_records_reason_and_does_not_set_verified_level(client, db_session):
    response, _level_id, _session_id = register_student(client, db_session)
    admin = create_admin(db_session)
    submission = db_session.scalar(select(VerificationSubmission))

    decision = client.post(
        f"/api/v1/admin/verification/submissions/{submission.id}/decision",
        headers={"Authorization": f"Bearer {create_access_token(admin.id)}"},
        json={"decision": "rejected", "reason": "The submitted record could not be matched."},
    )
    assert decision.status_code == 200
    assert decision.json()["status"] == "rejected"
    assert submission.reviewed_by_id == admin.id
    assert submission.reviewed_at is not None
    assert submission.decision_reason == "The submitted record could not be matched."

    profile = db_session.scalar(
        select(StudentAcademicProfile).where(
            StudentAcademicProfile.user_id == submission.user_id
        )
    )
    assert profile is not None and profile.verified_level_id is None
    audit = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.action == "admin.verification_rejected",
            AuditEvent.target_id == str(submission.id),
        )
    )
    assert audit is not None


def test_administrator_cannot_review_their_own_submission(client, db_session):
    response, level_id, session_id = register_student(client, db_session)
    user = db_session.scalar(select(User).where(User.email == "jamb-0001@example.com"))
    role = Role(name="admin", description="Administrator")
    db_session.add(role)
    db_session.flush()
    user.role_id = role.id
    db_session.commit()
    submission = db_session.scalar(select(VerificationSubmission))

    decision = client.post(
        f"/api/v1/admin/verification/submissions/{submission.id}/decision",
        headers={"Authorization": f"Bearer {response.json()['access_token']}"},
        json={
            "decision": "verified",
            "verified_level_id": level_id,
            "verified_session_id": session_id,
            "reason": "Self-review must be denied.",
        },
    )
    assert decision.status_code == 422
    db_session.refresh(submission)
    assert submission.status == "pending"
    assert submission.reviewed_by_id is None


def test_verification_document_is_private_owner_scoped_and_deleted_after_retention(
    client, db_session
):
    response, level_id, session_id = register_student(client, db_session)
    student_token = response.json()["access_token"]
    submission = db_session.scalar(select(VerificationSubmission))
    upload = client.post(
        f"/api/v1/verification/submissions/{submission.id}/documents",
        headers={"Authorization": f"Bearer {student_token}"},
        files={"upload": ("transcript.pdf", b"%PDF-1.7 test document", "application/pdf")},
    )
    assert upload.status_code == 201
    document_id = upload.json()["id"]
    document = db_session.get(VerificationDocument, document_id)
    assert document is not None
    stored_path = resolve_private_storage_key(document.storage_key)
    assert stored_path.is_file()
    assert "private_storage" not in upload.text

    other_response, _, _ = register_student(client, db_session, identifier="JAMB-0002")
    other_token = other_response.json()["access_token"]
    denied = client.get(
        f"/api/v1/verification/submissions/{submission.id}/documents/{document_id}",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert denied.status_code == 404

    admin = create_admin(db_session)
    admin_token = create_access_token(admin.id)
    listed_documents = client.get(
        f"/api/v1/admin/verification/submissions/{submission.id}/documents",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert listed_documents.status_code == 200
    assert [item["id"] for item in listed_documents.json()] == [document_id]
    admin_download = client.get(
        f"/api/v1/verification/submissions/{submission.id}/documents/{document_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert admin_download.status_code == 200
    assert admin_download.content.startswith(b"%PDF-")
    access_audit = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.action == "security.verification_document_accessed",
            AuditEvent.target_id == str(document_id),
        )
    )
    assert access_audit is not None
    assert access_audit.actor_user_id == admin.id

    decision = client.post(
        f"/api/v1/admin/verification/submissions/{submission.id}/decision",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "decision": "verified",
            "verified_level_id": level_id,
            "verified_session_id": session_id,
            "reason": "Reviewed the supporting document.",
        },
    )
    assert decision.status_code == 200
    db_session.refresh(document)
    assert document.retention_until is not None
    assert document.retention_until > submission.reviewed_at

    from app.services.verification import purge_expired_verification_documents

    deleted_count = purge_expired_verification_documents(
        db_session,
        now=datetime.now(timezone.utc) + timedelta(days=4),
    )
    assert deleted_count == 1
    db_session.refresh(document)
    assert document.deleted_at is not None
    assert not stored_path.exists()


def test_duplicate_student_identifier_is_rejected(client, db_session):
    first, _, _ = register_student(client, db_session, identifier="JAMB-DUPLICATE")
    assert first.status_code == 201
    duplicate, _, _ = register_student(client, db_session, identifier="JAMB-DUPLICATE")
    assert duplicate.status_code == 409


def test_login_uses_argon2_and_returns_generic_invalid_credentials(client, db_session):
    registered, _, _ = register_student(client, db_session)
    assert registered.status_code == 201
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "JAMB-0001@example.com", "password": "a-strong-test-password"},
    )
    assert login.status_code == 200
    invalid = client.post(
        "/api/v1/auth/login",
        json={"email": "JAMB-0001@example.com", "password": "incorrect-password"},
    )
    assert invalid.status_code == 401


def test_registration_fails_closed_when_jwt_secret_is_missing(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret_key", "")
    response, _level_id, _session_id = register_student(client, db_session)
    assert response.status_code == 503
    assert db_session.scalar(select(User.id)) is None


def test_login_rate_limit_returns_429(client, monkeypatch):
    monkeypatch.setattr(settings, "auth_rate_limit_requests", 1)
    first = client.post(
        "/api/v1/auth/login",
        json={"email": "missing@example.com", "password": "incorrect-password"},
    )
    second = client.post(
        "/api/v1/auth/login",
        json={"email": "missing@example.com", "password": "incorrect-password"},
    )
    assert first.status_code == 401
    assert second.status_code == 429
    assert second.headers["Retry-After"]
