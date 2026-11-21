import io
from datetime import datetime, timedelta, timezone

import pypdfium2 as pdfium
from PIL import Image

from app.core.config import settings
from app.core.security import create_access_token
from app.models.academic import AcademicLevel, Course, StudentAcademicProfile
from app.models.assessment import AssessmentAttempt
from app.models.commerce import AccessPackage, Entitlement, PackageResource, Payment
from app.models.user import Role, User


# --------------------------------------------------------------------------- helpers
def make_pdf(pages: int = 2) -> bytes:
    pdf = pdfium.PdfDocument.new()
    for _ in range(pages):
        pdf.new_page(300, 400)
    buffer = io.BytesIO()
    pdf.save(buffer)
    return buffer.getvalue()


def make_png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (120, 160), "white").save(buffer, "PNG")
    return buffer.getvalue()


def make_admin(db_session):
    role = Role(name="admin", description="Administrator")
    db_session.add(role)
    db_session.flush()
    admin = User(
        email="va-admin@example.com",
        full_name="Viewer Admin",
        password_hash="unused",
        role_id=role.id,
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    return admin, {"Authorization": f"Bearer {create_access_token(admin.id)}"}


def make_student(db_session, email: str, *, verified: bool = True, name: str = "Aisha Bello"):
    student = User(email=email, full_name=name, password_hash="unused", is_active=True)
    db_session.add(student)
    db_session.flush()
    if verified:
        level = db_session.query(AcademicLevel).filter_by(code="100").first()
        if level is None:
            level = AcademicLevel(code="100", name="100 Level", sort_order=100)
            db_session.add(level)
            db_session.flush()
        db_session.add(
            StudentAcademicProfile(
                user_id=student.id,
                jamb_registration_number=f"JAMB-{student.id}",
                verified_level_id=level.id,
            )
        )
    db_session.commit()
    return student, {"Authorization": f"Bearer {create_access_token(student.id)}"}


def upload_resource(client, admin_headers, *, content, filename, mime, **fields):
    data = {"title": "Past questions", "is_published": "true", **fields}
    response = client.post(
        "/api/v1/admin/resources",
        headers=admin_headers,
        data=data,
        files={"upload": (filename, content, mime)},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def grant_resource_entitlement(db_session, student, resource_id, *, expires_at=None):
    package = AccessPackage(
        name=f"pkg-{student.id}-{resource_id}",
        package_type="resource_package",
        price_minor=500,
        is_active=False,
    )
    db_session.add(package)
    db_session.flush()
    payment = Payment(
        user_id=student.id,
        package_id=package.id,
        provider="test",
        idempotency_key=f"idem-{student.id}-{resource_id}",
        status="succeeded",
        amount_minor=500,
        currency="NGN",
    )
    db_session.add(payment)
    db_session.flush()
    db_session.add_all(
        [
            PackageResource(package_id=package.id, resource_id=resource_id),
            Entitlement(
                user_id=student.id,
                payment_id=payment.id,
                scope_key=f"package:{package.id}:student:{student.id}",
                package_id=package.id,
                expires_at=expires_at,
            ),
        ]
    )
    db_session.commit()


# --------------------------------------------------------------------------- viewer
def test_viewer_serves_watermarked_pages_and_blocks_raw_download(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "student_downloads_enabled", False)
    _admin, admin_headers = make_admin(db_session)
    student, headers = make_student(db_session, "va-student@example.com")
    resource_id = upload_resource(
        client,
        admin_headers,
        content=make_pdf(2),
        filename="past.pdf",
        mime="application/pdf",
        access_policy="entitlement_only",
        requires_verification="true",
    )

    # No entitlement yet.
    assert client.get(f"/api/v1/resources/{resource_id}/viewer", headers=headers).status_code == 403
    assert client.get(f"/api/v1/resources/{resource_id}/viewer").status_code == 401

    grant_resource_entitlement(db_session, student, resource_id)

    manifest = client.get(f"/api/v1/resources/{resource_id}/viewer", headers=headers)
    assert manifest.status_code == 200, manifest.text
    body = manifest.json()
    assert body["viewable"] is True
    assert body["page_count"] == 2
    assert [page["kind"] for page in body["pages"]] == ["image", "image"]
    assert body["offline_allowed"] is True
    assert body["downloads_enabled"] is False
    assert f"ID {student.id}" in body["watermark"]

    page = client.get(f"/api/v1/resources/{resource_id}/viewer/pages/1", headers=headers)
    assert page.status_code == 200
    assert page.headers["content-type"] == "image/jpeg"
    assert "no-store" in page.headers["cache-control"]
    assert page.content.startswith(b"\xff\xd8")
    assert client.get(f"/api/v1/resources/{resource_id}/viewer/pages/3", headers=headers).status_code == 404

    # Raw file routes are closed to students, even entitled ones.
    for path in (f"/api/v1/resources/{resource_id}/download", f"/api/v1/resources/{resource_id}/preview/file"):
        denied = client.get(path, headers=headers)
        assert denied.status_code == 403, path
    # Administrators keep access to the original.
    assert client.get(f"/api/v1/resources/{resource_id}/download", headers=admin_headers).status_code == 200


def test_viewer_requires_verified_student(client, db_session):
    _admin, admin_headers = make_admin(db_session)
    _student, headers = make_student(db_session, "va-unverified@example.com", verified=False)
    resource_id = upload_resource(
        client,
        admin_headers,
        content=make_pdf(1),
        filename="free.pdf",
        mime="application/pdf",
        access_policy="public",
        requires_verification="true",
    )
    response = client.get(f"/api/v1/resources/{resource_id}/viewer", headers=headers)
    assert response.status_code == 403
    assert "verification" in response.json()["detail"].lower()


def test_offline_expiry_never_outlives_the_subscription(client, db_session):
    _admin, admin_headers = make_admin(db_session)
    student, headers = make_student(db_session, "va-offline@example.com")
    resource_id = upload_resource(
        client,
        admin_headers,
        content=make_pdf(1),
        filename="short.pdf",
        mime="application/pdf",
        access_policy="entitlement_only",
        requires_verification="true",
    )
    ends = datetime.now(timezone.utc) + timedelta(days=2)
    grant_resource_entitlement(db_session, student, resource_id, expires_at=ends)

    body = client.get(f"/api/v1/resources/{resource_id}/viewer", headers=headers).json()
    offline_expires = datetime.fromisoformat(body["offline_expires_at"])
    access_expires = datetime.fromisoformat(body["access_expires_at"])
    assert offline_expires <= access_expires
    assert offline_expires - datetime.now(timezone.utc) < timedelta(days=3)


def test_image_resource_is_not_leaked_through_preview_file(client, db_session, monkeypatch):
    """Regression: restricted image resources used to stream in full to anonymous callers."""
    monkeypatch.setattr(settings, "student_downloads_enabled", False)
    _admin, admin_headers = make_admin(db_session)
    resource_id = upload_resource(
        client,
        admin_headers,
        content=make_png(),
        filename="scan.png",
        mime="image/png",
        access_policy="entitlement_only",
        preview_policy="none",
    )
    assert client.get(f"/api/v1/resources/{resource_id}/preview/file").status_code == 401
    preview = client.get(f"/api/v1/resources/{resource_id}/preview")
    assert preview.status_code == 200
    assert preview.json()["preview_available"] is False


def test_unviewable_office_files_explain_why(client, db_session):
    _admin, admin_headers = make_admin(db_session)
    student, headers = make_student(db_session, "va-docx@example.com")
    resource_id = upload_resource(
        client,
        admin_headers,
        content=b"PK\x03\x04 not really a docx but has the signature",
        filename="notes.docx",
        mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        access_policy="public",
        requires_verification="false",
    )
    body = client.get(f"/api/v1/resources/{resource_id}/viewer", headers=headers).json()
    assert body["viewable"] is False
    assert body["offline_allowed"] is False
    assert "PDF" in body["message"]


# --------------------------------------------------------------------------- assessments
def make_course(db_session, code="COS102"):
    course = Course(code=code, title="Problem Solving")
    db_session.add(course)
    db_session.commit()
    return course


def add_question(client, admin_headers, course_id, text, *, correct="B", resource_id=None, topic=None):
    response = client.post(
        "/api/v1/admin/assessments/questions",
        headers=admin_headers,
        json={
            "course_id": course_id,
            "resource_id": resource_id,
            "topic": topic,
            "text": text,
            "options": ["one", "two", "three", "four"],
            "correct_answer": correct,
            "explanation": f"Because of {text}",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def add_config(client, admin_headers, course_id, **overrides):
    payload = {
        "title": "COS102 mock test",
        "course_id": course_id,
        "question_count": 3,
        "duration_minutes": 20,
        "pass_mark_percent": 50,
        "requires_subscription": False,
        "is_published": True,
        **overrides,
    }
    response = client.post("/api/v1/admin/assessments/configs", headers=admin_headers, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_full_attempt_flow_is_graded_on_the_server(client, db_session):
    _admin, admin_headers = make_admin(db_session)
    _student, headers = make_student(db_session, "as-student@example.com")
    course = make_course(db_session)
    questions = [add_question(client, admin_headers, course.id, f"Question {i}", correct="C") for i in range(1, 5)]
    config = add_config(client, admin_headers, course.id, question_count=3, max_attempts=1)
    assert config["pool_size"] == 4

    listed = client.get("/api/v1/assessments", headers=headers).json()
    assert [item["id"] for item in listed] == [config["id"]]
    assert listed[0]["question_count"] == 3
    assert listed[0]["locked"] is False

    started = client.post(f"/api/v1/assessments/{config['id']}/attempts", headers=headers)
    assert started.status_code == 201, started.text
    attempt = started.json()
    assert len(attempt["questions"]) == 3
    # The student must never be sent answers or explanations.
    payload = started.text
    assert "correct_key" not in payload and "explanation" not in payload and "Because of" not in payload

    # Resuming returns the same sitting instead of creating another.
    again = client.post(f"/api/v1/assessments/{config['id']}/attempts", headers=headers).json()
    assert again["id"] == attempt["id"]

    # Answer: first two correct ("C"), last one wrong.
    ids = [question["id"] for question in attempt["questions"]]
    for question_id, key in zip(ids, ["C", "C", "A"]):
        saved = client.put(
            f"/api/v1/assessments/attempts/{attempt['id']}/answers",
            headers=headers,
            json={"question_id": question_id, "answer_key": key},
        )
        assert saved.status_code == 204, saved.text
    # Questions outside the attempt are rejected.
    outside = max(question["id"] for question in questions) + 100
    assert client.put(
        f"/api/v1/assessments/attempts/{attempt['id']}/answers",
        headers=headers,
        json={"question_id": outside, "answer_key": "A"},
    ).status_code == 409

    # Another student cannot see this attempt.
    _other, other_headers = make_student(db_session, "as-other@example.com", name="Other Student")
    assert client.get(f"/api/v1/assessments/attempts/{attempt['id']}", headers=other_headers).status_code == 404

    submitted = client.post(f"/api/v1/assessments/attempts/{attempt['id']}/submit", headers=headers)
    assert submitted.status_code == 200, submitted.text
    result = submitted.json()
    assert result["correct_count"] == 2
    assert result["total_questions"] == 3
    assert result["score_percent"] == 66.7
    assert result["passed"] is True
    assert result["grade"] == "Credit"
    assert result["answers_revealed"] is True
    assert sum(item["is_correct"] for item in result["review"]) == 2
    assert all(item["correct_key"] == "C" for item in result["review"])

    # Submitting again is harmless, and answers can no longer change.
    assert client.post(f"/api/v1/assessments/attempts/{attempt['id']}/submit", headers=headers).json()["correct_count"] == 2
    assert client.put(
        f"/api/v1/assessments/attempts/{attempt['id']}/answers",
        headers=headers,
        json={"question_id": ids[2], "answer_key": "C"},
    ).status_code == 409

    # max_attempts = 1 is enforced.
    assert client.post(f"/api/v1/assessments/{config['id']}/attempts", headers=headers).status_code == 403


def test_hidden_answers_when_configured(client, db_session):
    _admin, admin_headers = make_admin(db_session)
    _student, headers = make_student(db_session, "as-hidden@example.com")
    course = make_course(db_session)
    add_question(client, admin_headers, course.id, "Only question")
    config = add_config(client, admin_headers, course.id, question_count=1, reveal_answers=False)
    attempt = client.post(f"/api/v1/assessments/{config['id']}/attempts", headers=headers).json()
    result = client.post(f"/api/v1/assessments/attempts/{attempt['id']}/submit", headers=headers).json()
    assert result["answers_revealed"] is False
    assert result["review"] == []


def test_expired_attempt_is_graded_with_saved_answers(client, db_session):
    _admin, admin_headers = make_admin(db_session)
    _student, headers = make_student(db_session, "as-expired@example.com")
    course = make_course(db_session)
    add_question(client, admin_headers, course.id, "Timed question", correct="A")
    config = add_config(client, admin_headers, course.id, question_count=1)
    attempt = client.post(f"/api/v1/assessments/{config['id']}/attempts", headers=headers).json()
    client.put(
        f"/api/v1/assessments/attempts/{attempt['id']}/answers",
        headers=headers,
        json={"question_id": attempt["questions"][0]["id"], "answer_key": "A"},
    )

    row = db_session.get(AssessmentAttempt, attempt["id"])
    row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    db_session.commit()

    reloaded = client.get(f"/api/v1/assessments/attempts/{attempt['id']}", headers=headers).json()
    assert reloaded["status"] == "expired"
    result = client.get(f"/api/v1/assessments/attempts/{attempt['id']}/results", headers=headers).json()
    assert result["correct_count"] == 1
    assert result["status"] == "expired"


def test_subscription_gating_and_anonymous_listing(client, db_session):
    _admin, admin_headers = make_admin(db_session)
    _student, headers = make_student(db_session, "as-locked@example.com")
    course = make_course(db_session)
    add_question(client, admin_headers, course.id, "Paid question")
    config = add_config(client, admin_headers, course.id, question_count=1, requires_subscription=True)

    anonymous = client.get("/api/v1/assessments").json()
    assert anonymous[0]["locked"] is True and anonymous[0]["lock_reason"] == "sign_in_required"

    signed_in = client.get("/api/v1/assessments", headers=headers).json()
    assert signed_in[0]["lock_reason"] == "subscription_required"
    denied = client.post(f"/api/v1/assessments/{config['id']}/attempts", headers=headers)
    assert denied.status_code == 403
    assert "subscription" in denied.json()["detail"].lower()

    # Admins can always preview a test.
    assert client.post(f"/api/v1/assessments/{config['id']}/attempts", headers=admin_headers).status_code == 201


def test_config_draws_only_from_selected_resources_and_topics(client, db_session):
    _admin, admin_headers = make_admin(db_session)
    course = make_course(db_session)
    resource_id = upload_resource(
        client,
        admin_headers,
        content=make_pdf(1),
        filename="2023.pdf",
        mime="application/pdf",
        access_policy="public",
        requires_verification="false",
        course_id=str(course.id),
    )
    add_question(client, admin_headers, course.id, "From the 2023 paper", resource_id=resource_id, topic="Sorting")
    add_question(client, admin_headers, course.id, "Unrelated", topic="Loops")
    add_question(client, admin_headers, course.id, "Also 2023 but loops", resource_id=resource_id, topic="Loops")

    by_resource = add_config(client, admin_headers, course.id, resource_ids=[resource_id])
    assert by_resource["pool_size"] == 2
    by_both = add_config(client, admin_headers, course.id, resource_ids=[resource_id], topics=["sorting"], title="Sorting only")
    assert by_both["pool_size"] == 1

    # A resource from another course is rejected.
    other_course = make_course(db_session, "MTH101")
    mismatch = client.post(
        "/api/v1/admin/assessments/questions",
        headers=admin_headers,
        json={
            "course_id": other_course.id,
            "resource_id": resource_id,
            "text": "Wrong course",
            "options": ["a", "b"],
            "correct_answer": "A",
        },
    )
    assert mismatch.status_code == 422


def test_csv_import_is_all_or_nothing(client, db_session):
    _admin, admin_headers = make_admin(db_session)
    course = make_course(db_session, "COS 102")
    header = "course_code,question,option_a,option_b,option_c,option_d,correct,explanation,topic,difficulty\n"
    good = "cos102,What is O(n)?,Linear,Constant,Log,Quadratic,A,Grows with n,Complexity,easy\n"
    bad = "NOPE999,Orphan question,x,y,,,A,,,\n"

    rejected = client.post(
        "/api/v1/admin/assessments/questions/import",
        headers=admin_headers,
        files={"upload": ("q.csv", (header + good + bad).encode(), "text/csv")},
    )
    assert rejected.status_code == 200
    assert rejected.json()["created"] == 0
    assert "Row 3" in rejected.json()["errors"][0]
    assert client.get("/api/v1/admin/assessments/questions", headers=admin_headers).json() == []

    accepted = client.post(
        "/api/v1/admin/assessments/questions/import",
        headers=admin_headers,
        files={"upload": ("q.csv", (header + good).encode(), "text/csv")},
    )
    assert accepted.json() == {"created": 1, "errors": []}
    stored = client.get("/api/v1/admin/assessments/questions", headers=admin_headers).json()
    assert stored[0]["course_id"] == course.id and stored[0]["correct_key"] == "A"


def test_students_cannot_use_assessment_admin_routes(client, db_session):
    _student, headers = make_student(db_session, "as-nosy@example.com")
    assert client.get("/api/v1/admin/assessments/questions", headers=headers).status_code == 403
    assert client.get("/api/v1/admin/assessments/configs", headers=headers).status_code == 403
