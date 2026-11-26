import csv
import io
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_admin, require_capability
from app.db.database import get_db
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
    Semester,
    StudentAcademicProfile,
)
from app.models.audit import AuditEvent
from app.models.user import User
from app.models.resource import Resource
from app.models.identity import VerificationSubmission
from app.models.commerce import AccessPackage, Payment
from app.models.subscription import Subscription
from app.services.resources import compute_courses_material_coverage
from sqlalchemy import func
from app.schemas.academic import (
    AcademicSessionCreate,
    AcademicSessionResponse,
    AcademicSessionUpdate,
    CourseCreate,
    CourseOfferingImportResponse,
    CourseOfferingResponse,
    CourseOfferingUpdate,
    CourseResponse,
    CourseUpdate,
    DepartmentCreate,
    DepartmentResponse,
    DepartmentUpdate,
    FacultyCreate,
    FacultyResponse,
    FacultyUpdate,
    InstitutionCreate,
    InstitutionResponse,
    InstitutionUpdate,
    ProgrammeCreate,
    ProgrammeResponse,
    ProgrammeUpdate,
    SemesterCreate,
    SemesterResponse,
    SemesterUpdate,
)


router = APIRouter(
    prefix="/admin/academic",
    tags=["academic directory administration"],
    dependencies=[Depends(require_capability("manage_academic_catalogue"))],
)
MAX_CSV_BYTES = 2 * 1024 * 1024
MAX_CSV_ROWS = 2_000
CSV_COLUMNS = {
    "programme_code",
    "course_code",
    "course_title",
    "level_code",
    "academic_session",
    "semester",
    "credit_units",
}
OPTIONAL_CSV_COLUMNS = {
    "department_code",
    "curriculum_version",
    "course_type",
    "verification_status",
    "source_note",
}
ALLOWED_VERIFICATION_STATUSES = {"verified", "user_supplied", "pending_confirmation"}


def _validate_course_references(
    db: Session,
    programme_id: int,
    department_id: int | None,
    academic_level_id: int | None,
) -> None:
    programme = db.get(Programme, programme_id)
    if programme is None:
        raise HTTPException(status_code=422, detail="The selected programme does not exist.")
    if department_id is not None:
        department = db.get(Department, department_id)
        if department is None:
            raise HTTPException(status_code=422, detail="The selected department does not exist.")
        if department.programme_id not in (None, programme.id):
            raise HTTPException(
                status_code=422,
                detail="The selected department is assigned to a different programme.",
            )
        if (
            department.faculty_id is not None
            and programme.faculty_id is not None
            and department.faculty_id != programme.faculty_id
        ):
            raise HTTPException(
                status_code=422,
                detail="The selected department and programme belong to different faculties.",
            )
    if academic_level_id is not None and db.get(AcademicLevel, academic_level_id) is None:
        raise HTTPException(status_code=422, detail="The selected academic level does not exist.")


def _commit_or_conflict(db: Session, detail: str) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=detail) from exc


@router.get("/institutions", response_model=list[InstitutionResponse])
def admin_list_institutions(
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> list[Institution]:
    return db.scalars(select(Institution).order_by(Institution.name.asc())).all()


@router.post(
    "/institutions",
    response_model=InstitutionResponse,
    status_code=status.HTTP_201_CREATED,
)
def admin_create_institution(
    data: InstitutionCreate,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> Institution:
    institution = Institution(**data.model_dump())
    db.add(institution)
    _commit_or_conflict(db, "An institution with that code or name already exists.")
    db.refresh(institution)
    return institution


@router.patch("/institutions/{institution_id}", response_model=InstitutionResponse)
def admin_update_institution(
    institution_id: int,
    data: InstitutionUpdate,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> Institution:
    institution = db.get(Institution, institution_id)
    if institution is None:
        raise HTTPException(status_code=404, detail="Institution not found.")
    changes = data.model_dump(exclude_unset=True)
    for field in ("code", "name", "is_active"):
        if field in changes and changes[field] is None:
            raise HTTPException(status_code=422, detail=f"{field} cannot be null.")
    for field, value in changes.items():
        setattr(institution, field, value)
    _commit_or_conflict(db, "The updated institution conflicts with an existing record.")
    db.refresh(institution)
    return institution


@router.get("/faculties", response_model=list[FacultyResponse])
def admin_list_faculties(
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> list[Faculty]:
    return db.scalars(select(Faculty).order_by(Faculty.name.asc())).all()


@router.post("/faculties", response_model=FacultyResponse, status_code=status.HTTP_201_CREATED)
def admin_create_faculty(
    data: FacultyCreate,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> Faculty:
    if db.get(Institution, data.institution_id) is None:
        raise HTTPException(status_code=422, detail="The selected institution does not exist.")
    faculty = Faculty(**data.model_dump())
    db.add(faculty)
    _commit_or_conflict(db, "A faculty with that code or institution/name already exists.")
    db.refresh(faculty)
    return faculty


@router.patch("/faculties/{faculty_id}", response_model=FacultyResponse)
def admin_update_faculty(
    faculty_id: int,
    data: FacultyUpdate,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> Faculty:
    faculty = db.get(Faculty, faculty_id)
    if faculty is None:
        raise HTTPException(status_code=404, detail="Faculty not found.")
    changes = data.model_dump(exclude_unset=True)
    if "institution_id" in changes:
        if changes["institution_id"] is None:
            raise HTTPException(status_code=422, detail="institution_id cannot be null.")
        if db.get(Institution, changes["institution_id"]) is None:
            raise HTTPException(status_code=422, detail="The selected institution does not exist.")
    for field in ("code", "name", "is_active"):
        if field in changes and changes[field] is None:
            raise HTTPException(status_code=422, detail=f"{field} cannot be null.")
    for field, value in changes.items():
        setattr(faculty, field, value)
    _commit_or_conflict(db, "The updated faculty conflicts with an existing record.")
    db.refresh(faculty)
    return faculty


@router.get("/departments", response_model=list[DepartmentResponse])
def admin_list_departments(
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> list[Department]:
    return db.scalars(select(Department).order_by(Department.name.asc())).all()


def _validate_department_references(
    db: Session,
    programme_id: int | None,
    faculty_id: int | None,
) -> None:
    programme = db.get(Programme, programme_id) if programme_id is not None else None
    faculty = db.get(Faculty, faculty_id) if faculty_id is not None else None
    if programme_id is not None and programme is None:
        raise HTTPException(status_code=422, detail="The selected programme does not exist.")
    if faculty_id is not None and faculty is None:
        raise HTTPException(status_code=422, detail="The selected faculty does not exist.")
    if (
        programme is not None
        and faculty_id is not None
        and programme.faculty_id is not None
        and programme.faculty_id != faculty_id
    ):
        raise HTTPException(
            status_code=422,
            detail="The selected department and programme belong to different faculties.",
        )


@router.post(
    "/departments",
    response_model=DepartmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def admin_create_department(
    data: DepartmentCreate,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> Department:
    _validate_department_references(db, data.programme_id, data.faculty_id)
    department = Department(**data.model_dump())
    db.add(department)
    _commit_or_conflict(db, "A department with that code or programme/name already exists.")
    db.refresh(department)
    return department


@router.patch("/departments/{department_id}", response_model=DepartmentResponse)
def admin_update_department(
    department_id: int,
    data: DepartmentUpdate,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> Department:
    department = db.get(Department, department_id)
    if department is None:
        raise HTTPException(status_code=404, detail="Department not found.")
    changes = data.model_dump(exclude_unset=True)
    _validate_department_references(
        db,
        changes.get("programme_id", department.programme_id),
        changes.get("faculty_id", department.faculty_id),
    )
    for field in ("code", "name", "status", "is_active"):
        if field in changes and changes[field] is None:
            raise HTTPException(status_code=422, detail=f"{field} cannot be null.")
    for field, value in changes.items():
        setattr(department, field, value)
    _commit_or_conflict(db, "The updated department conflicts with an existing record.")
    db.refresh(department)
    return department


@router.get("/programmes", response_model=list[ProgrammeResponse])
def admin_list_programmes(
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> list[Programme]:
    return db.scalars(select(Programme).order_by(Programme.name.asc())).all()


def _validate_programme_references(
    db: Session,
    faculty_id: int | None,
    commencement_session_id: int | None,
) -> None:
    if faculty_id is not None and db.get(Faculty, faculty_id) is None:
        raise HTTPException(status_code=422, detail="The selected faculty does not exist.")
    if (
        commencement_session_id is not None
        and db.get(AcademicSession, commencement_session_id) is None
    ):
        raise HTTPException(
            status_code=422,
            detail="The selected commencement session does not exist.",
        )


@router.post("/programmes", response_model=ProgrammeResponse, status_code=status.HTTP_201_CREATED)
def admin_create_programme(
    data: ProgrammeCreate,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> Programme:
    _validate_programme_references(
        db, data.faculty_id, data.commencement_session_id
    )
    programme = Programme(**data.model_dump())
    db.add(programme)
    _commit_or_conflict(db, "A programme with that code or name already exists.")
    db.refresh(programme)
    return programme


@router.patch("/programmes/{programme_id}", response_model=ProgrammeResponse)
def admin_update_programme(
    programme_id: int,
    data: ProgrammeUpdate,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> Programme:
    programme = db.get(Programme, programme_id)
    if programme is None:
        raise HTTPException(status_code=404, detail="Programme not found.")
    changes = data.model_dump(exclude_unset=True)
    _validate_programme_references(
        db,
        changes.get("faculty_id", programme.faculty_id),
        changes.get("commencement_session_id", programme.commencement_session_id),
    )
    for field in ("code", "name", "study_level", "status", "is_active"):
        if field in changes and changes[field] is None:
            raise HTTPException(status_code=422, detail=f"{field} cannot be null.")
    for field, value in changes.items():
        setattr(programme, field, value)
    _commit_or_conflict(db, "The updated programme conflicts with an existing record.")
    db.refresh(programme)
    return programme


@router.get("/courses", response_model=list[CourseResponse])
def admin_list_courses(
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> list[Course]:
    return db.scalars(select(Course).order_by(Course.code.asc(), Course.id.asc())).all()


@router.post(
    "/courses",
    response_model=CourseResponse,
    status_code=status.HTTP_201_CREATED,
)
def admin_create_course(
    data: CourseCreate,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> Course:
    _validate_course_references(
        db, data.programme_id, data.department_id, data.academic_level_id
    )
    course = Course(**data.model_dump())
    db.add(course)
    _commit_or_conflict(db, "A course with that code already exists for the selected programme.")
    db.refresh(course)
    return course


@router.patch("/courses/{course_id}", response_model=CourseResponse)
def admin_update_course(
    course_id: int,
    data: CourseUpdate,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> Course:
    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found.")
    changes = data.model_dump(exclude_unset=True)
    _validate_course_references(
        db,
        changes.get("programme_id", course.programme_id),
        changes.get("department_id", course.department_id),
        changes.get("academic_level_id", course.academic_level_id),
    )
    for field, value in changes.items():
        setattr(course, field, value)
    course.last_verified_at = (
        datetime.now(timezone.utc)
        if changes.get("verification_status") == "verified"
        else course.last_verified_at
    )
    _commit_or_conflict(db, "The updated course conflicts with an existing course.")
    db.refresh(course)
    return course


@router.get("/course-offerings")
def admin_list_course_offerings(
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> list[dict]:
    offerings = db.scalars(select(CourseOffering).order_by(CourseOffering.id.asc())).all()
    courses = {c.id: c for c in db.scalars(select(Course)).all()}
    curricula = {cv.id: cv for cv in db.scalars(select(CurriculumVersion)).all()}
    programmes = {p.id: p for p in db.scalars(select(Programme)).all()}
    departments = {d.id: d for d in db.scalars(select(Department)).all()}
    sessions = {s.id: s for s in db.scalars(select(AcademicSession)).all()}
    levels = {l.id: l for l in db.scalars(select(AcademicLevel)).all()}
    semesters = {sem.id: sem for sem in db.scalars(select(Semester)).all()}

    coverage_by_course = compute_courses_material_coverage(db)

    result = []
    for off in offerings:
        course = courses.get(off.course_id)
        curriculum = curricula.get(off.curriculum_version_id)
        session = sessions.get(curriculum.academic_session_id) if curriculum else None
        level = levels.get(off.academic_level_id)
        semester = semesters.get(off.semester_id)

        prog_id = course.programme_id if course else (curriculum.programme_id if curriculum else None)
        prog = programmes.get(prog_id) if prog_id else None
        dept_id = course.department_id if course else None
        dept = departments.get(dept_id) if dept_id else None

        cov = coverage_by_course.get(off.course_id) if off.course_id else None

        result.append({
            "id": off.id,
            "course_id": off.course_id,
            "course_code": course.code if course else "",
            "course_title": course.title if course else "",
            "programme_id": prog_id,
            "programme_name": prog.name if prog else None,
            "department_id": dept_id,
            "department_name": dept.name if dept else None,
            "curriculum_version_id": off.curriculum_version_id,
            "curriculum_version": curriculum.version if curriculum else "",
            "academic_session_id": curriculum.academic_session_id if curriculum else None,
            "academic_session": session.name if session else None,
            "academic_level_id": off.academic_level_id,
            "level": level.code if level else None,
            "semester_id": off.semester_id,
            "semester": semester.number if semester else None,
            "credit_units": off.credit_units,
            "course_type": off.course_type,
            "verification_status": off.verification_status,
            "source_note": off.source_note,
            "is_active": off.is_active,
            "coverage": cov,
        })
    return result


@router.get("/courses/coverage")
def admin_courses_coverage(
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    courses = db.scalars(select(Course).order_by(Course.code.asc())).all()
    departments = {d.id: d.name for d in db.scalars(select(Department)).all()}
    levels = {l.id: l.name for l in db.scalars(select(AcademicLevel)).all()}
    coverage_by_course = compute_courses_material_coverage(db)

    items = []
    complete_count = 0
    partial_count = 0
    missing_all_count = 0
    lacking_handouts = 0
    lacking_test_pqs = 0
    lacking_exam_pqs = 0

    for c in courses:
        cov = coverage_by_course.get(c.id, {
            "has_handout": False,
            "has_test_pq": False,
            "has_exam_pq": False,
            "has_solution": False,
            "status": "missing_all",
            "missing_items": ["Lecture Handout", "Test Past Question", "Exam Past Question"],
            "available_items": [],
            "available_core_count": 0,
            "total_core_count": 3,
            "counts": {"handouts": 0, "test_pqs": 0, "exam_pqs": 0, "solutions": 0, "total": 0},
        })

        if cov["status"] == "complete":
            complete_count += 1
        elif cov["status"] == "partial":
            partial_count += 1
        else:
            missing_all_count += 1

        if not cov["has_handout"]:
            lacking_handouts += 1
        if not cov["has_test_pq"]:
            lacking_test_pqs += 1
        if not cov["has_exam_pq"]:
            lacking_exam_pqs += 1

        items.append({
            "id": c.id,
            "code": c.code,
            "title": c.title,
            "department_id": c.department_id,
            "department_name": departments.get(c.department_id),
            "academic_level_id": c.academic_level_id,
            "level_name": levels.get(c.academic_level_id),
            "verification_status": c.verification_status,
            "coverage": cov,
        })

    return {
        "summary": {
            "total_courses": len(courses),
            "complete_courses": complete_count,
            "partial_courses": partial_count,
            "missing_all_courses": missing_all_count,
            "lacking_handouts": lacking_handouts,
            "lacking_test_pqs": lacking_test_pqs,
            "lacking_exam_pqs": lacking_exam_pqs,
        },
        "courses": items,
    }


@router.patch(
    "/course-offerings/{offering_id}",
    response_model=CourseOfferingResponse,
)
def admin_update_course_offering(
    offering_id: int,
    data: CourseOfferingUpdate,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> CourseOffering:
    offering = db.get(CourseOffering, offering_id)
    if offering is None:
        raise HTTPException(status_code=404, detail="Course offering not found.")
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(offering, field, value)
    _commit_or_conflict(db, "The updated course offering violates a catalogue constraint.")
    db.refresh(offering)
    return offering


@router.post(
    "/course-offerings/import",
    response_model=CourseOfferingImportResponse,
)
def admin_import_course_offerings(
    upload: Annotated[UploadFile, File()],
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> CourseOfferingImportResponse:
    content = upload.file.read(MAX_CSV_BYTES + 1)
    upload.file.close()
    if len(content) > MAX_CSV_BYTES:
        raise HTTPException(status_code=413, detail="CSV file exceeds the 2 MB limit.")
    try:
        decoded = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=422, detail="CSV must be encoded as UTF-8.") from exc

    reader = csv.DictReader(io.StringIO(decoded, newline=""))
    if reader.fieldnames is None:
        raise HTTPException(status_code=422, detail="CSV must include a header row.")
    normalized_headers = [(name or "").strip() for name in reader.fieldnames]
    if len(normalized_headers) != len(set(normalized_headers)):
        raise HTTPException(status_code=422, detail="CSV contains duplicate column names.")
    unknown_headers = set(normalized_headers) - CSV_COLUMNS - OPTIONAL_CSV_COLUMNS
    if unknown_headers:
        raise HTTPException(
            status_code=422,
            detail=f"CSV contains unsupported columns: {', '.join(sorted(unknown_headers))}.",
        )
    reader.fieldnames = normalized_headers
    if not CSV_COLUMNS.issubset(set(normalized_headers)):
        required = ", ".join(sorted(CSV_COLUMNS))
        raise HTTPException(
            status_code=422,
            detail=f"CSV is missing required columns. Required headers: {required}.",
        )

    stats = {
        "imported_rows": 0,
        "created_courses": 0,
        "updated_courses": 0,
        "created_offerings": 0,
        "updated_offerings": 0,
    }

    try:
        for line_number, raw_row in enumerate(reader, start=2):
            if line_number - 1 > MAX_CSV_ROWS:
                raise HTTPException(
                    status_code=413,
                    detail=f"CSV exceeds the {MAX_CSV_ROWS}-row limit.",
                )
            if raw_row is None:
                continue
            if None in raw_row:
                raise HTTPException(
                    status_code=422,
                    detail=f"CSV row {line_number}: more fields than declared in the header.",
                )
            if not any(value and value.strip() for value in raw_row.values()):
                continue
            row = {
                (key or "").strip(): (value or "").strip()
                for key, value in raw_row.items()
            }

            def required(name: str) -> str:
                value = row.get(name, "")
                if not value:
                    raise HTTPException(
                        status_code=422,
                        detail=f"CSV row {line_number}: {name} is required.",
                    )
                return value

            programme_code = required("programme_code")
            course_code = required("course_code").upper()
            course_title = required("course_title")
            level_code = required("level_code")
            session_name = required("academic_session")
            try:
                semester_number = int(required("semester"))
                credits = int(required("credit_units"))
            except ValueError as exc:
                raise HTTPException(
                    status_code=422,
                    detail=f"CSV row {line_number}: semester and credit_units must be integers.",
                ) from exc
            if semester_number not in (1, 2) or credits <= 0:
                raise HTTPException(
                    status_code=422,
                    detail=f"CSV row {line_number}: semester must be 1 or 2 and credit_units must be positive.",
                )
            verification_status = row.get("verification_status") or "user_supplied"
            if verification_status not in ALLOWED_VERIFICATION_STATUSES:
                raise HTTPException(
                    status_code=422,
                    detail=f"CSV row {line_number}: verification_status is invalid.",
                )

            programme = db.scalar(select(Programme).where(Programme.code == programme_code))
            level = db.scalar(select(AcademicLevel).where(AcademicLevel.code == level_code))
            academic_session = db.scalar(
                select(AcademicSession).where(AcademicSession.name == session_name)
            )
            if programme is None or level is None or academic_session is None:
                raise HTTPException(
                    status_code=422,
                    detail=f"CSV row {line_number}: programme, level, or academic session was not found.",
                )
            semester = db.scalar(
                select(Semester).where(
                    Semester.academic_session_id == academic_session.id,
                    Semester.number == semester_number,
                )
            )
            if semester is None:
                raise HTTPException(
                    status_code=422,
                    detail=f"CSV row {line_number}: semester {semester_number} is not configured for {session_name}.",
                )

            department = None
            department_code = row.get("department_code", "")
            if department_code:
                department = db.scalar(
                    select(Department).where(Department.code == department_code)
                )
                if department is None:
                    raise HTTPException(
                        status_code=422,
                        detail=f"CSV row {line_number}: department_code was not found.",
                    )
                _validate_course_references(db, programme.id, department.id, level.id)

            curriculum_version = row.get("curriculum_version") or f"Imported {session_name}"
            curriculum = db.scalar(
                select(CurriculumVersion).where(
                    CurriculumVersion.programme_id == programme.id,
                    CurriculumVersion.academic_session_id == academic_session.id,
                    CurriculumVersion.version == curriculum_version,
                )
            )
            if curriculum is None:
                curriculum = CurriculumVersion(
                    programme_id=programme.id,
                    academic_session_id=academic_session.id,
                    version=curriculum_version,
                    source_note=row.get("source_note") or "Imported from an administrator-provided CSV.",
                    is_active=False,
                )
                db.add(curriculum)
                db.flush()

            course = db.scalar(
                select(Course).where(
                    Course.programme_id == programme.id,
                    Course.code == course_code,
                )
            )
            if course is None:
                course = Course(
                    programme_id=programme.id,
                    department_id=department.id if department else None,
                    academic_level_id=level.id,
                    code=course_code,
                    title=course_title,
                    is_active=True,
                    verification_status=verification_status,
                    source_note=row.get("source_note") or "Imported from an administrator-provided CSV.",
                )
                db.add(course)
                db.flush()
                stats["created_courses"] += 1
            else:
                course.title = course_title
                course.department_id = department.id if department else course.department_id
                course.academic_level_id = level.id
                course.verification_status = verification_status
                if row.get("source_note"):
                    course.source_note = row["source_note"]
                stats["updated_courses"] += 1

            offering = db.scalar(
                select(CourseOffering).where(
                    CourseOffering.course_id == course.id,
                    CourseOffering.curriculum_version_id == curriculum.id,
                    CourseOffering.semester_id == semester.id,
                )
            )
            offering_values = {
                "academic_level_id": level.id,
                "credit_units": credits,
                "course_type": row.get("course_type") or None,
                "verification_status": verification_status,
                "source_note": row.get("source_note") or None,
                "is_active": True,
            }
            if offering is None:
                db.add(
                    CourseOffering(
                        course_id=course.id,
                        curriculum_version_id=curriculum.id,
                        semester_id=semester.id,
                        **offering_values,
                    )
                )
                stats["created_offerings"] += 1
            else:
                for field, value in offering_values.items():
                    setattr(offering, field, value)
                stats["updated_offerings"] += 1
            stats["imported_rows"] += 1

        if stats["imported_rows"] == 0:
            raise HTTPException(status_code=422, detail="CSV contains no importable data rows.")
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="CSV import conflicts with existing catalogue records.",
        ) from exc
    except csv.Error as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=f"Invalid CSV: {exc}") from exc

    return CourseOfferingImportResponse(**stats)

@router.get("/overview")
def admin_overview(
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    total_resources = db.scalar(select(func.count(Resource.id))) or 0
    published_resources = db.scalar(select(func.count(Resource.id)).where(Resource.is_published.is_(True))) or 0
    total_faculties = db.scalar(select(func.count(Faculty.id))) or 0
    total_departments = db.scalar(select(func.count(Department.id))) or 0
    total_programmes = db.scalar(select(func.count(Programme.id))) or 0
    total_courses = db.scalar(select(func.count(Course.id))) or 0
    total_offerings = db.scalar(select(func.count(CourseOffering.id))) or 0
    verified_offerings = db.scalar(
        select(func.count(CourseOffering.id)).where(CourseOffering.verification_status == "verified")
    ) or 0
    unverified_offerings = total_offerings - verified_offerings
    pending_verifications = db.scalar(
        select(func.count(VerificationSubmission.id)).where(VerificationSubmission.status == "pending")
    ) or 0
    total_packages = db.scalar(select(func.count(AccessPackage.id))) or 0
    total_payments = db.scalar(select(func.count(Payment.id))) or 0
    succeeded_payments = db.scalar(
        select(func.count(Payment.id)).where(Payment.status == "succeeded")
    ) or 0
    total_revenue_minor = db.scalar(
        select(func.coalesce(func.sum(Payment.amount_minor), 0)).where(Payment.status == "succeeded")
    ) or 0
    total_students = db.scalar(
        select(func.count(User.id)).where(User.is_superuser.is_(False))
    ) or 0
    verified_students = db.scalar(
        select(func.count(User.id)).where(User.is_superuser.is_(False), User.email_verified.is_(True))
    ) or 0

    coverage_by_course = compute_courses_material_coverage(db)
    complete_courses = sum(1 for cov in coverage_by_course.values() if cov["status"] == "complete")
    partial_courses = sum(1 for cov in coverage_by_course.values() if cov["status"] == "partial")
    missing_all_courses = sum(1 for cov in coverage_by_course.values() if cov["status"] == "missing_all")
    lacking_handouts = sum(1 for cov in coverage_by_course.values() if not cov["has_handout"])
    lacking_test_pqs = sum(1 for cov in coverage_by_course.values() if not cov["has_test_pq"])
    lacking_exam_pqs = sum(1 for cov in coverage_by_course.values() if not cov["has_exam_pq"])

    recent_resources = db.scalars(
        select(Resource).order_by(Resource.created_at.desc(), Resource.id.desc()).limit(5)
    ).all()

    recent_submissions = db.scalars(
        select(VerificationSubmission).order_by(VerificationSubmission.created_at.desc(), VerificationSubmission.id.desc()).limit(5)
    ).all()

    recent_students = db.scalars(
        select(User).where(User.is_superuser.is_(False)).order_by(User.created_at.desc(), User.id.desc()).limit(5)
    ).all()

    recent_payments = db.scalars(
        select(Payment).where(Payment.status == "succeeded").order_by(Payment.created_at.desc(), Payment.id.desc()).limit(5)
    ).all()

    return {
        "metrics": {
            "total_resources": total_resources,
            "published_resources": published_resources,
            "total_faculties": total_faculties,
            "total_departments": total_departments,
            "total_programmes": total_programmes,
            "total_courses": total_courses,
            "total_course_offerings": total_offerings,
            "verified_offerings": verified_offerings,
            "unverified_offerings": unverified_offerings,
            "pending_verifications": pending_verifications,
            "total_packages": total_packages,
            "total_payments": total_payments,
            "succeeded_payments": succeeded_payments,
            "total_revenue_minor": total_revenue_minor,
            "total_students": total_students,
            "verified_students": verified_students,
            "complete_courses": complete_courses,
            "partial_courses": partial_courses,
            "missing_all_courses": missing_all_courses,
            "courses_lacking_handouts": lacking_handouts,
            "courses_lacking_test_pqs": lacking_test_pqs,
            "courses_lacking_exam_pqs": lacking_exam_pqs,
        },
        "recent_resources": [
            {
                "id": r.id,
                "title": r.title,
                "file_name": r.file_name,
                "mime_type": r.mime_type,
                "is_published": r.is_published,
                "access_policy": r.access_policy,
                "preview_policy": getattr(r, "preview_policy", "none"),
                "created_at": r.created_at.isoformat(),
            }
            for r in recent_resources
        ],
        "recent_submissions": [
            {
                "id": s.id,
                "user_id": s.user_id,
                "status": s.status,
                "matriculation_number": s.matriculation_number,
                "jamb_registration_number": s.jamb_registration_number,
                "created_at": s.created_at.isoformat(),
            }
            for s in recent_submissions
        ],
        "recent_students": [
            {
                "id": u.id,
                "full_name": u.full_name,
                "email": u.email,
                "nickname": u.nickname,
                "avatar_url": u.avatar_url,
                "email_verified": u.email_verified,
                "created_at": u.created_at.isoformat() if u.created_at else "",
            }
            for u in recent_students
        ],
        "recent_payments": [
            {
                "id": p.id,
                "reference": p.provider_reference or p.idempotency_key or f"PAY-{p.id}",
                "amount_minor": p.amount_minor,
                "currency": p.currency,
                "status": p.status,
                "channel": p.provider or "paystack",
                "customer_email": getattr(db.get(User, p.user_id), "email", None) if p.user_id else None,
                "created_at": p.created_at.isoformat() if p.created_at else "",
            }
            for p in recent_payments
        ],
    }


# =========================================================================
# Academic Sessions & Semesters Administration
# =========================================================================

@router.get("/sessions", response_model=list[AcademicSessionResponse])
def admin_list_sessions(
    _admin: User = Depends(require_capability("manage_academic_catalogue")),
    db: Session = Depends(get_db),
) -> list[AcademicSessionResponse]:
    sessions = db.scalars(select(AcademicSession).order_by(AcademicSession.starts_on.desc())).all()
    res = []
    for s in sessions:
        semesters = db.scalars(
            select(Semester).where(Semester.academic_session_id == s.id).order_by(Semester.number)
        ).all()
        res.append(
            AcademicSessionResponse(
                id=s.id,
                name=s.name,
                starts_on=s.starts_on,
                ends_on=s.ends_on,
                is_active=s.is_active,
                semesters=[SemesterResponse.model_validate(sem) for sem in semesters],
            )
        )
    return res


@router.post("/sessions", response_model=AcademicSessionResponse, status_code=status.HTTP_201_CREATED)
def admin_create_session(
    data: AcademicSessionCreate,
    admin: User = Depends(require_capability("manage_academic_catalogue")),
    db: Session = Depends(get_db),
) -> AcademicSessionResponse:
    existing = db.scalar(select(AcademicSession.id).where(AcademicSession.name == data.name.strip()))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An academic session with this name already exists.",
        )
    session = AcademicSession(
        name=data.name.strip(),
        starts_on=data.starts_on,
        ends_on=data.ends_on,
        is_active=data.is_active,
    )
    db.add(session)
    db.flush()
    db.add(
        AuditEvent(
            actor_user_id=admin.id,
            action="admin.academic_session_created",
            target_type="academic_session",
            target_id=str(session.id),
            event_metadata={"name": session.name, "is_active": session.is_active},
        )
    )
    db.commit()
    db.refresh(session)
    return AcademicSessionResponse(
        id=session.id,
        name=session.name,
        starts_on=session.starts_on,
        ends_on=session.ends_on,
        is_active=session.is_active,
        semesters=[],
    )


@router.patch("/sessions/{session_id}", response_model=AcademicSessionResponse)
def admin_update_session(
    session_id: int,
    data: AcademicSessionUpdate,
    admin: User = Depends(require_capability("manage_academic_catalogue")),
    db: Session = Depends(get_db),
) -> AcademicSessionResponse:
    session = db.get(AcademicSession, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Academic session not found.")
    if data.name is not None:
        name = data.name.strip()
        existing = db.scalar(
            select(AcademicSession.id).where(AcademicSession.name == name, AcademicSession.id != session_id)
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An academic session with this name already exists.",
            )
        session.name = name
    if data.starts_on is not None:
        session.starts_on = data.starts_on
    if data.ends_on is not None:
        session.ends_on = data.ends_on
    if session.ends_on <= session.starts_on:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="ends_on must be later than starts_on.")
    if data.is_active is not None:
        session.is_active = data.is_active

    db.add(
        AuditEvent(
            actor_user_id=admin.id,
            action="admin.academic_session_updated",
            target_type="academic_session",
            target_id=str(session.id),
        )
    )
    db.commit()
    db.refresh(session)
    semesters = db.scalars(
        select(Semester).where(Semester.academic_session_id == session.id).order_by(Semester.number)
    ).all()
    return AcademicSessionResponse(
        id=session.id,
        name=session.name,
        starts_on=session.starts_on,
        ends_on=session.ends_on,
        is_active=session.is_active,
        semesters=[SemesterResponse.model_validate(sem) for sem in semesters],
    )


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_session(
    session_id: int,
    admin: User = Depends(require_capability("manage_academic_catalogue")),
    db: Session = Depends(get_db),
) -> None:
    session = db.get(AcademicSession, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Academic session not found.")
    has_semesters = db.scalar(select(Semester.id).where(Semester.academic_session_id == session_id).limit(1))
    if has_semesters:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete an academic session that contains configured semesters. Delete semesters first.",
        )
    has_packages = db.scalar(select(AccessPackage.id).where(AccessPackage.academic_session_id == session_id).limit(1))
    if has_packages:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete an academic session that is referenced by subscription packages.",
        )
    db.delete(session)
    db.add(
        AuditEvent(
            actor_user_id=admin.id,
            action="admin.academic_session_deleted",
            target_type="academic_session",
            target_id=str(session_id),
        )
    )
    db.commit()


@router.get("/semesters", response_model=list[SemesterResponse])
def admin_list_semesters(
    session_id: int | None = None,
    _admin: User = Depends(require_capability("manage_academic_catalogue")),
    db: Session = Depends(get_db),
) -> list[SemesterResponse]:
    query = select(Semester).order_by(Semester.starts_on.desc())
    if session_id:
        query = query.where(Semester.academic_session_id == session_id)
    semesters = db.scalars(query).all()
    return [SemesterResponse.model_validate(sem) for sem in semesters]


@router.post("/semesters", response_model=SemesterResponse, status_code=status.HTTP_201_CREATED)
def admin_create_semester(
    data: SemesterCreate,
    admin: User = Depends(require_capability("manage_academic_catalogue")),
    db: Session = Depends(get_db),
) -> SemesterResponse:
    session = db.get(AcademicSession, data.academic_session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Academic session not found.")
    existing = db.scalar(
        select(Semester.id).where(
            Semester.academic_session_id == data.academic_session_id,
            Semester.number == data.number,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Semester {data.number} is already configured for this academic session.",
        )
    semester = Semester(
        academic_session_id=data.academic_session_id,
        number=data.number,
        starts_on=data.starts_on,
        ends_on=data.ends_on,
    )
    db.add(semester)
    db.flush()
    db.add(
        AuditEvent(
            actor_user_id=admin.id,
            action="admin.semester_created",
            target_type="semester",
            target_id=str(semester.id),
            event_metadata={
                "session_id": data.academic_session_id,
                "number": data.number,
            },
        )
    )
    db.commit()
    db.refresh(semester)
    return SemesterResponse.model_validate(semester)


@router.patch("/semesters/{semester_id}", response_model=SemesterResponse)
def admin_update_semester(
    semester_id: int,
    data: SemesterUpdate,
    admin: User = Depends(require_capability("manage_academic_catalogue")),
    db: Session = Depends(get_db),
) -> SemesterResponse:
    semester = db.get(Semester, semester_id)
    if not semester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Semester not found.")
    if data.academic_session_id is not None:
        session = db.get(AcademicSession, data.academic_session_id)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Academic session not found.")
        semester.academic_session_id = data.academic_session_id
    if data.number is not None:
        existing = db.scalar(
            select(Semester.id).where(
                Semester.academic_session_id == semester.academic_session_id,
                Semester.number == data.number,
                Semester.id != semester_id,
            )
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Semester {data.number} is already configured for this academic session.",
            )
        semester.number = data.number
    if data.starts_on is not None:
        semester.starts_on = data.starts_on
    if data.ends_on is not None:
        semester.ends_on = data.ends_on
    if semester.ends_on <= semester.starts_on:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="ends_on must be later than starts_on.")

    db.add(
        AuditEvent(
            actor_user_id=admin.id,
            action="admin.semester_updated",
            target_type="semester",
            target_id=str(semester.id),
        )
    )
    db.commit()
    db.refresh(semester)
    return SemesterResponse.model_validate(semester)


@router.delete("/semesters/{semester_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_semester(
    semester_id: int,
    admin: User = Depends(require_capability("manage_academic_catalogue")),
    db: Session = Depends(get_db),
) -> None:
    semester = db.get(Semester, semester_id)
    if not semester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Semester not found.")
    has_offerings = db.scalar(select(CourseOffering.id).where(CourseOffering.semester_id == semester_id).limit(1))
    if has_offerings:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a semester that has course offerings assigned to it.",
        )
    has_packages = db.scalar(select(AccessPackage.id).where(AccessPackage.semester_id == semester_id).limit(1))
    if has_packages:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a semester that is referenced by access packages.",
        )
    has_subs = db.scalar(select(Subscription.id).where(Subscription.semester_id == semester_id).limit(1))
    if has_subs:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a semester that has student subscriptions.",
        )
    db.delete(semester)
    db.add(
        AuditEvent(
            actor_user_id=admin.id,
            action="admin.semester_deleted",
            target_type="semester",
            target_id=str(semester_id),
        )
    )
    db.commit()


@router.post("/sessions/promote-students")
def admin_promote_students_to_next_level(
    target_session_id: int | None = None,
    admin: User = Depends(require_capability("manage_academic_catalogue")),
    db: Session = Depends(get_db),
) -> dict:
    """Bulk advance verified students whose verified session is older than target/active session."""
    if target_session_id:
        target_session = db.get(AcademicSession, target_session_id)
        if not target_session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target session not found.")
    else:
        target_session = db.scalar(select(AcademicSession).where(AcademicSession.is_active == True))
        if not target_session:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active academic session found. Set an active session first.")

    profiles = list(db.scalars(
        select(StudentAcademicProfile).where(
            StudentAcademicProfile.verified_level_id.is_not(None)
        )
    ))

    all_levels = list(db.scalars(select(AcademicLevel).order_by(AcademicLevel.sort_order.asc())))
    level_map = {lvl.id: lvl for lvl in all_levels}
    max_level = all_levels[-1] if all_levels else None

    promoted_details = []
    for p in profiles:
        curr_lvl = level_map.get(p.verified_level_id)
        if not curr_lvl:
            continue

        verified_session = db.get(AcademicSession, p.verified_session_id) if p.verified_session_id else None
        if verified_session and verified_session.starts_on >= target_session.starts_on:
            continue

        if verified_session:
            diff = db.scalar(
                select(func.count(AcademicSession.id)).where(
                    AcademicSession.starts_on > verified_session.starts_on,
                    AcademicSession.starts_on <= target_session.starts_on,
                )
            ) or 1
        else:
            diff = 1

        target_sort = curr_lvl.sort_order + diff
        next_lvl = next((lvl for lvl in all_levels if lvl.sort_order == target_sort), max_level)
        if next_lvl and next_lvl.id != p.verified_level_id:
            old_name = curr_lvl.name
            p.verified_level_id = next_lvl.id
            p.verified_session_id = target_session.id
            p.updated_at = datetime.now(timezone.utc)
            student_user = db.get(User, p.user_id)
            promoted_details.append({
                "student_id": p.user_id,
                "student_name": student_user.full_name if student_user else f"Student #{p.user_id}",
                "from_level": old_name,
                "to_level": next_lvl.name,
                "session": target_session.name,
            })

    db.add(
        AuditEvent(
            actor_user_id=admin.id,
            action="admin.students_promoted_to_next_level",
            target_type="academic_session",
            target_id=str(target_session.id),
            event_metadata={"promoted_count": len(promoted_details)},
        )
    )
    db.commit()

    return {
        "promoted_count": len(promoted_details),
        "active_session_name": target_session.name,
        "details": promoted_details,
    }

