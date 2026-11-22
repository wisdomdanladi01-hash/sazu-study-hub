from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import (
    get_current_admin,
    get_current_user,
    get_optional_user,
    get_user_capabilities,
    require_capability,
)
from app.db.database import get_db
from app.models.assessment import AssessmentConfig, AssessmentQuestion
from app.models.user import Role, User
from app.schemas.assessment import (
    AnswerIn,
    AttemptResponse,
    AttemptResult,
    AttemptSummary,
    BulkImportResult,
    ConfigAdminResponse,
    ConfigCreate,
    ConfigPublicResponse,
    ConfigUpdate,
    QuestionAdminResponse,
    QuestionCreate,
    QuestionUpdate,
)
from app.services import assessments as service
from app.services.errors import ConflictError, NotFoundError, PolicyError

router = APIRouter(tags=["assessments"])
admin_router = APIRouter(
    prefix="/admin/assessments",
    tags=["assessment administration"],
    dependencies=[Depends(require_capability("manage_assessments"))],
)


def _is_admin(db: Session, user: User | None) -> bool:
    if user is None:
        return False
    if user.is_superuser:
        return True
    return "manage_assessments" in get_user_capabilities(user, db)


def _http(exc: Exception) -> HTTPException:
    if isinstance(exc, NotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if isinstance(exc, ConflictError):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


def _http_validation(exc: PolicyError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


# ======================================================================= student
@router.get("/assessments", response_model=list[ConfigPublicResponse])
def list_assessments(
    user: Annotated[User | None, Depends(get_optional_user)],
    db: Session = Depends(get_db),
) -> list[ConfigPublicResponse]:
    return service.list_public_configs(db, user, is_admin=_is_admin(db, user))


@router.get("/assessments/attempts", response_model=list[AttemptSummary])
def my_attempts(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AttemptSummary]:
    return [
        AttemptSummary(
            attempt_id=attempt.id,
            config_id=attempt.config_id,
            title=title,
            status=attempt.status,
            started_at=attempt.started_at,
            score_percent=attempt.score_percent,
            passed=attempt.passed,
        )
        for attempt, title in service.list_attempts(db, user)
    ]


@router.post("/assessments/{config_id}/attempts", response_model=AttemptResponse, status_code=status.HTTP_201_CREATED)
def start_attempt(
    config_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AttemptResponse:
    try:
        config = service.get_config(db, config_id)
        attempt = service.start_attempt(db, user, config, is_admin=_is_admin(db, user))
    except (NotFoundError, ConflictError, PolicyError) as exc:
        raise _http(exc) from exc
    return service.attempt_response(db, attempt)


@router.get("/assessments/attempts/{attempt_id}", response_model=AttemptResponse)
def read_attempt(
    attempt_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AttemptResponse:
    try:
        attempt = service.get_attempt(db, user, attempt_id)
    except NotFoundError as exc:
        raise _http(exc) from exc
    return service.attempt_response(db, attempt)


@router.put("/assessments/attempts/{attempt_id}/answers", status_code=status.HTTP_204_NO_CONTENT)
def save_answer(
    attempt_id: int,
    data: AnswerIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    try:
        attempt = service.get_attempt(db, user, attempt_id)
        service.save_answer(db, attempt, data.question_id, data.answer_key)
    except NotFoundError as exc:
        raise _http(exc) from exc
    except PolicyError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post("/assessments/attempts/{attempt_id}/submit", response_model=AttemptResult)
def submit_attempt(
    attempt_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AttemptResult:
    try:
        attempt = service.get_attempt(db, user, attempt_id)
        service.submit_attempt(db, attempt)
        return service.attempt_result(db, attempt)
    except NotFoundError as exc:
        raise _http(exc) from exc
    except PolicyError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("/assessments/attempts/{attempt_id}/results", response_model=AttemptResult)
def attempt_results(
    attempt_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AttemptResult:
    try:
        attempt = service.get_attempt(db, user, attempt_id)
        return service.attempt_result(db, attempt)
    except NotFoundError as exc:
        raise _http(exc) from exc
    except PolicyError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


# ======================================================================= admin: questions
@admin_router.get("/questions", response_model=list[QuestionAdminResponse])
def admin_list_questions(
    course_id: Annotated[int | None, Query(gt=0)] = None,
    resource_id: Annotated[int | None, Query(gt=0)] = None,
    topic: Annotated[str | None, Query(max_length=150)] = None,
    include_inactive: bool = False,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> list[AssessmentQuestion]:
    return service.list_questions(
        db,
        course_id=course_id,
        resource_id=resource_id,
        topic=topic,
        include_inactive=include_inactive,
        limit=limit,
        offset=offset,
    )


@admin_router.post("/questions", response_model=QuestionAdminResponse, status_code=status.HTTP_201_CREATED)
def admin_create_question(
    data: QuestionCreate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> AssessmentQuestion:
    try:
        return service.create_question(db, admin, data)
    except PolicyError as exc:
        raise _http_validation(exc) from exc


@admin_router.post("/questions/import", response_model=BulkImportResult)
def admin_import_questions(
    upload: Annotated[UploadFile, File()],
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> BulkImportResult:
    content = upload.file.read(service.CSV_MAX_BYTES + 1)
    try:
        return service.import_questions_csv(db, admin, content)
    except PolicyError as exc:
        raise _http_validation(exc) from exc
    finally:
        upload.file.close()


@admin_router.patch("/questions/{question_id}", response_model=QuestionAdminResponse)
def admin_update_question(
    question_id: int,
    data: QuestionUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> AssessmentQuestion:
    question = db.get(AssessmentQuestion, question_id)
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")
    try:
        return service.update_question(db, admin, question, data)
    except PolicyError as exc:
        raise _http_validation(exc) from exc


@admin_router.delete("/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_remove_question(
    question_id: int,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> None:
    question = db.get(AssessmentQuestion, question_id)
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")
    service.deactivate_question(db, admin, question)


# ======================================================================= admin: configurations
@admin_router.get("/configs", response_model=list[ConfigAdminResponse])
def admin_list_configs(
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> list[ConfigAdminResponse]:
    configs = db.scalars(select(AssessmentConfig).order_by(AssessmentConfig.id.desc()))
    return [service.config_admin_response(db, config) for config in configs]


@admin_router.post("/configs", response_model=ConfigAdminResponse, status_code=status.HTTP_201_CREATED)
def admin_create_config(
    data: ConfigCreate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> ConfigAdminResponse:
    try:
        config = service.create_config(db, admin, data)
    except PolicyError as exc:
        raise _http_validation(exc) from exc
    return service.config_admin_response(db, config)


@admin_router.patch("/configs/{config_id}", response_model=ConfigAdminResponse)
def admin_update_config(
    config_id: int,
    data: ConfigUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> ConfigAdminResponse:
    try:
        config = service.update_config(db, admin, service.get_config(db, config_id), data)
    except NotFoundError as exc:
        raise _http(exc) from exc
    except PolicyError as exc:
        raise _http_validation(exc) from exc
    return service.config_admin_response(db, config)


@admin_router.delete("/configs/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_config(
    config_id: int,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> None:
    try:
        service.delete_config(db, admin, service.get_config(db, config_id))
    except (NotFoundError, ConflictError) as exc:
        raise _http(exc) from exc
