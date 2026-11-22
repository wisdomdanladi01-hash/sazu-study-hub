from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password
from app.models.user import User


def test_profile_update_and_weekly_cooldown(client: TestClient, db_session: Session):
    # 1. Create a student user
    email = f"student_cooldown_{datetime.now(timezone.utc).timestamp()}@sazu.edu.ng"
    user = User(
        email=email,
        full_name="Original Name",
        password_hash=hash_password("ComplexPass123!"),
        is_active=True,
        is_superuser=False,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    token = create_access_token(user.id)
    headers = {"Authorization": f"Bearer {token}"}

    # Verify initial /me state
    res = client.get("/api/v1/auth/me", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["can_edit_profile_now"] is True
    assert data["nickname"] is None

    # First update: succeed and set cooldown
    update_res = client.patch(
        "/api/v1/auth/me",
        headers=headers,
        json={"full_name": "Updated Name", "nickname": "CoolNick"},
    )
    assert update_res.status_code == 200
    updated_data = update_res.json()
    assert updated_data["full_name"] == "Updated Name"
    assert updated_data["nickname"] == "CoolNick"
    assert updated_data["can_edit_profile_now"] is False
    assert updated_data["next_profile_edit_at"] is not None

    # Immediate second update: should be rejected by 7-day cooldown
    fail_res = client.patch(
        "/api/v1/auth/me",
        headers=headers,
        json={"full_name": "Try Again So Soon", "nickname": "NoWay"},
    )
    assert fail_res.status_code == 422
    assert "Profiles can only be edited once every 7 days" in fail_res.json()["detail"]

    # Superuser can bypass cooldown
    admin_user = User(
        email=f"admin_{datetime.now(timezone.utc).timestamp()}@sazu.edu.ng",
        full_name="Admin Name",
        password_hash=hash_password("ComplexPass123!"),
        is_active=True,
        is_superuser=True,
        last_profile_edit_at=datetime.now(timezone.utc),
    )
    db_session.add(admin_user)
    db_session.commit()
    db_session.refresh(admin_user)

    admin_token = create_access_token(admin_user.id)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    admin_update_res = client.patch(
        "/api/v1/auth/me",
        headers=admin_headers,
        json={"full_name": "Admin New Name", "nickname": "ChiefAdmin"},
    )
    assert admin_update_res.status_code == 200
    assert admin_update_res.json()["full_name"] == "Admin New Name"


def test_avatar_upload(client: TestClient, db_session: Session):
    user = User(
        email=f"avatar_user_{datetime.now(timezone.utc).timestamp()}@sazu.edu.ng",
        full_name="Avatar User",
        password_hash=hash_password("ComplexPass123!"),
        is_active=True,
        is_superuser=False,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    token = create_access_token(user.id)
    headers = {"Authorization": f"Bearer {token}"}

    # Upload valid PNG avatar
    dummy_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    files = {"file": ("avatar.png", dummy_png, "image/png")}

    res = client.post("/api/v1/auth/me/avatar", headers=headers, files=files)
    assert res.status_code == 200
    data = res.json()
    assert data["avatar_url"].startswith("data:image/png;base64,")

    # Upload invalid file type
    bad_files = {"file": ("malicious.exe", b"MZ...", "application/x-msdownload")}
    bad_res = client.post("/api/v1/auth/me/avatar", headers=headers, files=bad_files)
    assert bad_res.status_code == 415
