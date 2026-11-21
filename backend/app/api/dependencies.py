from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session
from jwt import InvalidTokenError

from app.core.security import decode_access_token
from app.db.database import get_db
from app.models.user import Role, User

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials are required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        user_id = decode_access_token(credentials.credentials)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured.",
        ) from exc
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive account.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


ROLE_CAPABILITIES: dict[str, set[str]] = {
    "super_admin": {
        "manage_admins",
        "manage_resources",
        "preview_resources",
        "manage_assessments",
        "manage_academic_catalogue",
        "manage_packages",
        "view_payments",
        "review_refunds",
        "manage_verifications",
    },
    "admin": {
        "manage_admins",
        "manage_resources",
        "preview_resources",
        "manage_assessments",
        "manage_academic_catalogue",
        "manage_packages",
        "view_payments",
        "review_refunds",
        "manage_verifications",
    },
    "content_admin": {
        "manage_resources",
        "preview_resources",
        "manage_assessments",
        "manage_academic_catalogue",
    },
    "finance_admin": {
        "manage_packages",
        "view_payments",
        "review_refunds",
    },
    "verification_officer": {
        "manage_verifications",
    },
}

ALL_CAPABILITIES: set[str] = set.union(*ROLE_CAPABILITIES.values())


def get_user_capabilities(user: User, db: Session) -> set[str]:
    if user.is_superuser:
        return set(ALL_CAPABILITIES)
    if not user.role_id:
        return set()
    role = db.get(Role, user.role_id)
    if not role:
        return set()
    return set(ROLE_CAPABILITIES.get(role.name, set()))


def require_capability(capability: str):
    def dependency(
        user: Annotated[User, Depends(get_current_user)],
        db: Annotated[Session, Depends(get_db)],
    ) -> User:
        caps = get_user_capabilities(user, db)
        if capability not in caps:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Administrator capability '{capability}' is required.",
            )
        return user

    return dependency


def get_current_admin(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    caps = get_user_capabilities(user, db)
    if not caps and not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access is required.",
        )
    return user


def get_optional_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User | None:
    """Return the signed-in user, or None for anonymous or invalid tokens."""
    if credentials is None:
        return None
    try:
        user_id = decode_access_token(credentials.credentials)
        user = db.get(User, user_id)
    except Exception:
        return None
    return user if user is not None and user.is_active else None
