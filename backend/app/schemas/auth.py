from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class StudentRegistration(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    full_name: str = Field(default="", min_length=2, max_length=255)
    first_name: str | None = Field(default=None, max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    surname: str | None = Field(default=None, max_length=100)
    password: str = Field(min_length=12, max_length=256)
    jamb_registration_number: str | None = Field(default=None, max_length=40)
    matriculation_number: str | None = Field(default=None, max_length=40)
    programme_id: int | None = Field(default=None, gt=0)
    department_id: int | None = Field(default=None, gt=0)
    admission_session_id: int | None = Field(default=None, gt=0)
    claimed_level_id: int | None = Field(default=None, gt=0)

    @model_validator(mode="before")
    @classmethod
    def compose_full_name(cls, values: Any) -> Any:
        if not isinstance(values, dict):
            return values

        first_name = " ".join(str(values.get("first_name") or "").split())
        middle_name = " ".join(str(values.get("middle_name") or "").split())
        surname = " ".join(str(values.get("surname") or "").split())

        if first_name or middle_name or surname:
            if not first_name or not surname:
                raise ValueError("First name and surname are required.")
            values["full_name"] = " ".join(
                name for name in (first_name, middle_name, surname) if name
            )
        else:
            values["full_name"] = " ".join(str(values.get("full_name") or "").split())
        return values

    @model_validator(mode="after")
    def require_student_identifier(self) -> "StudentRegistration":
        if not self.full_name:
            raise ValueError("First name and surname are required.")
        self.jamb_registration_number = self._normalize_identifier(
            self.jamb_registration_number
        )
        self.matriculation_number = self._normalize_identifier(self.matriculation_number)
        return self

    @staticmethod
    def _normalize_identifier(value: str | None) -> str | None:
        normalized = value.strip().upper() if value else None
        return normalized or None


class GoogleAuthRequest(BaseModel):
    credential: str = Field(..., min_length=10, description="Google OAuth ID Token")


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    nickname: str | None = None
    avatar_url: str | None = None
    last_profile_edit_at: datetime | None = None
    can_edit_profile_now: bool = True
    next_profile_edit_at: datetime | None = None
    is_active: bool
    is_admin: bool = False
    is_superuser: bool = False
    role: str | None = None
    email_verified: bool = False
    permissions: list[str] = []


class EmailVerificationSendResponse(BaseModel):
    message: str
    email: str
    expires_in_minutes: int
    dev_code: str | None = None


class EmailVerificationCodeRequest(BaseModel):
    code: str = Field(min_length=4, max_length=10)


class ForgotPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr


class ResetPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    code: str = Field(min_length=4, max_length=10)
    new_password: str = Field(min_length=12, max_length=256)


class MessageResponse(BaseModel):
    message: str


class RoleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None


class AdminUserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    full_name: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=12, max_length=256)
    role_name: str = "content_admin"
    is_superuser: bool = False


class AdminRoleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role_name: str | None = None
    is_superuser: bool | None = None
    is_active: bool | None = None


class AdminUserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    is_active: bool
    is_superuser: bool
    role: str | None
    permissions: list[str] = []
    created_at: str


class UserProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr | None = None
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    nickname: str | None = Field(default=None, max_length=100)
    avatar_url: str | None = Field(default=None, max_length=5000000)
