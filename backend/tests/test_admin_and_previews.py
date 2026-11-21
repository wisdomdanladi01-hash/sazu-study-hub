import io
from app.core.security import create_access_token
from app.models.resource import Resource
from app.models.user import Role, User


def create_test_admin(db_session):
    role = db_session.query(Role).filter_by(name="admin").first()
    if not role:
        role = Role(name="admin", description="Admin")
        db_session.add(role)
        db_session.flush()
    admin = User(
        email="test-admin-preview@example.com",
        full_name="Admin Preview Tester",
        password_hash="hash",
        role_id=role.id,
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    return admin, create_access_token(admin.id)


def create_test_student(db_session):
    student = User(
        email="test-student-preview@example.com",
        full_name="Student Preview Tester",
        password_hash="hash",
        is_active=True,
    )
    db_session.add(student)
    db_session.commit()
    return student, create_access_token(student.id)


def test_admin_overview_requires_admin(client, db_session):
    # Unauthenticated
    resp = client.get("/api/v1/admin/academic/overview")
    assert resp.status_code == 401

    # Student
    _, student_token = create_test_student(db_session)
    resp = client.get(
        "/api/v1/admin/academic/overview",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert resp.status_code == 403

    # Admin
    _, admin_token = create_test_admin(db_session)
    resp = client.get(
        "/api/v1/admin/academic/overview",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "metrics" in data
    assert "total_faculties" in data["metrics"]
    assert "total_resources" in data["metrics"]
    assert "recent_resources" in data


def test_resource_preview_policy_flow(client, db_session):
    _, admin_token = create_test_admin(db_session)
    _, student_token = create_test_student(db_session)

    # 1. Upload a resource with preview_policy="none" and access_policy="subscription_or_entitlement"
    pdf_bytes = b"%PDF-1.4 dummy pdf content for testing previews"
    upload_resp = client.post(
        "/api/v1/admin/resources",
        headers={"Authorization": f"Bearer {admin_token}"},
        data={
            "title": "CSC206 Data Structures Notes",
            "description": "Comprehensive notes",
            "is_published": "true",
            "access_policy": "subscription_or_entitlement",
            "preview_policy": "none",
        },
        files={"upload": ("csc206.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
    )
    assert upload_resp.status_code == 201
    res_id = upload_resp.json()["id"]

    # Public visitor checks preview -> preview not available
    prev_resp = client.get(f"/api/v1/resources/{res_id}/preview")
    assert prev_resp.status_code == 200
    assert prev_resp.json()["preview_available"] is False
    assert prev_resp.json()["preview_policy"] == "none"

    # Streaming file via preview endpoint must be denied because it's restricted
    file_resp = client.get(f"/api/v1/resources/{res_id}/preview/file")
    assert file_resp.status_code in (401, 403)  # anonymous callers are asked to sign in

    # 2. Update resource to preview_policy="authenticated_only" with sample excerpt
    patch_resp = client.patch(
        f"/api/v1/admin/resources/{res_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "preview_policy": "authenticated_only",
            "preview_content": "Chapter 1: Stacks and Queues overview...",
        },
    )
    assert patch_resp.status_code == 200

    # Public visitor -> rejected with 401
    prev_unauth = client.get(f"/api/v1/resources/{res_id}/preview")
    assert prev_unauth.status_code == 401

    # Authenticated student -> preview returned
    prev_auth = client.get(
        f"/api/v1/resources/{res_id}/preview",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert prev_auth.status_code == 200
    data = prev_auth.json()
    assert data["preview_available"] is True
    assert data["preview_type"] == "text"
    assert "Stacks and Queues" in data["preview_content"]

    # 3. Update resource to preview_policy="public_sample"
    client.patch(
        f"/api/v1/admin/resources/{res_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"preview_policy": "public_sample"},
    )
    # Now public visitor can view sample preview without signing in
    prev_pub = client.get(f"/api/v1/resources/{res_id}/preview")
    assert prev_pub.status_code == 200
    assert prev_pub.json()["preview_available"] is True
    assert "Stacks and Queues" in prev_pub.json()["preview_content"]

