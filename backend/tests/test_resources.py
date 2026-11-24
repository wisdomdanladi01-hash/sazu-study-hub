from sqlalchemy import select

from app.core.private_storage import resolve_private_storage_key
from app.core.security import create_access_token
from app.models.academic import AcademicLevel, StudentAcademicProfile
from app.models.audit import AuditEvent
from app.models.commerce import AccessPackage, Entitlement, PackageResource, Payment
from app.models.resource import Resource
from app.models.user import Role, User


def create_admin(db_session):
    role = Role(name="admin", description="Resource administrator")
    db_session.add(role)
    db_session.flush()
    admin = User(
        email="resource-admin@example.com",
        full_name="Resource Administrator",
        password_hash="unused-password-hash",
        role_id=role.id,
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    return admin, create_access_token(admin.id)


def create_student(db_session, *, verified: bool = False):
    student = User(
        email="resource-student@example.com",
        full_name="Resource Student",
        password_hash="unused-password-hash",
        is_active=True,
    )
    db_session.add(student)
    db_session.flush()
    if verified:
        level = AcademicLevel(code="100", name="100 Level", sort_order=100)
        db_session.add(level)
        db_session.flush()
        db_session.add(
            StudentAcademicProfile(
                user_id=student.id,
                jamb_registration_number=f"JAMB-VERIFIED-{student.id}",
                verified_level_id=level.id,
            )
        )
    db_session.commit()
    return student, create_access_token(student.id)


def test_admin_can_create_publish_download_and_delete_resource(client, db_session):
    admin, admin_token = create_admin(db_session)
    student, student_token = create_student(db_session)

    category_response = client.post(
        "/api/v1/admin/resources/categories",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": "Lecture notes", "description": "Course materials"},
    )
    assert category_response.status_code == 201
    category_id = category_response.json()["id"]
    listed_categories = client.get(
        "/api/v1/resources/categories",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert listed_categories.status_code == 200, listed_categories.text
    assert [category["id"] for category in listed_categories.json()] == [category_id]

    upload_response = client.post(
        "/api/v1/admin/resources",
        headers={"Authorization": f"Bearer {admin_token}"},
        data={
            "title": "Introduction to testing",
            "category_id": str(category_id),
            "is_published": "true",
            "access_policy": "public",
            "requires_verification": "false",
        },
        files={"upload": ("testing.pdf", b"%PDF-1.7 sample resource", "application/pdf")},
    )
    assert upload_response.status_code == 201, upload_response.text
    resource_id = upload_response.json()["id"]
    update_response = client.patch(
        f"/api/v1/admin/resources/{resource_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"description": "A searchable resource"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["description"] == "A searchable resource"

    resource = db_session.get(Resource, resource_id)
    assert resource is not None
    stored_path = resolve_private_storage_key(resource.storage_path)
    assert stored_path.is_file()

    student_headers = {"Authorization": f"Bearer {student_token}"}
    browse_response = client.get("/api/v1/resources", headers=student_headers)
    assert browse_response.status_code == 200
    assert [item["id"] for item in browse_response.json()["items"]] == [resource_id]
    search_response = client.get(
        "/api/v1/resources",
        headers=student_headers,
        params={"search": "searchable", "category_id": category_id},
    )
    assert [item["id"] for item in search_response.json()["items"]] == [resource_id]

    download_response = client.get(
        f"/api/v1/resources/{resource_id}/download", headers=student_headers
    )
    assert download_response.status_code == 200
    assert download_response.content == b"%PDF-1.7 sample resource"

    replacement_response = client.post(
        f"/api/v1/admin/resources/{resource_id}/file",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"upload": ("updated.pdf", b"%PDF-1.7 updated resource", "application/pdf")},
    )
    assert replacement_response.status_code == 200, replacement_response.text
    assert not stored_path.exists()
    db_session.refresh(resource)
    replacement_path = resolve_private_storage_key(resource.storage_path)
    assert replacement_path.is_file()

    audit = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.actor_user_id == admin.id,
            AuditEvent.action == "admin.resource_file_replaced",
            AuditEvent.target_id == str(resource_id),
        )
    )
    assert audit is not None

    delete_response = client.delete(
        f"/api/v1/admin/resources/{resource_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert delete_response.status_code == 204
    assert not replacement_path.exists()
    assert db_session.get(Resource, resource_id) is None


def test_students_cannot_manage_resources_and_cannot_download_unpublished_files(
    client, db_session
):
    _student, student_token = create_student(db_session)
    headers = {"Authorization": f"Bearer {student_token}"}

    denied_upload = client.post(
        "/api/v1/admin/resources",
        headers=headers,
        data={"title": "Restricted"},
        files={"upload": ("restricted.pdf", b"%PDF-1.7 restricted", "application/pdf")},
    )
    assert denied_upload.status_code == 403

    admin, admin_token = create_admin(db_session)
    created = client.post(
        "/api/v1/admin/resources",
        headers={"Authorization": f"Bearer {admin_token}"},
        data={
            "title": "Draft",
            "is_published": "false",
            "access_policy": "public",
            "requires_verification": "false",
        },
        files={"upload": ("draft.pdf", b"%PDF-1.7 draft", "application/pdf")},
    )
    assert created.status_code == 201, created.text

    resource_id = created.json()["id"]
    assert client.get("/api/v1/resources", headers=headers).json() == {"items": [], "total": 0}
    denied_download = client.get(
        f"/api/v1/resources/{resource_id}/download", headers=headers
    )
    assert denied_download.status_code == 404
    admin_view = client.get(
        f"/api/v1/resources/{resource_id}",
        headers={"Authorization": f"Bearer {create_access_token(admin.id)}"},
    )
    assert admin_view.status_code == 200


def test_nonpublic_download_requires_student_verification(client, db_session):
    _admin, admin_token = create_admin(db_session)
    _student, student_token = create_student(db_session, verified=False)
    upload = client.post(
        "/api/v1/admin/resources",
        headers={"Authorization": f"Bearer {admin_token}"},
        data={
            "title": "Verified notes",
            "is_published": "true",
            "access_policy": "public",
            "requires_verification": "true",
        },
        files={"upload": ("verified.pdf", b"%PDF-1.7 verified", "application/pdf")},
    )
    assert upload.status_code == 201, upload.text

    response = client.get(
        f"/api/v1/resources/{upload.json()['id']}/download",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert response.status_code == 403


def test_resource_upload_rejects_mismatched_file_type(client, db_session):
    _admin, admin_token = create_admin(db_session)
    response = client.post(
        "/api/v1/admin/resources",
        headers={"Authorization": f"Bearer {admin_token}"},
        data={"title": "Invalid file"},
        files={"upload": ("invalid.pdf", b"not a pdf", "application/pdf")},
    )
    assert response.status_code == 415


def test_resource_upload_enforces_configured_size_limit(
    client, db_session, monkeypatch
):
    _admin, admin_token = create_admin(db_session)
    from app.core.config import settings

    monkeypatch.setattr(settings, "resource_max_bytes", 8)
    response = client.post(
        "/api/v1/admin/resources",
        headers={"Authorization": f"Bearer {admin_token}"},
        data={"title": "Oversized resource"},
        files={"upload": ("large.pdf", b"%PDF-1.7 too large", "application/pdf")},
    )
    assert response.status_code == 413


def test_entitlement_only_resource_requires_successful_matching_purchase(
    client, db_session
):
    _admin, admin_token = create_admin(db_session)
    student, student_token = create_student(db_session, verified=True)
    upload = client.post(
        "/api/v1/admin/resources",
        headers={"Authorization": f"Bearer {admin_token}"},
        data={
            "title": "Purchased notes",
            "is_published": "true",
            "access_policy": "entitlement_only",
            "requires_verification": "true",
        },
        files={"upload": ("purchased.pdf", b"%PDF-1.7 purchased", "application/pdf")},
    )
    assert upload.status_code == 201, upload.text
    resource_id = upload.json()["id"]
    student_headers = {"Authorization": f"Bearer {student_token}"}
    denied = client.get(
        f"/api/v1/resources/{resource_id}/download", headers=student_headers
    )
    assert denied.status_code == 403

    resource = db_session.get(Resource, resource_id)
    assert resource is not None
    package = AccessPackage(
        name="Purchased notes package",
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
        idempotency_key="resource-entitlement-test",
        status="succeeded",
        amount_minor=500,
        currency="NGN",
    )
    db_session.add(payment)
    db_session.flush()
    db_session.add_all(
        [
            PackageResource(package_id=package.id, resource_id=resource.id),
            Entitlement(
                user_id=student.id,
                payment_id=payment.id,
                scope_key=f"package:{package.id}:student:{student.id}",
                package_id=package.id,
            ),
        ]
    )
    db_session.commit()

    allowed = client.get(
        f"/api/v1/resources/{resource_id}/download", headers=student_headers
    )
    assert allowed.status_code == 200
    assert allowed.content == b"%PDF-1.7 purchased"


def test_advanced_resource_search_mechanism(client, db_session):
    """Test searching for materials with spaceless, spaced, and fuzzy course codes."""
    from app.models.academic import Course, Department, Faculty, Institution

    inst = Institution(name="Sa'adu Zungur University", code="SAZU")
    db_session.add(inst)
    db_session.flush()
    fac = Faculty(name="Faculty of Science", code="FSC", institution_id=inst.id)
    db_session.add(fac)
    db_session.flush()
    dept = Department(name="Biological Sciences", code="BIO", faculty_id=fac.id)
    db_session.add(dept)
    db_session.flush()
    course = Course(
        department_id=dept.id,
        code="BIO101",
        title="Introductory Biology",
        is_active=True,
    )
    db_session.add(course)
    db_session.commit()

    admin, admin_token = create_admin(db_session)
    upload = client.post(
        "/api/v1/admin/resources",
        headers={"Authorization": f"Bearer {admin_token}"},
        data={
            "title": "General Cell Biology Notes",
            "is_published": "true",
            "course_id": str(course.id),
            "access_policy": "public",
        },
        files={"upload": ("bio101_notes.pdf", b"%PDF-1.7 biology", "application/pdf")},
    )
    assert upload.status_code == 201, upload.text
    res_id = upload.json()["id"]

    # 1. Search with space "bio 101" matches course code BIO101
    res1 = client.get("/api/v1/resources?search=bio 101")
    assert res1.status_code == 200, res1.text
    data1 = res1.json()
    items1 = data1.get("items", data1 if isinstance(data1, list) else [])
    assert any(item["id"] == res_id for item in items1)

    # 2. Search without space "BIO101" matches
    res2 = client.get("/api/v1/resources?search=BIO101")
    assert res2.status_code == 200
    data2 = res2.json()
    items2 = data2.get("items", data2 if isinstance(data2, list) else [])
    assert any(item["id"] == res_id for item in items2)

    # 3. Multi-term search "biology 101" matches course title + code
    res3 = client.get("/api/v1/resources?search=biology 101")
    assert res3.status_code == 200
    data3 = res3.json()
    items3 = data3.get("items", data3 if isinstance(data3, list) else [])
    assert any(item["id"] == res_id for item in items3)

