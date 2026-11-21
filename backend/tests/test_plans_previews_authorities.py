from datetime import date, datetime, timedelta, timezone
import pytest
from sqlalchemy import select

from app.core.security import create_access_token
from app.models.academic import (
    AcademicLevel,
    AcademicSession,
    Course,
    Department,
    Faculty,
    Institution,
    Programme,
    Semester,
    StudentAcademicProfile,
)
from app.models.audit import AuditEvent
from app.models.commerce import AccessPackage, Entitlement, Payment
from app.models.identity import VerificationDocument, VerificationSubmission
from app.models.resource import Resource, ResourceFile
from app.models.user import Role, User
from app.services.paystack import VerifiedTransaction


def _seed_roles(db):
    roles = {}
    for name in ["super_admin", "admin", "content_admin", "finance_admin", "verification_officer"]:
        role = db.scalar(select(Role).where(Role.name == name))
        if not role:
            role = Role(name=name, description=f"{name} role")
            db.add(role)
            db.flush()
        roles[name] = role
    return roles


def _setup_base_data(db):
    roles = _seed_roles(db)
    inst = Institution(code="SAZU-MAIN", name="Sa'adu Zungur University")
    db.add(inst)
    db.flush()
    fac = Faculty(institution_id=inst.id, code="SCI", name="Faculty of Science")
    db.add(fac)
    db.flush()
    prog = Programme(name="B.Sc. Computer Science", code="CS", faculty_id=fac.id)
    db.add(prog)
    db.flush()
    dept = Department(faculty_id=fac.id, programme_id=prog.id, code="CMP", name="Computer Science")
    db.add(dept)
    db.flush()
    level = AcademicLevel(code="200", name="200 Level", sort_order=200)
    db.add(level)
    db.flush()
    course1 = Course(code="CMP201", title="Object Oriented Programming", programme_id=prog.id)
    course2 = Course(code="CMP202", title="Data Structures", programme_id=prog.id)
    db.add_all([course1, course2])
    db.flush()

    today = date.today()
    sess = AcademicSession(
        name="2026/2027",
        starts_on=today - timedelta(days=20),
        ends_on=today + timedelta(days=160),
        is_active=True,
    )
    db.add(sess)
    db.flush()
    sem1 = Semester(
        academic_session_id=sess.id,
        number=1,
        starts_on=today - timedelta(days=20),
        ends_on=today + timedelta(days=70),
    )
    sem2 = Semester(
        academic_session_id=sess.id,
        number=2,
        starts_on=today + timedelta(days=71),
        ends_on=today + timedelta(days=160),
    )
    db.add_all([sem1, sem2])
    db.flush()

    # Users
    super_admin = User(
        email="super@example.com",
        full_name="Super Admin",
        password_hash="hash",
        is_superuser=True,
        role_id=roles["super_admin"].id,
    )
    content_admin = User(
        email="content@example.com",
        full_name="Content Admin",
        password_hash="hash",
        role_id=roles["content_admin"].id,
    )
    finance_admin = User(
        email="finance@example.com",
        full_name="Finance Admin",
        password_hash="hash",
        role_id=roles["finance_admin"].id,
    )
    vo = User(
        email="vo@example.com",
        full_name="Verification Officer",
        password_hash="hash",
        role_id=roles["verification_officer"].id,
    )
    student = User(
        email="student@example.com",
        full_name="Verified Student",
        password_hash="hash",
    )
    db.add_all([super_admin, content_admin, finance_admin, vo, student])
    db.flush()

    db.add(
        StudentAcademicProfile(
            user_id=student.id,
            jamb_registration_number="JAMB-12345",
            matriculation_number="UG/26/1001",
            programme_id=prog.id,
            department_id=dept.id,
            verified_level_id=level.id,
        )
    )
    db.commit()

    return {
        "roles": roles,
        "super_admin": super_admin,
        "content_admin": content_admin,
        "finance_admin": finance_admin,
        "vo": vo,
        "student": student,
        "session": sess,
        "sem1": sem1,
        "sem2": sem2,
        "course1": course1,
        "course2": course2,
        "level": level,
    }


def _auth_header(user: User) -> dict:
    token = create_access_token(user.id)
    return {"Authorization": f"Bearer {token}"}


# =====================================================================
# PROBLEM 1: Academic Sessions & Semesters CRUD + 4 Plan Types
# =====================================================================

def test_academic_session_and_semester_crud(client, db_session):
    data = _setup_base_data(db_session)
    admin_hdr = _auth_header(data["super_admin"])

    # 1. Create Academic Session
    sess_payload = {
        "name": "2027/2028",
        "starts_on": "2027-10-01",
        "ends_on": "2028-07-31",
        "is_active": False,
    }
    res = client.post("/api/v1/admin/academic/sessions", json=sess_payload, headers=admin_hdr)
    assert res.status_code == 201, res.text
    sess_id = res.json()["id"]
    assert res.json()["name"] == "2027/2028"

    # Reject invalid dates (starts_on >= ends_on)
    bad_sess = {
        "name": "2028/2029",
        "starts_on": "2028-10-01",
        "ends_on": "2028-05-01",
        "is_active": False,
    }
    res = client.post("/api/v1/admin/academic/sessions", json=bad_sess, headers=admin_hdr)
    assert res.status_code == 422

    # 2. Create Semester
    sem_payload = {
        "academic_session_id": sess_id,
        "number": 1,
        "starts_on": "2027-10-01",
        "ends_on": "2028-02-28",
    }
    res = client.post("/api/v1/admin/academic/semesters", json=sem_payload, headers=admin_hdr)
    assert res.status_code == 201, res.text
    sem_id = res.json()["id"]

    # 3. Patch Semester
    res = client.patch(
        f"/api/v1/admin/academic/semesters/{sem_id}",
        json={"ends_on": "2028-03-15"},
        headers=admin_hdr,
    )
    assert res.status_code == 200
    assert res.json()["ends_on"] == "2028-03-15"

    # 4. List Semesters
    res = client.get(f"/api/v1/admin/academic/semesters?session_id={sess_id}", headers=admin_hdr)
    assert res.status_code == 200
    assert len(res.json()) == 1


def test_four_plan_types_and_entitlements(client, db_session, monkeypatch):
    data = _setup_base_data(db_session)
    admin_hdr = _auth_header(data["super_admin"])
    student_hdr = _auth_header(data["student"])

    # Create dummy resource for resource plan
    res_obj = Resource(
        title="Sample Lecture Handout",
        description="Handout description",
        file_name="handout.pdf",
        storage_path="resources/dummy-handout.pdf",
        storage_provider="local_private",
        mime_type="application/pdf",
        file_size_bytes=1024,
        file_checksum_sha256="dummy",
        is_published=True,
        course_id=data["course1"].id,
    )
    db_session.add(res_obj)
    db_session.commit()

    # 1. Create Semester Plan
    sem_plan = {
        "name": "First Semester Access",
        "description": "Full access to first semester courses",
        "package_type": "semester",
        "price_minor": 150000,
        "currency": "NGN",
        "semester_id": data["sem1"].id,
        "is_active": True,
    }
    r = client.post("/api/v1/admin/subscriptions/packages", json=sem_plan, headers=admin_hdr)
    assert r.status_code == 201, r.text
    sem_pkg_id = r.json()["id"]

    # 2. Create Session Pass
    sess_plan = {
        "name": "Full Session Pass",
        "description": "Access both semesters",
        "package_type": "session",
        "price_minor": 200000,
        "currency": "NGN",
        "academic_session_id": data["session"].id,
        "is_active": True,
    }
    r = client.post("/api/v1/admin/subscriptions/packages", json=sess_plan, headers=admin_hdr)
    assert r.status_code == 201, r.text
    sess_pkg_id = r.json()["id"]

    # 3. Create Course Pass (₦300 option = 30000 minor)
    course_plan = {
        "name": "OOP Course Pass",
        "description": "Single course material & practice tests",
        "package_type": "course",
        "price_minor": 30000,
        "currency": "NGN",
        "course_id": data["course1"].id,
        "is_active": True,
    }
    r = client.post("/api/v1/admin/subscriptions/packages", json=course_plan, headers=admin_hdr)
    assert r.status_code == 201, r.text
    course_pkg_id = r.json()["id"]

    # 4. Create Single Resource Plan (₦300 option = 30000 minor)
    resource_plan = {
        "name": "Single Handout Pass",
        "description": "One lecture handout",
        "package_type": "resource",
        "price_minor": 30000,
        "currency": "NGN",
        "resource_id": res_obj.id,
        "is_active": True,
    }
    r = client.post("/api/v1/admin/subscriptions/packages", json=resource_plan, headers=admin_hdr)
    assert r.status_code == 201, r.text
    resource_pkg_id = r.json()["id"]

    # Student lists active packages
    r = client.get("/api/v1/subscriptions/packages", headers=student_hdr)
    assert r.status_code == 200
    pkgs = r.json()
    assert len(pkgs) >= 4
    pkg_types = {p["package_type"] for p in pkgs}
    assert {"semester", "session", "course", "resource"}.issubset(pkg_types)

    # Mock Paystack transaction initialization and verification
    monkeypatch.setattr(
        "app.services.payments.initialize_transaction",
        lambda email, amount_minor, currency, reference: f"https://checkout.paystack.com/{reference}",
    )

    # Buy Course Pass
    init_res = client.post(
        "/api/v1/payments/initialize",
        json={"package_id": course_pkg_id},
        headers=student_hdr,
    )
    assert init_res.status_code == 201, init_res.text
    ref = init_res.json()["reference"]

    monkeypatch.setattr(
        "app.services.payments.verify_transaction",
        lambda reference: VerifiedTransaction(
            reference=ref,
            status="success",
            amount_minor=30000,
            currency="NGN",
            customer_email="student@example.com",
        ),
    )

    verify_res = client.post(f"/api/v1/payments/{ref}/verify", headers=student_hdr)
    assert verify_res.status_code == 200, verify_res.text

    # Verify Entitlement was created for course1
    ent = db_session.scalar(
        select(Entitlement).where(
            Entitlement.user_id == data["student"].id,
            Entitlement.course_id == data["course1"].id,
            Entitlement.status == "active",
        )
    )
    assert ent is not None

    # Check metrics on admin package endpoint
    admin_pkgs = client.get("/api/v1/admin/subscriptions/packages", headers=admin_hdr).json()
    course_pkg_admin = next(p for p in admin_pkgs if p["id"] == course_pkg_id)
    assert course_pkg_admin["buyers_count"] == 1
    assert course_pkg_admin["total_revenue_minor"] == 30000


# =====================================================================
# PROBLEM 2: Admin Resource Previews & Audit Event
# =====================================================================

def test_admin_resource_preview_and_audit(client, db_session, monkeypatch, tmp_path):
    data = _setup_base_data(db_session)
    admin_hdr = _auth_header(data["content_admin"])
    student_hdr = _auth_header(data["student"])

    # Create dummy PDF file on disk
    pdf_path = tmp_path / "lecture.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 dummy content for test preview")

    # Draft / unpublished resource
    res_draft = Resource(
        title="Unpublished Draft Material",
        description="Draft test",
        file_name="lecture.pdf",
        storage_path=str(pdf_path),
        storage_provider="local_private",
        mime_type="application/pdf",
        file_size_bytes=len(pdf_path.read_bytes()),
        file_checksum_sha256="abc",
        is_published=False,  # DRAFT!
        course_id=data["course1"].id,
        access_policy="subscription_or_entitlement",
    )
    db_session.add(res_draft)
    db_session.commit()

    # 1. Student accessing draft resource directly gets 404
    r = client.get(f"/api/v1/resources/{res_draft.id}", headers=student_hdr)
    assert r.status_code == 404

    # 2. Admin accessing draft resource gets 200
    r = client.get(f"/api/v1/resources/{res_draft.id}", headers=admin_hdr)
    assert r.status_code == 200
    assert r.json()["is_published"] is False

    # 3. Admin opens secure viewer
    monkeypatch.setattr(
        "app.api.routes.resources.build_page_index",
        lambda sources: ([type("Page", (), {"number": 1, "kind": "image"})], []),
    )
    viewer_res = client.get(f"/api/v1/resources/{res_draft.id}/viewer", headers=admin_hdr)
    assert viewer_res.status_code == 200, viewer_res.text
    manifest = viewer_res.json()
    assert manifest["viewable"] is True
    # Watermark contains admin details
    assert data["content_admin"].full_name in manifest["watermark"]

    # Check AuditEvent logged as admin.resource_previewed
    audit = db_session.scalar(
        select(AuditEvent)
        .where(
            AuditEvent.actor_user_id == data["content_admin"].id,
            AuditEvent.action == "admin.resource_previewed",
            AuditEvent.target_id == str(res_draft.id),
        )
    )
    assert audit is not None


# =====================================================================
# PROBLEM 3: RBAC Enforcement
# =====================================================================

def test_rbac_matrix_enforcement(client, db_session):
    data = _setup_base_data(db_session)
    content_admin_hdr = _auth_header(data["content_admin"])
    finance_admin_hdr = _auth_header(data["finance_admin"])
    vo_hdr = _auth_header(data["vo"])
    super_admin_hdr = _auth_header(data["super_admin"])

    # 1. Content admin CANNOT change package prices or create packages
    pkg_payload = {
        "name": "Unauthorized Plan",
        "package_type": "semester",
        "price_minor": 100000,
        "currency": "NGN",
        "semester_id": data["sem1"].id,
        "is_active": True,
    }
    r = client.post("/api/v1/admin/subscriptions/packages", json=pkg_payload, headers=content_admin_hdr)
    assert r.status_code == 403

    # Content admin CANNOT view payment history
    r = client.get("/api/v1/admin/payments", headers=content_admin_hdr)
    assert r.status_code == 403

    # 2. Finance admin CAN manage packages and view payments
    r = client.post("/api/v1/admin/subscriptions/packages", json=pkg_payload, headers=finance_admin_hdr)
    assert r.status_code == 201

    r = client.get("/api/v1/admin/payments", headers=finance_admin_hdr)
    assert r.status_code == 200

    # Finance admin CANNOT upload resource
    r = client.post(
        "/api/v1/admin/resources",
        data={"title": "Unauthorized Resource"},
        files={"upload": ("test.txt", b"content", "text/plain")},
        headers=finance_admin_hdr,
    )
    assert r.status_code == 403

    # Finance admin CANNOT view pending verification queue
    r = client.get("/api/v1/admin/verification/submissions", headers=finance_admin_hdr)
    assert r.status_code == 403

    # 3. Verification officer CAN view pending verifications
    r = client.get("/api/v1/admin/verification/submissions", headers=vo_hdr)
    assert r.status_code == 200

    # Verification officer CANNOT manage packages
    r = client.post("/api/v1/admin/subscriptions/packages", json=pkg_payload, headers=vo_hdr)
    assert r.status_code == 403

    # 4. Super admin has role assignment capability under /admin/users
    users_res = client.get("/api/v1/admin/users", headers=super_admin_hdr)
    assert users_res.status_code == 200
    # Content admin cannot view /admin/users
    r = client.get("/api/v1/admin/users", headers=content_admin_hdr)
    assert r.status_code == 403
