import pytest
from datetime import datetime, timedelta, timezone
from fastapi import status
from fastapi.testclient import TestClient

from app.core.security import hash_password, verify_password
from app.models.user import User


def test_password_reset_flow(client: TestClient, db_session):
    """Test full forgot-password and reset-password workflow with OTP."""
    # 1. Create a user
    old_password = "OriginalPassword1234!"
    user = User(
        email="reset.student@sazu.edu.ng",
        full_name="Reset Student",
        password_hash=hash_password(old_password),
        is_active=True,
        email_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    # 2. Forgot password request for non-existent user returns 200 without leaking existence
    non_existent_res = client.post(
        "/api/v1/auth/password/forgot",
        json={"email": "nobody@sazu.edu.ng"},
    )
    assert non_existent_res.status_code == status.HTTP_200_OK
    assert "sent" in non_existent_res.json()["message"].lower()

    # 3. Forgot password request for valid user sets 6-digit OTP and 15-minute expiry
    forgot_res = client.post(
        "/api/v1/auth/password/forgot",
        json={"email": "reset.student@sazu.edu.ng"},
    )
    assert forgot_res.status_code == status.HTTP_200_OK
    db_session.refresh(user)
    assert user.password_reset_code is not None
    assert len(user.password_reset_code) == 6
    assert user.password_reset_expires_at is not None
    valid_code = user.password_reset_code

    # 4. Attempt reset with wrong code
    wrong_code_res = client.post(
        "/api/v1/auth/password/reset",
        json={
            "email": "reset.student@sazu.edu.ng",
            "code": "999999" if valid_code != "999999" else "888888",
            "new_password": "NewSecretPassword1234!",
        },
    )
    assert wrong_code_res.status_code == status.HTTP_400_BAD_REQUEST
    assert "invalid" in wrong_code_res.json()["detail"].lower()

    # 5. Attempt reset with short password (fails validation < 12 chars)
    short_pw_res = client.post(
        "/api/v1/auth/password/reset",
        json={
            "email": "reset.student@sazu.edu.ng",
            "code": valid_code,
            "new_password": "short",
        },
    )
    assert short_pw_res.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    # 6. Attempt reset when code is expired
    user.password_reset_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.commit()
    expired_res = client.post(
        "/api/v1/auth/password/reset",
        json={
            "email": "reset.student@sazu.edu.ng",
            "code": valid_code,
            "new_password": "NewSecretPassword1234!",
        },
    )
    assert expired_res.status_code == status.HTTP_400_BAD_REQUEST
    assert "expired" in expired_res.json()["detail"].lower()

    # 7. Re-request a fresh code
    client.post(
        "/api/v1/auth/password/forgot",
        json={"email": "reset.student@sazu.edu.ng"},
    )
    db_session.refresh(user)
    new_code = user.password_reset_code
    assert new_code is not None

    # 8. Reset successfully with valid code and new password
    new_password = "BrandNewPassword123456!"
    success_res = client.post(
        "/api/v1/auth/password/reset",
        json={
            "email": "reset.student@sazu.edu.ng",
            "code": new_code,
            "new_password": new_password,
        },
    )
    assert success_res.status_code == status.HTTP_200_OK
    assert "successfully reset" in success_res.json()["message"].lower()

    # 9. Verify database state: code & expiry cleared, hash updated
    db_session.refresh(user)
    assert user.password_reset_code is None
    assert user.password_reset_expires_at is None
    assert verify_password(new_password, user.password_hash)

    # 10. Login with old password fails
    old_login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "reset.student@sazu.edu.ng", "password": old_password},
    )
    assert old_login_res.status_code == status.HTTP_401_UNAUTHORIZED

    # 11. Login with new password succeeds
    new_login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "reset.student@sazu.edu.ng", "password": new_password},
    )
    assert new_login_res.status_code == status.HTTP_200_OK
    assert "access_token" in new_login_res.json()

    # 12. Reusing the reset code fails
    reuse_res = client.post(
        "/api/v1/auth/password/reset",
        json={
            "email": "reset.student@sazu.edu.ng",
            "code": new_code,
            "new_password": "AnotherNewPassword123!",
        },
    )
    assert reuse_res.status_code == status.HTTP_400_BAD_REQUEST
