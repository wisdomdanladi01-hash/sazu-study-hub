import pytest
from datetime import date, datetime, timedelta, timezone
from fastapi import status
from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.models.academic import (
    AcademicLevel,
    AcademicSession,
    Course,
    CourseOffering,
    Department,
    Faculty,
    Institution,
    Programme,
    Semester,
    StudentAcademicProfile,
)
from app.models.commerce import AccessPackage, Entitlement, Payment
from app.models.resource import Resource
from app.models.user import Role, User


def _seed_super_admin(db) -> tuple[User, str]:
    role = db.query(Role).filter(Role.name == "super_admin").first()
    admin = User(
        email="superadmin_test@sazu.edu.ng",
        full_name="Super Admin",
        password_hash=hash_password("SuperSecret1234!"),
        is_active=True,
        is_superuser=True,
        email_verified=True,
        role_id=role.id if role else None,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    token = create_access_token(admin.id)
    return admin, token


def test_email_verification_flow(client: TestClient, db_session):
    """Test generating, sending, and verifying a 6-digit email OTP."""
    user = User(
        email="student.emailtest@sazu.edu.ng",
        full_name="Test Student",
        password_hash=hash_password("Pass12345678!"),
        is_active=True,
        email_verified=False,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    token = create_access_token(user.id)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Check me shows email_verified=False
    me_res = client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == status.HTTP_200_OK
    assert me_res.json()["email_verified"] is False

    # 2. Request verification code
    send_res = client.post("/api/v1/auth/email/send-code", headers=headers)
    assert send_res.status_code == status.HTTP_200_OK
    data = send_res.json()
    assert "code" in data["message"] or "verification" in data["message"].lower()
    code = data.get("dev_code")
    assert code is not None
    assert len(code) == 6

    # 3. Submit invalid code
    bad_res = client.post("/api/v1/auth/email/verify", json={"code": "000000"}, headers=headers)
    assert bad_res.status_code == status.HTTP_400_BAD_REQUEST

    # 4. Submit correct code
    good_res = client.post("/api/v1/auth/email/verify", json={"code": code}, headers=headers)
    assert good_res.status_code == status.HTTP_200_OK
    assert good_res.json()["email_verified"] is True

    # 5. Check me again
    me_res2 = client.get("/api/v1/auth/me", headers=headers)
    assert me_res2.status_code == status.HTTP_200_OK
    assert me_res2.json()["email_verified"] is True


def test_streamlined_registration_and_status_submission(client: TestClient, db_session):
    """Test that students can sign up with just email, name, password, terms,

    then submit their matriculation and programme details in a separate step.
    """
    # Create necessary academic references
    inst = Institution(name="Sa'adu Zungur University", code="SAZU")
    db_session.add(inst)
    db_session.flush()
    fac = Faculty(name="Faculty of Science", code="FSC", institution_id=inst.id)
    db_session.add(fac)
    db_session.flush()
    prog = Programme(name="B.Sc. Computer Science", code="CSC", faculty_id=fac.id, award="B.Sc.", study_level="undergraduate")
    dept = Department(name="Mathematical Sciences", code="MTH", faculty_id=fac.id)
    db_session.add_all([prog, dept])
    db_session.flush()
    sess = AcademicSession(name="2025/2026", starts_on=date(2025, 9, 1), ends_on=date(2026, 8, 31), is_active=True)
    lvl = AcademicLevel(name="200 Level", code="200L", sort_order=2)
    db_session.add_all([sess, lvl])
    db_session.commit()

    # 1. Register with NO matric number or jamb number
    reg_payload = {
        "email": "freshman@sazu.edu.ng",
        "first_name": "Amina",
        "surname": "Bello",
        "password": "SecurePassword123!",
    }
    reg_res = client.post("/api/v1/auth/register", json=reg_payload)
    assert reg_res.status_code == status.HTTP_201_CREATED, reg_res.text
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Student is logged in, profile exists
    me_res = client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == status.HTTP_200_OK
    assert me_res.json()["full_name"] == "Amina Bello"

    # 3. Student submits verification status (matric, faculty, dept, programme, level)
    sub_payload = {
        "matriculation_number": "SAZU/2025/SCI/042",
        "programme_id": prog.id,
        "department_id": dept.id,
        "admission_session_id": sess.id,
        "claimed_level_id": lvl.id,
    }
    sub_res = client.post("/api/v1/verification/submissions", json=sub_payload, headers=headers)
    assert sub_res.status_code == status.HTTP_201_CREATED, sub_res.text
    assert sub_res.json()["status"] == "pending"


def test_level_package_and_subscriber_discount(client: TestClient, db_session):
    """Test admin creating a level pass package with subscriber discount,

    editing it, and checking discounted pricing calculation.
    """
    _, admin_token = _seed_super_admin(db_session)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    inst = Institution(name="Sa'adu Zungur University 2", code="SAZU2")
    db_session.add(inst)
    db_session.flush()
    lvl300 = AcademicLevel(name="300 Level", code="300L", sort_order=3)
    sess = AcademicSession(name="2025/2026", starts_on=date(2025, 9, 1), ends_on=date(2026, 8, 31), is_active=True)
    db_session.add_all([lvl300, sess])
    db_session.commit()

    # 1. Create level pass package: regular 2,000 NGN (200000 kobo), subscriber discount 1,000 NGN (100000 kobo)
    pkg_payload = {
        "name": "300 Level Cross-Level All Resources Pass",
        "description": "Full access to all 300 level learning materials and practice tests.",
        "package_type": "level",
        "price_minor": 200000,
        "subscriber_price_minor": 100000,
        "currency": "NGN",
        "academic_level_id": lvl300.id,
        "is_active": True,
    }
    create_res = client.post("/api/v1/admin/subscriptions/packages", json=pkg_payload, headers=admin_headers)
    assert create_res.status_code == status.HTTP_201_CREATED, create_res.text
    pkg_data = create_res.json()
    assert pkg_data["package_type"] == "level"
    assert pkg_data["price_minor"] == 200000
    assert pkg_data["subscriber_price_minor"] == 100000
    assert pkg_data["target_name"] == "300 Level Level Pass"
    pkg_id = pkg_data["id"]

    # 2. Edit package
    update_payload = {
        "name": "300 Level Complete Annual Pass",
        "price_minor": 250000,
        "subscriber_price_minor": 120000,
    }
    edit_res = client.patch(f"/api/v1/admin/subscriptions/packages/{pkg_id}", json=update_payload, headers=admin_headers)
    assert edit_res.status_code == status.HTTP_200_OK
    assert edit_res.json()["name"] == "300 Level Complete Annual Pass"
    assert edit_res.json()["price_minor"] == 250000
    assert edit_res.json()["subscriber_price_minor"] == 120000

    # 3. Check student sees package
    student = User(
        email="student.subscriber@sazu.edu.ng",
        full_name="Subscriber Student",
        password_hash=hash_password("Pass12345678!"),
        is_active=True,
    )
    db_session.add(student)
    db_session.commit()
    student_token = create_access_token(student.id)
    student_headers = {"Authorization": f"Bearer {student_token}"}

    pkgs_res = client.get("/api/v1/subscriptions/packages", headers=student_headers)
    assert pkgs_res.status_code == status.HTTP_200_OK
    level_pkg = next(p for p in pkgs_res.json() if p["id"] == pkg_id)
    assert level_pkg["effective_price_minor"] == 250000  # not yet subscribed

    # 4. Delete package
    del_res = client.delete(f"/api/v1/admin/subscriptions/packages/{pkg_id}", headers=admin_headers)
    assert del_res.status_code == status.HTTP_200_OK
