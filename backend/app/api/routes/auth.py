import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.dependencies import (
    ROLE_CAPABILITIES,
    get_current_admin,
    get_current_user,
    get_user_capabilities,
    require_capability,
)
from app.core.security import (
    burn_password_check,
    create_access_token,
    hash_password,
    require_jwt_secret,
    verify_password,
)
from app.core.config import settings
from app.core.rate_limit import enforce_auth_rate_limit
from app.db.database import get_db
from app.models.audit import AuditEvent
from app.models.user import Role, User
from app.schemas.auth import (
    AccessTokenResponse,
    AdminRoleUpdate,
    AdminUserCreate,
    AdminUserResponse,
    EmailVerificationCodeRequest,
    EmailVerificationSendResponse,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    ResetPasswordRequest,
    RoleResponse,
    StudentRegistration,
    UserProfileUpdate,
    UserResponse,
)
from app.services.email import is_email_configured, send_email_otp, send_password_reset_otp
from app.services.errors import ConflictError, PolicyError
from app.services.verification import register_student

router = APIRouter(prefix="/auth", tags=["authentication"])
admin_router = APIRouter(prefix="/admin", tags=["admin management"])
logger = logging.getLogger(__name__)


def _auth_unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Authentication is not configured. Set a secure JWT_SECRET_KEY.",
    )


def _user_response(user: User, db: Session) -> UserResponse:
    role_name = db.scalar(select(Role.name).where(Role.id == user.role_id)) if user.role_id else None
    caps = sorted(get_user_capabilities(user, db))
    is_admin = bool(user.is_superuser or (role_name and role_name in ROLE_CAPABILITIES))

    now = datetime.now(timezone.utc)
    can_edit = True
    next_edit = None
    if not user.is_superuser and user.last_profile_edit_at:
        last_edit = user.last_profile_edit_at
        if last_edit.tzinfo is None:
            last_edit = last_edit.replace(tzinfo=timezone.utc)
        cutoff = last_edit + timedelta(days=7)
        if now < cutoff:
            can_edit = False
            next_edit = cutoff

    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        nickname=getattr(user, "nickname", None),
        avatar_url=getattr(user, "avatar_url", None),
        last_profile_edit_at=getattr(user, "last_profile_edit_at", None),
        can_edit_profile_now=can_edit,
        next_profile_edit_at=next_edit,
        is_active=user.is_active,
        is_admin=is_admin,
        is_superuser=user.is_superuser,
        role=role_name or ("admin" if is_admin else "student"),
        email_verified=bool(getattr(user, "email_verified", False)),
        permissions=caps,
    )


@router.post(
    "/register",
    response_model=AccessTokenResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    data: StudentRegistration,
    _request: Request,
    db: Session = Depends(get_db),
) -> AccessTokenResponse:
    enforce_auth_rate_limit(_request)
    try:
        require_jwt_secret()
    except ValueError as exc:
        raise _auth_unavailable() from exc

    try:
        user, _submission = register_student(db, data)
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except PolicyError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Database error while registering a student.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Registration is temporarily unavailable because the database could not be reached. Check DATABASE_URL and PostgreSQL.",
        ) from exc
    return AccessTokenResponse(access_token=create_access_token(user.id))


@router.get("/login", include_in_schema=False)
def login_get_redirect():
    """If visited via browser URL bar (GET request), redirect to the frontend login interface."""
    return RedirectResponse(url="/login")


@router.post("/login", response_model=AccessTokenResponse)
def login(
    data: LoginRequest,
    _request: Request,
    db: Session = Depends(get_db),
) -> AccessTokenResponse:
    enforce_auth_rate_limit(_request)
    try:
        require_jwt_secret()
    except ValueError as exc:
        raise _auth_unavailable() from exc

    email = str(data.email).strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        burn_password_check(data.password)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not verify_password(data.password, user.password_hash) or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return AccessTokenResponse(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserResponse)
def read_current_user(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserResponse:
    return _user_response(user, db)


@router.patch("/me", response_model=UserResponse)
def update_current_user_profile(
    data: UserProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserResponse:
    now = datetime.now(timezone.utc)
    if not user.is_superuser and user.last_profile_edit_at:
        last_edit = user.last_profile_edit_at
        if last_edit.tzinfo is None:
            last_edit = last_edit.replace(tzinfo=timezone.utc)
        cutoff = last_edit + timedelta(days=7)
        if now < cutoff:
            remaining_days = max(1, (cutoff.date() - now.date()).days)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Profiles can only be edited once every 7 days. Next edit available in {remaining_days} day(s) on {cutoff.strftime('%b %d, %Y')}.",
            )

    updated = False
    if data.full_name is not None and data.full_name.strip() and data.full_name.strip() != user.full_name:
        user.full_name = data.full_name.strip()
        updated = True
    if data.nickname is not None and data.nickname.strip() != (user.nickname or ""):
        user.nickname = data.nickname.strip() or None
        updated = True
    if data.avatar_url is not None and data.avatar_url.strip() != (user.avatar_url or ""):
        user.avatar_url = data.avatar_url.strip() or None
        updated = True

    if updated:
        user.last_profile_edit_at = now
        db.add(
            AuditEvent(
                actor_user_id=user.id,
                action="user.profile_updated",
                target_type="user",
                target_id=str(user.id),
                event_metadata={
                    "full_name": user.full_name,
                    "nickname": user.nickname,
                    "has_avatar": bool(user.avatar_url),
                },
            )
        )
        db.commit()
        db.refresh(user)

    return _user_response(user, db)


@router.post("/me/avatar", response_model=UserResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserResponse:
    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    content_type = (file.content_type or "").lower()
    if content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only JPEG, PNG, and WebP images are supported for profile avatars.",
        )
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Avatar image size cannot exceed 5 MB.",
        )
    import base64
    b64 = base64.b64encode(content).decode("utf-8")
    data_uri = f"data:{content_type};base64,{b64}"
    user.avatar_url = data_uri
    user.last_profile_edit_at = datetime.now(timezone.utc)
    db.add(
        AuditEvent(
            actor_user_id=user.id,
            action="user.avatar_updated",
            target_type="user",
            target_id=str(user.id),
            event_metadata={"size_bytes": len(content), "mime_type": content_type},
        )
    )
    db.commit()
    db.refresh(user)
    return _user_response(user, db)


@router.post("/email/send-code", response_model=EmailVerificationSendResponse)
def send_email_verification_code(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EmailVerificationSendResponse:
    """Generate and dispatch a 6-digit email verification OTP."""
    code = f"{secrets.randbelow(900000) + 100000}"
    user.email_verification_code = code
    user.email_verification_expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
    db.commit()

    dev_mode = (settings.app_env != "production") or (not is_email_configured())
    email_sent = send_email_otp(user.email, user.full_name, code)
    if not email_sent and not dev_mode:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Email provider (Brevo) rejected the dispatch. Please ensure BREVO_API_KEY is an API Key (starts with xkeysib-) from Brevo -> SMTP & API -> API Keys tab, and the sender email is verified in Brevo.",
        )

    return EmailVerificationSendResponse(
        message=f"A 6-digit verification code has been sent to {user.email}.",
        email=user.email,
        expires_in_minutes=15,
        dev_code=code if dev_mode else None,
    )


@router.post("/email/verify", response_model=UserResponse)
def verify_email_code(
    data: EmailVerificationCodeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserResponse:
    """Verify the 6-digit email OTP and mark the user's email as confirmed."""
    now = datetime.now(timezone.utc)
    exp = user.email_verification_expires_at
    if exp is not None and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if (
        not user.email_verification_code
        or not exp
        or exp <= now
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The verification code has expired or was not requested. Please request a new code.",
        )

    if user.email_verification_code.strip() != data.code.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code. Please check and try again.",
        )

    user.email_verified = True
    user.email_verification_code = None
    user.email_verification_expires_at = None

    db.add(
        AuditEvent(
            actor_user_id=user.id,
            action="user.email_verified",
            target_type="user",
            target_id=str(user.id),
            event_metadata={"email": user.email},
        )
    )
    db.commit()
    db.refresh(user)

    return _user_response(user, db)


@router.post("/password/forgot", response_model=MessageResponse)
def forgot_password(
    data: ForgotPasswordRequest,
    _request: Request,
    db: Session = Depends(get_db),
) -> MessageResponse:
    """Request a 6-digit password reset OTP to be sent via Brevo/email."""
    enforce_auth_rate_limit(_request)
    email = str(data.email).strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if user and user.is_active:
        code = f"{secrets.randbelow(900000) + 100000}"
        user.password_reset_code = code
        user.password_reset_expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
        db.commit()
        send_password_reset_otp(user.email, user.full_name, code)

    return MessageResponse(
        message="If an account exists with that email address, a 6-digit password reset code has been sent."
    )


@router.post("/password/reset", response_model=MessageResponse)
def reset_password(
    data: ResetPasswordRequest,
    _request: Request,
    db: Session = Depends(get_db),
) -> MessageResponse:
    """Verify the 6-digit OTP and reset account password."""
    enforce_auth_rate_limit(_request)
    email = str(data.email).strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid email or password reset code.",
        )

    now = datetime.now(timezone.utc)
    exp = user.password_reset_expires_at
    if exp is not None and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if (
        not user.password_reset_code
        or not exp
        or exp <= now
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The password reset code has expired. Please request a new code.",
        )

    if user.password_reset_code.strip() != data.code.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid password reset code. Please check and try again.",
        )

    user.password_hash = hash_password(data.new_password)
    user.password_reset_code = None
    user.password_reset_expires_at = None
    db.add(
        AuditEvent(
            actor_user_id=user.id,
            action="user.password_reset",
            target_type="user",
            target_id=str(user.id),
            event_metadata={"email": user.email},
        )
    )
    db.commit()
    return MessageResponse(
        message="Your password has been successfully reset. You can now log in with your new password."
    )


# Admin User & Role Management (Super Admin only for role assignments)

@admin_router.get("/roles", response_model=list[RoleResponse])
def list_admin_roles(
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> list[RoleResponse]:
    roles = db.scalars(select(Role).order_by(Role.id)).all()
    return [RoleResponse(id=r.id, name=r.name, description=r.description) for r in roles]


@admin_router.get("/users", response_model=list[AdminUserResponse])
def list_admin_users(
    _admin: User = Depends(require_capability("manage_admins")),
    db: Session = Depends(get_db),
) -> list[AdminUserResponse]:
    users = db.scalars(
        select(User)
        .where((User.is_superuser.is_(True)) | (User.role_id.is_not(None)))
        .order_by(User.id)
    ).all()
    results = []
    for u in users:
        role_name = db.scalar(select(Role.name).where(Role.id == u.role_id)) if u.role_id else None
        caps = sorted(get_user_capabilities(u, db))
        results.append(
            AdminUserResponse(
                id=u.id,
                email=u.email,
                full_name=u.full_name,
                is_active=u.is_active,
                is_superuser=u.is_superuser,
                role=role_name or ("super_admin" if u.is_superuser else None),
                permissions=caps,
                created_at=u.created_at.isoformat(),
            )
        )
    return results


@admin_router.post("/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
def create_admin_user(
    data: AdminUserCreate,
    admin: User = Depends(require_capability("manage_admins")),
    db: Session = Depends(get_db),
) -> AdminUserResponse:
    email = data.email.strip().lower()
    existing = db.scalar(select(User.id).where(User.email == email))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account already exists for this email address.",
        )
    role = db.scalar(select(Role).where(Role.name == data.role_name))
    if not role and not data.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Role '{data.role_name}' does not exist.",
        )
    new_user = User(
        email=email,
        full_name=data.full_name.strip(),
        password_hash=hash_password(data.password),
        is_active=True,
        is_superuser=data.is_superuser,
        role_id=role.id if role else None,
    )
    db.add(new_user)
    db.flush()
    db.add(
        AuditEvent(
            actor_user_id=admin.id,
            action="admin.admin_account_created",
            target_type="user",
            target_id=str(new_user.id),
            event_metadata={"role": data.role_name, "is_superuser": data.is_superuser},
        )
    )
    db.commit()
    db.refresh(new_user)
    caps = sorted(get_user_capabilities(new_user, db))
    return AdminUserResponse(
        id=new_user.id,
        email=new_user.email,
        full_name=new_user.full_name,
        is_active=new_user.is_active,
        is_superuser=new_user.is_superuser,
        role=data.role_name if role else ("super_admin" if new_user.is_superuser else None),
        permissions=caps,
        created_at=new_user.created_at.isoformat(),
    )


@admin_router.patch("/users/{user_id}/role", response_model=AdminUserResponse)
def update_admin_user_role(
    user_id: int,
    data: AdminRoleUpdate,
    admin: User = Depends(require_capability("manage_admins")),
    db: Session = Depends(get_db),
) -> AdminUserResponse:
    target_user = db.get(User, user_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if data.role_name is not None:
        role = db.scalar(select(Role).where(Role.name == data.role_name))
        if not role:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Role '{data.role_name}' does not exist.",
            )
        target_user.role_id = role.id
    if data.is_superuser is not None:
        target_user.is_superuser = data.is_superuser
    if data.is_active is not None:
        target_user.is_active = data.is_active

    db.add(
        AuditEvent(
            actor_user_id=admin.id,
            action="admin.role_assigned",
            target_type="user",
            target_id=str(target_user.id),
            event_metadata={
                "role": data.role_name,
                "is_superuser": data.is_superuser,
                "is_active": data.is_active,
            },
        )
    )
    db.commit()
    db.refresh(target_user)
    role_name = db.scalar(select(Role.name).where(Role.id == target_user.role_id)) if target_user.role_id else None
    caps = sorted(get_user_capabilities(target_user, db))
    return AdminUserResponse(
        id=target_user.id,
        email=target_user.email,
        full_name=target_user.full_name,
        is_active=target_user.is_active,
        is_superuser=target_user.is_superuser,
        role=role_name or ("super_admin" if target_user.is_superuser else None),
        permissions=caps,
        created_at=target_user.created_at.isoformat(),
    )



@router.patch("/me", response_model=UserResponse)
def update_current_user(
    data: UserProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserResponse:
    email = str(data.email).strip().lower()
    full_name = " ".join(data.full_name.split())
    existing = db.scalar(select(User.id).where(User.email == email, User.id != user.id))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account already exists for this email address.",
        )
    user.email = email
    user.full_name = full_name
    try:
        db.commit()
        db.refresh(user)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Database error while updating a student profile.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Profile update is temporarily unavailable.",
        ) from exc
    return _user_response(user, db)


# Admin User & Role Management (Super Admin only for role assignments)

@admin_router.get("/roles", response_model=list[RoleResponse])
def list_admin_roles(
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> list[RoleResponse]:
    roles = db.scalars(select(Role).order_by(Role.id)).all()
    return [RoleResponse(id=r.id, name=r.name, description=r.description) for r in roles]


@admin_router.get("/users", response_model=list[AdminUserResponse])
def list_admin_users(
    _admin: User = Depends(require_capability("manage_admins")),
    db: Session = Depends(get_db),
) -> list[AdminUserResponse]:
    users = db.scalars(
        select(User)
        .where((User.is_superuser.is_(True)) | (User.role_id.is_not(None)))
        .order_by(User.id)
    ).all()
    results = []
    for u in users:
        role_name = db.scalar(select(Role.name).where(Role.id == u.role_id)) if u.role_id else None
        caps = sorted(get_user_capabilities(u, db))
        results.append(
            AdminUserResponse(
                id=u.id,
                email=u.email,
                full_name=u.full_name,
                is_active=u.is_active,
                is_superuser=u.is_superuser,
                role=role_name or ("super_admin" if u.is_superuser else None),
                permissions=caps,
                created_at=u.created_at.isoformat(),
            )
        )
    return results


@admin_router.post("/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
def create_admin_user(
    data: AdminUserCreate,
    admin: User = Depends(require_capability("manage_admins")),
    db: Session = Depends(get_db),
) -> AdminUserResponse:
    email = data.email.strip().lower()
    existing = db.scalar(select(User.id).where(User.email == email))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account already exists for this email address.",
        )
    role = db.scalar(select(Role).where(Role.name == data.role_name))
    if not role and not data.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Role '{data.role_name}' does not exist.",
        )
    new_user = User(
        email=email,
        full_name=data.full_name.strip(),
        password_hash=hash_password(data.password),
        is_active=True,
        is_superuser=data.is_superuser,
        role_id=role.id if role else None,
    )
    db.add(new_user)
    db.flush()
    db.add(
        AuditEvent(
            actor_user_id=admin.id,
            action="admin.admin_account_created",
            target_type="user",
            target_id=str(new_user.id),
            event_metadata={"role": data.role_name, "is_superuser": data.is_superuser},
        )
    )
    db.commit()
    db.refresh(new_user)
    caps = sorted(get_user_capabilities(new_user, db))
    return AdminUserResponse(
        id=new_user.id,
        email=new_user.email,
        full_name=new_user.full_name,
        is_active=new_user.is_active,
        is_superuser=new_user.is_superuser,
        role=data.role_name if role else ("super_admin" if new_user.is_superuser else None),
        permissions=caps,
        created_at=new_user.created_at.isoformat(),
    )


@admin_router.patch("/users/{user_id}/role", response_model=AdminUserResponse)
def update_admin_user_role(
    user_id: int,
    data: AdminRoleUpdate,
    admin: User = Depends(require_capability("manage_admins")),
    db: Session = Depends(get_db),
) -> AdminUserResponse:
    target_user = db.get(User, user_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if data.role_name is not None:
        role = db.scalar(select(Role).where(Role.name == data.role_name))
        if not role:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Role '{data.role_name}' does not exist.",
            )
        target_user.role_id = role.id
    if data.is_superuser is not None:
        target_user.is_superuser = data.is_superuser
    if data.is_active is not None:
        target_user.is_active = data.is_active

    db.add(
        AuditEvent(
            actor_user_id=admin.id,
            action="admin.role_assigned",
            target_type="user",
            target_id=str(target_user.id),
            event_metadata={
                "role": data.role_name,
                "is_superuser": data.is_superuser,
                "is_active": data.is_active,
            },
        )
    )
    db.commit()
    db.refresh(target_user)
    role_name = db.scalar(select(Role.name).where(Role.id == target_user.role_id)) if target_user.role_id else None
    caps = sorted(get_user_capabilities(target_user, db))
    return AdminUserResponse(
        id=target_user.id,
        email=target_user.email,
        full_name=target_user.full_name,
        is_active=target_user.is_active,
        is_superuser=target_user.is_superuser,
        role=role_name or ("super_admin" if target_user.is_superuser else None),
        permissions=caps,
        created_at=target_user.created_at.isoformat(),
    )

