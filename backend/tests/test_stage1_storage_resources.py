from datetime import datetime, timezone
import io
import pytest
from sqlalchemy import select

from app.core.security import create_access_token
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
from app.models.commerce import Entitlement, Payment
from app.models.resource import Resource, ResourceCourseOffering, ResourceFile
from app.models.user import Role, User


def setup_admin(db_session):
    role = db_session.scalar(select(Role).where(Role.name == "admin"))
    if not role:
        role = Role(name="admin", description="Admin Role")
        db_session.add(role)
        db_session.flush()
    admin = User(
        email="stage1-admin@example.com",
        full_name="Stage 1 Admin",
        password_hash="unused",
        role_id=role.id,
        is_superuser=True,
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    return admin, create_access_token(admin.id)


def setup_student(db_session, *, verified: bool = True):
    student = User(
        email="stage1-student@example.com",
        full_name="Stage 1 Student",
        password_hash="unused",
        is_active=True,
    )
    db_session.add(student)
    db_session.flush()

    level = db_session.scalar(select(AcademicLevel).where(AcademicLevel.code == "300"))
    if not level:
        level = AcademicLevel(code="300", name="300 Level", sort_order=3)
        db_session.add(level)
        db_session.flush()

    if verified:
        profile = StudentAcademicProfile(
            user_id=student.id,
            matriculation_number=f"MATRIC-{student.id}",
            verified_level_id=level.id,
        )
        db_session.add(profile)
    db_session.commit()
    return student, create_access_token(student.id)


def setup_academic_context(db_session):
    inst = db_session.scalar(select(Institution).where(Institution.code == "SAZU"))
    if not inst:
        inst = Institution(code="SAZU", name="Sa'adu Zungur University")
        db_session.add(inst)
        db_session.flush()

    faculty = db_session.scalar(select(Faculty).where(Faculty.code == "science"))
    if not faculty:
        faculty = Faculty(institution_id=inst.id, code="science", name="Faculty of Science")
        db_session.add(faculty)
        db_session.flush()

    dept = db_session.scalar(select(Department).where(Department.code == "MICROBIOLOGY"))
    if not dept:
        dept = Department(faculty_id=faculty.id, code="MICROBIOLOGY", name="Department of Microbiology")
        db_session.add(dept)
        db_session.flush()

    prog = db_session.scalar(select(Programme).where(Programme.code == "BSC-MICROBIOLOGY"))
    if not prog:
        prog = Programme(faculty_id=faculty.id, code="BSC-MICROBIOLOGY", name="B.Sc. Microbiology")
        db_session.add(prog)
        db_session.flush()

    sess = db_session.scalar(select(AcademicSession).where(AcademicSession.name == "2025/2026"))
    from datetime import date
    if not sess:
        sess = AcademicSession(name="2025/2026", starts_on=date(2025, 8, 1), ends_on=date(2026, 7, 31))
        db_session.add(sess)
        db_session.flush()

    level = db_session.scalar(select(AcademicLevel).where(AcademicLevel.code == "300"))
    if not level:
        level = AcademicLevel(code="300", name="300 Level", sort_order=3)
        db_session.add(level)
        db_session.flush()

    semester = db_session.scalar(
        select(Semester).where(Semester.academic_session_id == sess.id, Semester.number == 2)
    )
    if not semester:
        semester = Semester(
            academic_session_id=sess.id,
            number=2,
            starts_on=date(2026, 2, 1),
            ends_on=date(2026, 7, 31),
        )
        db_session.add(semester)
        db_session.flush()

    cv = db_session.scalar(
        select(CurriculumVersion).where(
            CurriculumVersion.programme_id == prog.id,
            CurriculumVersion.academic_session_id == sess.id,
        )
    )
    if not cv:
        cv = CurriculumVersion(
            programme_id=prog.id,
            academic_session_id=sess.id,
            version="2025/2026 Official",
            is_active=True,
        )
        db_session.add(cv)
        db_session.flush()

    course = db_session.scalar(select(Course).where(Course.code == "MCB322"))
    if not course:
        course = Course(
            programme_id=prog.id,
            department_id=dept.id,
            academic_level_id=level.id,
            code="MCB322",
            title="Bacterial Diversity",
            is_active=True,
        )
        db_session.add(course)
        db_session.flush()

    offering = db_session.scalar(
        select(CourseOffering).where(
            CourseOffering.course_id == course.id,
            CourseOffering.curriculum_version_id == cv.id,
            CourseOffering.semester_id == semester.id,
        )
    )
    if not offering:
        offering = CourseOffering(
            course_id=course.id,
            curriculum_version_id=cv.id,
            academic_level_id=level.id,
            semester_id=semester.id,
            credit_units=3,
            is_active=True,
        )
        db_session.add(offering)
        db_session.flush()

    res_type = db_session.scalar(select(ResourceType).where(ResourceType.name == "Lecture Handout"))
    if not res_type:
        res_type = ResourceType(name="Lecture Handout")
        db_session.add(res_type)
        db_session.flush()

    db_session.commit()
    return {
        "institution": inst,
        "faculty": faculty,
        "department": dept,
        "programme": prog,
        "session": sess,
        "level": level,
        "semester": semester,
        "curriculum_version": cv,
        "course": course,
        "course_offering": offering,
        "resource_type": res_type,
    }


def test_upload_single_pdf_with_course_offering_association(client, db_session):
    admin, token = setup_admin(db_session)
    ctx = setup_academic_context(db_session)

    pdf_content = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"

    response = client.post(
        "/api/v1/admin/resources",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "title": "MCB322 Bacterial Diversity Handout",
            "description": "Complete lecture handout on bacterial physiology and taxonomy.",
            "course_offering_id": ctx["course_offering"].id,
            "resource_type_id": ctx["resource_type"].id,
            "access_policy": "subscription_or_entitlement",
            "is_published": "true",
            "requires_verification": "true",
        },
        files={
            "upload": ("bacterial_diversity.pdf", pdf_content, "application/pdf"),
        },
    )

    assert response.status_code == 201, response.text
    data = response.json()
    assert data["title"] == "MCB322 Bacterial Diversity Handout"
    assert data["file_name"] == "bacterial_diversity.pdf"
    assert data["course_offering_id"] == ctx["course_offering"].id
    assert data["course_id"] == ctx["course"].id
    assert data["academic_level_id"] == ctx["level"].id
    assert data["semester_id"] == ctx["semester"].id
    assert len(data["files"]) == 1
    assert data["files"][0]["page_order"] == 1
    assert data["files"][0]["mime_type"] == "application/pdf"
    assert data["file_checksum_sha256"] is not None


def test_upload_multi_image_resource_preserves_page_ordering(client, db_session):
    admin, token = setup_admin(db_session)
    ctx = setup_academic_context(db_session)

    # 3 distinct test page photos with JPEG signatures
    jpeg_page1 = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00page1_content"
    jpeg_page2 = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00page2_content"
    jpeg_page3 = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00page3_content"

    response = client.post(
        "/api/v1/admin/resources",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "title": "MCB322 2025 Past Examination Paper",
            "description": "3-page photographed examination question paper",
            "course_offering_id": ctx["course_offering"].id,
            "access_policy": "public",
            "is_published": "true",
        },
        files=[
            ("files", ("exam_p1.jpg", jpeg_page1, "image/jpeg")),
            ("files", ("exam_p2.jpg", jpeg_page2, "image/jpeg")),
            ("files", ("exam_p3.jpg", jpeg_page3, "image/jpeg")),
        ],
    )

    assert response.status_code == 201, response.text
    data = response.json()
    resource_id = data["id"]
    assert len(data["files"]) == 3
    assert data["files"][0]["original_filename"] == "exam_p1.jpg"
    assert data["files"][0]["page_order"] == 1
    assert data["files"][1]["original_filename"] == "exam_p2.jpg"
    assert data["files"][1]["page_order"] == 2
    assert data["files"][2]["original_filename"] == "exam_p3.jpg"
    assert data["files"][2]["page_order"] == 3

    # Query file listing endpoint
    files_res = client.get(
        f"/api/v1/resources/{resource_id}/files",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert files_res.status_code == 200
    files_list = files_res.json()
    assert len(files_list) == 3
    assert [f["page_order"] for f in files_list] == [1, 2, 3]

    # Download page 2 specifically
    page2_id = files_list[1]["id"]
    dl_res = client.get(
        f"/api/v1/resources/{resource_id}/files/{page2_id}/download",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert dl_res.status_code == 200
    assert dl_res.content == jpeg_page2
    assert "exam_p2.jpg" in dl_res.headers.get("content-disposition", "")


def test_invalid_file_signature_rejection(client, db_session):
    admin, token = setup_admin(db_session)
    ctx = setup_academic_context(db_session)

    # File claiming to be PDF but having plain text content without %PDF- magic bytes
    fake_pdf = b"Hello, I am pretending to be a PDF document."

    response = client.post(
        "/api/v1/admin/resources",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "title": "Fake Document",
            "course_offering_id": ctx["course_offering"].id,
        },
        files={
            "upload": ("forged.pdf", fake_pdf, "application/pdf"),
        },
    )

    assert response.status_code == 415
    assert "does not match its declared file type" in response.json()["detail"]


def test_private_resource_access_control(client, db_session):
    admin, admin_token = setup_admin(db_session)
    student, student_token = setup_student(db_session, verified=True)
    ctx = setup_academic_context(db_session)

    pdf_content = b"%PDF-1.4\nprotected document content\n%%EOF"

    # Create protected resource requiring subscription or entitlement
    create_res = client.post(
        "/api/v1/admin/resources",
        headers={"Authorization": f"Bearer {admin_token}"},
        data={
            "title": "MCB322 Protected Exam Answers",
            "course_offering_id": ctx["course_offering"].id,
            "access_policy": "subscription_or_entitlement",
            "is_published": "true",
            "requires_verification": "true",
        },
        files={
            "upload": ("answers.pdf", pdf_content, "application/pdf"),
        },
    )
    assert create_res.status_code == 201
    resource_id = create_res.json()["id"]

    # 1. Unauthenticated download rejected with 401
    unauth_dl = client.get(f"/api/v1/resources/{resource_id}/download")
    assert unauth_dl.status_code == 401

    # 2. Verified student without entitlement rejected with 403
    forbidden_dl = client.get(
        f"/api/v1/resources/{resource_id}/download",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert forbidden_dl.status_code == 403
    assert "do not have access" in forbidden_dl.json()["detail"]

    # 3. Admin can download
    admin_dl = client.get(
        f"/api/v1/resources/{resource_id}/download",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert admin_dl.status_code == 200
    assert admin_dl.content == pdf_content

    # 4. Grant single-resource entitlement to student
    from app.models.commerce import AccessPackage
    package = AccessPackage(
        name=f"Single Resource Pass {student.id}",
        package_type="subscription",
        price_minor=30000,
        currency="NGN",
        semester_id=ctx["semester"].id,
        is_active=True,
    )
    db_session.add(package)
    db_session.flush()

    payment = Payment(
        user_id=student.id,
        package_id=package.id,
        provider="paystack",
        provider_reference=f"LRP-TEST-{student.id}",
        idempotency_key=f"IK-TEST-{student.id}",
        status="succeeded",
        amount_minor=30000,
        currency="NGN",
    )
    db_session.add(payment)
    db_session.flush()

    entitlement = Entitlement(
        user_id=student.id,
        payment_id=payment.id,
        package_id=package.id,
        resource_id=resource_id,
        scope_key=f"resource:{resource_id}",
        status="active",
    )
    db_session.add(entitlement)
    db_session.commit()

    # Now student can download
    student_dl = client.get(
        f"/api/v1/resources/{resource_id}/download",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert student_dl.status_code == 200
    assert student_dl.content == pdf_content
