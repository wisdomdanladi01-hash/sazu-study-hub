from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


ProgrammeStatus = Literal[
    "active", "approved_not_commenced", "pending_confirmation", "inactive"
]
VerificationStatus = Literal["verified", "user_supplied", "pending_confirmation"]


class InstitutionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=200)
    location: str | None = Field(default=None, max_length=200)
    is_active: bool = True


class InstitutionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str | None = Field(default=None, min_length=1, max_length=30)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    location: str | None = Field(default=None, max_length=200)
    is_active: bool | None = None


class InstitutionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    location: str | None
    is_active: bool


class FacultyCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    institution_id: int = Field(gt=0)
    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=150)
    is_active: bool = True


class FacultyUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    institution_id: int | None = Field(default=None, gt=0)
    code: str | None = Field(default=None, min_length=1, max_length=30)
    name: str | None = Field(default=None, min_length=1, max_length=150)
    is_active: bool | None = None


class FacultyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    institution_id: int
    code: str
    name: str
    is_active: bool


class DepartmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    programme_id: int | None = Field(default=None, gt=0)
    faculty_id: int | None = Field(default=None, gt=0)
    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=150)
    status: ProgrammeStatus = "pending_confirmation"
    source_note: str | None = Field(default=None, max_length=10_000)
    is_active: bool = True


class DepartmentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    programme_id: int | None = Field(default=None, gt=0)
    faculty_id: int | None = Field(default=None, gt=0)
    code: str | None = Field(default=None, min_length=1, max_length=30)
    name: str | None = Field(default=None, min_length=1, max_length=150)
    status: ProgrammeStatus | None = None
    source_note: str | None = Field(default=None, max_length=10_000)
    is_active: bool | None = None


class DepartmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    programme_id: int | None
    faculty_id: int | None
    code: str
    name: str
    status: str
    source_note: str | None
    is_active: bool


class ProgrammeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    faculty_id: int | None = Field(default=None, gt=0)
    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=150)
    award: str | None = Field(default=None, max_length=100)
    study_level: str = Field(default="undergraduate", min_length=1, max_length=30)
    status: ProgrammeStatus = "pending_confirmation"
    commencement_session_id: int | None = Field(default=None, gt=0)
    source_note: str | None = Field(default=None, max_length=10_000)
    is_active: bool = True


class ProgrammeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    faculty_id: int | None = Field(default=None, gt=0)
    code: str | None = Field(default=None, min_length=1, max_length=30)
    name: str | None = Field(default=None, min_length=1, max_length=150)
    award: str | None = Field(default=None, max_length=100)
    study_level: str | None = Field(default=None, min_length=1, max_length=30)
    status: ProgrammeStatus | None = None
    commencement_session_id: int | None = Field(default=None, gt=0)
    source_note: str | None = Field(default=None, max_length=10_000)
    is_active: bool | None = None


class ProgrammeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    faculty_id: int | None
    code: str
    name: str
    award: str | None
    study_level: str
    status: str
    commencement_session_id: int | None
    source_note: str | None
    is_active: bool


class CourseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    programme_id: int = Field(gt=0)
    department_id: int | None = Field(default=None, gt=0)
    academic_level_id: int | None = Field(default=None, gt=0)
    code: str = Field(min_length=1, max_length=30)
    title: str = Field(min_length=1, max_length=200)
    verification_status: VerificationStatus = "pending_confirmation"
    source_note: str | None = Field(default=None, max_length=10_000)
    is_active: bool = True

    @field_validator("code", "title")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("This value cannot be blank.")
        return normalized


class CourseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    programme_id: int | None = Field(default=None, gt=0)
    department_id: int | None = Field(default=None, gt=0)
    academic_level_id: int | None = Field(default=None, gt=0)
    code: str | None = Field(default=None, min_length=1, max_length=30)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    verification_status: VerificationStatus | None = None
    source_note: str | None = Field(default=None, max_length=10_000)
    is_active: bool | None = None

    @field_validator("code", "title")
    @classmethod
    def strip_required_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("This value cannot be blank.")
        return normalized

    @model_validator(mode="after")
    def reject_nulls_for_non_nullable_fields(self) -> "CourseUpdate":
        for field in (
            "programme_id",
            "code",
            "title",
            "verification_status",
            "is_active",
        ):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null.")
        return self


class CourseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    programme_id: int | None
    department_id: int | None
    academic_level_id: int | None
    code: str
    title: str
    is_active: bool
    verification_status: str
    source_note: str | None


class CourseOfferingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    credit_units: int | None = Field(default=None, gt=0)
    course_type: str | None = Field(default=None, max_length=20)
    verification_status: VerificationStatus | None = None
    source_note: str | None = Field(default=None, max_length=10_000)
    is_active: bool | None = None


class CourseOfferingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_id: int
    curriculum_version_id: int
    academic_level_id: int
    semester_id: int
    credit_units: int | None
    course_type: str | None
    verification_status: str
    source_note: str | None
    is_active: bool


class CourseOfferingImportResponse(BaseModel):
    imported_rows: int
    created_courses: int
    updated_courses: int
    created_offerings: int
    updated_offerings: int


class SemesterCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    academic_session_id: int = Field(gt=0)
    number: int = Field(ge=1, le=2)
    starts_on: date
    ends_on: date

    @model_validator(mode="after")
    def validate_dates(self) -> "SemesterCreate":
        if self.ends_on <= self.starts_on:
            raise ValueError("ends_on must be later than starts_on.")
        return self


class SemesterUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    academic_session_id: int | None = Field(default=None, gt=0)
    number: int | None = Field(default=None, ge=1, le=2)
    starts_on: date | None = None
    ends_on: date | None = None

    @model_validator(mode="after")
    def validate_dates(self) -> "SemesterUpdate":
        if self.starts_on and self.ends_on and self.ends_on <= self.starts_on:
            raise ValueError("ends_on must be later than starts_on.")
        return self


class SemesterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    academic_session_id: int
    number: int
    starts_on: date
    ends_on: date


class AcademicSessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=30)
    starts_on: date
    ends_on: date
    is_active: bool = False

    @model_validator(mode="after")
    def validate_dates(self) -> "AcademicSessionCreate":
        if self.ends_on <= self.starts_on:
            raise ValueError("ends_on must be later than starts_on.")
        return self


class AcademicSessionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=30)
    starts_on: date | None = None
    ends_on: date | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def validate_dates(self) -> "AcademicSessionUpdate":
        if self.starts_on and self.ends_on and self.ends_on <= self.starts_on:
            raise ValueError("ends_on must be later than starts_on.")
        return self


class AcademicSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    starts_on: date
    ends_on: date
    is_active: bool
    semesters: list[SemesterResponse] = []

