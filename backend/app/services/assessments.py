from __future__ import annotations

import csv
import io
import random
from datetime import datetime, timedelta, timezone
from typing import Any

from pydantic import ValidationError
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.models.academic import Course, CourseOffering, Semester
from app.models.assessment import (
    AssessmentAttempt,
    AssessmentConfig,
    AssessmentConfigResource,
    AssessmentQuestion,
)
from app.models.audit import AuditEvent
from app.models.resource import Resource
from app.models.user import User
from app.schemas.assessment import (
    OPTION_KEYS,
    AttemptQuestion,
    AttemptResponse,
    AttemptResult,
    BulkImportResult,
    ConfigAdminResponse,
    ConfigCreate,
    ConfigPublicResponse,
    ConfigUpdate,
    CourseRef,
    OptionPublic,
    QuestionCreate,
    QuestionUpdate,
    ReviewItem,
)
from app.services.errors import ConflictError, NotFoundError, PolicyError
from app.services.resources import is_verified_student, find_paid_entitlement

# A short grace period so a submit that was in flight when the timer ended still counts.
SUBMIT_GRACE_SECONDS = 20
CSV_MAX_BYTES = 2 * 1024 * 1024
CSV_MAX_ROWS = 2000

_LOCK_MESSAGES = {
    "sign_in_required": "Sign in to take this test.",
    "verification_required": "Your student verification must be approved before you can take this test.",
    "subscription_required": "An active subscription is required to take this test.",
}


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def grade_label(percent: float) -> str:
    if percent >= 70:
        return "Distinction"
    if percent >= 60:
        return "Credit"
    if percent >= 50:
        return "Pass"
    return "Fail"


def _audit(db: Session, actor_id: int, action: str, target_type: str, target_id: int | str) -> None:
    db.add(AuditEvent(actor_user_id=actor_id, action=action, target_type=target_type, target_id=str(target_id)))


# ------------------------------------------------------------------ question bank (admin)
def _options_payload(options: list[str]) -> list[dict[str, str]]:
    return [{"key": OPTION_KEYS[index], "text": text} for index, text in enumerate(options)]


def _check_course_and_resource(db: Session, course_id: int, resource_id: int | None) -> None:
    if db.get(Course, course_id) is None:
        raise PolicyError("The selected course does not exist.")
    if resource_id is not None:
        resource = db.get(Resource, resource_id)
        if resource is None:
            raise PolicyError("The selected source resource does not exist.")
        if resource.course_id is not None and resource.course_id != course_id:
            raise PolicyError("The source resource belongs to a different course.")


def _clean_topic(topic: str | None) -> str | None:
    cleaned = (topic or "").strip()
    return cleaned or None


def create_question(db: Session, admin: User, data: QuestionCreate, *, commit: bool = True) -> AssessmentQuestion:
    _check_course_and_resource(db, data.course_id, data.resource_id)
    question = AssessmentQuestion(
        course_id=data.course_id,
        resource_id=data.resource_id,
        topic=_clean_topic(data.topic),
        source_label=(data.source_label or "").strip() or None,
        difficulty=data.difficulty,
        text=data.text,
        options=_options_payload(data.options),
        correct_key=data.correct_answer,
        explanation=(data.explanation or "").strip() or None,
        is_active=data.is_active,
        created_by_id=admin.id,
    )
    db.add(question)
    if commit:
        db.flush()
        _audit(db, admin.id, "admin.question_created", "assessment_question", question.id)
        db.commit()
    return question


def update_question(db: Session, admin: User, question: AssessmentQuestion, data: QuestionUpdate) -> AssessmentQuestion:
    values = data.model_dump(exclude_unset=True)
    if "resource_id" in values:
        _check_course_and_resource(db, question.course_id, values["resource_id"])
        question.resource_id = values["resource_id"]

    texts = values.get("options")
    if texts is not None:
        texts = [item.strip() for item in texts]
        if any(not item for item in texts) or len({item.lower() for item in texts}) != len(texts):
            raise PolicyError("Options must be non-blank and different from each other.")
    else:
        texts = [option["text"] for option in question.options]
    correct = (values.get("correct_answer") or question.correct_key).strip().upper()
    if correct not in OPTION_KEYS[: len(texts)]:
        raise PolicyError(f"The correct answer must be one of {', '.join(OPTION_KEYS[: len(texts)])}.")
    question.options = _options_payload(texts)
    question.correct_key = correct

    for field in ("topic", "source_label", "explanation"):
        if field in values:
            cleaned = (values[field] or "").strip() or None
            setattr(question, field, cleaned)
    if values.get("text") is not None:
        if not values["text"].strip():
            raise PolicyError("Question text cannot be blank.")
        question.text = values["text"].strip()
    if values.get("difficulty") is not None:
        question.difficulty = values["difficulty"]
    if values.get("is_active") is not None:
        question.is_active = values["is_active"]

    _audit(db, admin.id, "admin.question_updated", "assessment_question", question.id)
    db.commit()
    return question


def deactivate_question(db: Session, admin: User, question: AssessmentQuestion) -> None:
    # Soft delete: past attempts keep referring to the question for their review screens.
    question.is_active = False
    _audit(db, admin.id, "admin.question_deactivated", "assessment_question", question.id)
    db.commit()


def list_questions(
    db: Session,
    *,
    course_id: int | None,
    resource_id: int | None,
    topic: str | None,
    include_inactive: bool,
    limit: int,
    offset: int,
) -> list[AssessmentQuestion]:
    query = select(AssessmentQuestion)
    if course_id is not None:
        query = query.where(AssessmentQuestion.course_id == course_id)
    if resource_id is not None:
        query = query.where(AssessmentQuestion.resource_id == resource_id)
    if topic:
        query = query.where(func.lower(AssessmentQuestion.topic) == topic.strip().lower())
    if not include_inactive:
        query = query.where(AssessmentQuestion.is_active.is_(True))
    return list(
        db.scalars(query.order_by(AssessmentQuestion.id.desc()).limit(limit).offset(offset))
    )


def import_questions_csv(db: Session, admin: User, content: bytes) -> BulkImportResult:
    """All-or-nothing CSV import. Columns: course_code, question, option_a..option_e, correct, ..."""
    if len(content) > CSV_MAX_BYTES:
        raise PolicyError("The CSV file is larger than 2 MB.")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise PolicyError("The CSV file must be UTF-8 encoded.") from exc

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise PolicyError("The CSV file is empty.")
    reader.fieldnames = [(name or "").strip().lower() for name in reader.fieldnames]
    required = {"course_code", "question", "option_a", "option_b", "correct"}
    missing = required - set(reader.fieldnames)
    if missing:
        raise PolicyError(f"Missing required columns: {', '.join(sorted(missing))}.")

    def normalise(code: str) -> str:
        return "".join(code.split()).upper()

    courses: dict[str, list[Course]] = {}
    for course in db.scalars(select(Course)):
        courses.setdefault(normalise(course.code), []).append(course)

    errors: list[str] = []
    prepared: list[QuestionCreate] = []
    for row_number, row in enumerate(reader, start=2):
        if row_number - 1 > CSV_MAX_ROWS:
            raise PolicyError(f"The CSV file has more than {CSV_MAX_ROWS} rows.")
        row = {key: (value or "").strip() for key, value in row.items() if key}
        if not any(row.values()):
            continue
        matches = courses.get(normalise(row.get("course_code", "")), [])
        if len(matches) != 1:
            errors.append(
                f"Row {row_number}: course code '{row.get('course_code', '')}' "
                + ("was not found." if not matches else "matches more than one course.")
            )
            continue
        options = [row[key] for key in (f"option_{letter.lower()}" for letter in OPTION_KEYS) if row.get(key)]
        resource_raw = row.get("resource_id", "")
        try:
            item = (
                QuestionCreate(
                    course_id=matches[0].id,
                    resource_id=int(resource_raw) if resource_raw else None,
                    topic=row.get("topic") or None,
                    source_label=row.get("source_label") or None,
                    difficulty=(row.get("difficulty") or "medium").lower(),
                    text=row["question"],
                    options=options,
                    correct_answer=row["correct"].upper(),
                    explanation=row.get("explanation") or None,
                )
            )
            _check_course_and_resource(db, item.course_id, item.resource_id)
            prepared.append(item)
        except (ValidationError, ValueError, PolicyError) as exc:
            reason = exc.errors()[0]["msg"] if isinstance(exc, ValidationError) else str(exc)
            errors.append(f"Row {row_number}: {reason}")

    if errors:
        return BulkImportResult(created=0, errors=errors[:50])
    if not prepared:
        raise PolicyError("The CSV file has no question rows.")

    try:
        for item in prepared:
            create_question(db, admin, item, commit=False)
        _audit(db, admin.id, "admin.questions_imported", "assessment_question", len(prepared))
        db.commit()
    except PolicyError:
        db.rollback()
        raise
    return BulkImportResult(created=len(prepared), errors=[])


# ------------------------------------------------------------------ configurations (admin)
def _default_semester_id(db: Session, course_id: int, resource_ids: list[int]) -> int | None:
    """Subscriptions are per semester, so a test needs one to be covered by them."""
    if resource_ids:
        semester_id = db.scalar(
            select(Resource.semester_id)
            .where(Resource.id.in_(resource_ids), Resource.semester_id.is_not(None))
            .limit(1)
        )
        if semester_id is not None:
            return semester_id
    return db.scalar(
        select(CourseOffering.semester_id)
        .where(CourseOffering.course_id == course_id, CourseOffering.semester_id.is_not(None))
        .order_by(CourseOffering.id.desc())
        .limit(1)
    )


def _validate_config_refs(db: Session, course_id: int, semester_id: int | None, resource_ids: list[int]) -> None:
    if db.get(Course, course_id) is None:
        raise PolicyError("The selected course does not exist.")
    if semester_id is not None and db.get(Semester, semester_id) is None:
        raise PolicyError("The selected semester does not exist.")
    if resource_ids:
        found = set(db.scalars(select(Resource.id).where(Resource.id.in_(resource_ids))))
        if found != set(resource_ids):
            raise PolicyError("One or more selected source resources do not exist.")


def _clean_topics(topics: list[str] | None) -> list[str] | None:
    cleaned = [item.strip() for item in (topics or []) if item and item.strip()]
    return cleaned or None


def create_config(db: Session, admin: User, data: ConfigCreate) -> AssessmentConfig:
    resource_ids = sorted(set(data.resource_ids))
    _validate_config_refs(db, data.course_id, data.semester_id, resource_ids)
    config = AssessmentConfig(
        title=data.title.strip(),
        description=(data.description or "").strip() or None,
        course_id=data.course_id,
        semester_id=data.semester_id or _default_semester_id(db, data.course_id, resource_ids),
        question_count=data.question_count,
        duration_minutes=data.duration_minutes,
        pass_mark_percent=data.pass_mark_percent,
        shuffle_questions=data.shuffle_questions,
        shuffle_options=data.shuffle_options,
        reveal_answers=data.reveal_answers,
        max_attempts=data.max_attempts,
        requires_subscription=data.requires_subscription,
        topics=_clean_topics(data.topics),
        is_published=data.is_published,
        created_by_id=admin.id,
    )
    config.resource_links = [AssessmentConfigResource(resource_id=rid) for rid in resource_ids]
    db.add(config)
    db.flush()
    _audit(db, admin.id, "admin.assessment_created", "assessment_config", config.id)
    db.commit()
    return config


def update_config(db: Session, admin: User, config: AssessmentConfig, data: ConfigUpdate) -> AssessmentConfig:
    values = data.model_dump(exclude_unset=True)
    resource_ids = sorted(set(values["resource_ids"])) if values.get("resource_ids") is not None else config.resource_ids
    semester_id = values["semester_id"] if "semester_id" in values else config.semester_id
    _validate_config_refs(db, config.course_id, semester_id, resource_ids)

    for field in (
        "title",
        "description",
        "question_count",
        "duration_minutes",
        "pass_mark_percent",
        "shuffle_questions",
        "shuffle_options",
        "reveal_answers",
        "max_attempts",
        "requires_subscription",
        "is_published",
    ):
        if field in values:
            if field in ("title", "question_count", "duration_minutes", "pass_mark_percent") and values[field] is None:
                raise PolicyError(f"{field} cannot be empty.")
            setattr(config, field, values[field])
    if "topics" in values:
        config.topics = _clean_topics(values["topics"])
    config.semester_id = semester_id
    if values.get("resource_ids") is not None:
        # Diff rather than replace: delete+insert of the same (config, resource) pair in one
        # flush can trip the unique constraint.
        existing = {link.resource_id: link for link in config.resource_links}
        for resource_id, link in existing.items():
            if resource_id not in resource_ids:
                config.resource_links.remove(link)
        for resource_id in resource_ids:
            if resource_id not in existing:
                config.resource_links.append(AssessmentConfigResource(resource_id=resource_id))
    _audit(db, admin.id, "admin.assessment_updated", "assessment_config", config.id)
    db.commit()
    return config


def delete_config(db: Session, admin: User, config: AssessmentConfig) -> None:
    attempts = db.scalar(select(func.count()).select_from(AssessmentAttempt).where(AssessmentAttempt.config_id == config.id))
    if attempts:
        raise ConflictError("Students have already taken this test. Unpublish it instead of deleting it.")
    _audit(db, admin.id, "admin.assessment_deleted", "assessment_config", config.id)
    db.delete(config)
    db.commit()


def get_config(db: Session, config_id: int) -> AssessmentConfig:
    config = db.get(AssessmentConfig, config_id)
    if config is None:
        raise NotFoundError("Test not found.")
    return config


def pool_query(config: AssessmentConfig) -> Select[Any]:
    query = select(AssessmentQuestion).where(
        AssessmentQuestion.is_active.is_(True),
        AssessmentQuestion.course_id == config.course_id,
    )
    resource_ids = config.resource_ids
    if resource_ids:
        query = query.where(AssessmentQuestion.resource_id.in_(resource_ids))
    if config.topics:
        query = query.where(func.lower(AssessmentQuestion.topic).in_([topic.lower() for topic in config.topics]))
    return query


def pool_size(db: Session, config: AssessmentConfig) -> int:
    return db.scalar(select(func.count()).select_from(pool_query(config).subquery())) or 0


def _course_ref(db: Session, course_id: int) -> CourseRef:
    course = db.get(Course, course_id)
    return CourseRef(id=course_id, code=course.code if course else "?", title=course.title if course else "Unknown course")


def config_admin_response(db: Session, config: AssessmentConfig) -> ConfigAdminResponse:
    attempts = db.scalar(select(func.count()).select_from(AssessmentAttempt).where(AssessmentAttempt.config_id == config.id)) or 0
    return ConfigAdminResponse(
        id=config.id,
        title=config.title,
        description=config.description,
        course=_course_ref(db, config.course_id),
        semester_id=config.semester_id,
        question_count=config.question_count,
        duration_minutes=config.duration_minutes,
        pass_mark_percent=config.pass_mark_percent,
        shuffle_questions=config.shuffle_questions,
        shuffle_options=config.shuffle_options,
        reveal_answers=config.reveal_answers,
        max_attempts=config.max_attempts,
        requires_subscription=config.requires_subscription,
        topics=config.topics,
        resource_ids=config.resource_ids,
        is_published=config.is_published,
        pool_size=pool_size(db, config),
        attempt_count=attempts,
    )


# ------------------------------------------------------------------ student access
def assessment_lock_reason(db: Session, user: User | None, config: AssessmentConfig, *, is_admin: bool) -> str | None:
    """Return None if the user may sit this test, otherwise a machine-readable reason."""
    if is_admin:
        return None
    if user is None:
        return "sign_in_required"
    if not config.requires_subscription:
        return None
    if not is_verified_student(db, user):
        return "verification_required"
    found = find_paid_entitlement(
        db, user, resource_id=None, course_id=config.course_id, semester_id=config.semester_id
    )
    if found is None and config.resource_links:
        for link in config.resource_links:
            found = find_paid_entitlement(
                db, user, resource_id=link.resource_id, course_id=None, semester_id=None
            )
            if found is not None:
                break
    return None if found is not None else "subscription_required"


def _attempts_for(db: Session, user_id: int, config_id: int) -> list[AssessmentAttempt]:
    return list(
        db.scalars(
            select(AssessmentAttempt)
            .where(AssessmentAttempt.user_id == user_id, AssessmentAttempt.config_id == config_id)
            .order_by(AssessmentAttempt.id.desc())
        )
    )


def list_public_configs(db: Session, user: User | None, *, is_admin: bool) -> list[ConfigPublicResponse]:
    configs = list(
        db.scalars(select(AssessmentConfig).where(AssessmentConfig.is_published.is_(True)).order_by(AssessmentConfig.id.desc()))
    )
    items: list[ConfigPublicResponse] = []
    for config in configs:
        size = pool_size(db, config)
        if size == 0:
            continue  # nothing to sit yet; hide rather than show an empty test
        reason = assessment_lock_reason(db, user, config, is_admin=is_admin)
        attempts = _attempts_for(db, user.id, config.id) if user is not None else []
        in_progress = next(
            (a.id for a in attempts if a.status == "in_progress" and _utc(a.expires_at) > datetime.now(timezone.utc)),
            None,
        )
        scores = [a.score_percent for a in attempts if a.score_percent is not None]
        items.append(
            ConfigPublicResponse(
                id=config.id,
                title=config.title,
                description=config.description,
                course=_course_ref(db, config.course_id),
                question_count=min(config.question_count, size),
                duration_minutes=config.duration_minutes,
                pass_mark_percent=config.pass_mark_percent,
                max_attempts=config.max_attempts,
                requires_subscription=config.requires_subscription,
                locked=reason is not None,
                lock_reason=reason,
                attempts_used=len(attempts),
                in_progress_attempt_id=in_progress,
                best_score_percent=max(scores) if scores else None,
            )
        )
    return items


# ------------------------------------------------------------------ attempts
def start_attempt(db: Session, user: User, config: AssessmentConfig, *, is_admin: bool) -> AssessmentAttempt:
    if not config.is_published and not is_admin:
        raise NotFoundError("Test not found.")
    reason = assessment_lock_reason(db, user, config, is_admin=is_admin)
    if reason is not None:
        raise PolicyError(_LOCK_MESSAGES[reason])

    attempts = _attempts_for(db, user.id, config.id)
    for attempt in attempts:
        if attempt.status == "in_progress":
            finalize_if_expired(db, attempt)
            if attempt.status == "in_progress":
                return attempt  # resume rather than start a second sitting
    if config.max_attempts is not None and len(attempts) >= config.max_attempts:
        raise PolicyError("You have used all of your attempts for this test.")

    pool = list(db.scalars(pool_query(config)))
    if not pool:
        raise ConflictError("This test does not have any questions yet.")
    chosen = random.sample(pool, min(config.question_count, len(pool)))
    if config.shuffle_questions:
        random.shuffle(chosen)
    else:
        chosen.sort(key=lambda question: question.id)

    option_orders: dict[str, list[str]] = {}
    for question in chosen:
        keys = [option["key"] for option in question.options]
        if config.shuffle_options:
            random.shuffle(keys)
        option_orders[str(question.id)] = keys

    now = datetime.now(timezone.utc)
    attempt = AssessmentAttempt(
        config_id=config.id,
        user_id=user.id,
        status="in_progress",
        started_at=now,
        expires_at=now + timedelta(minutes=config.duration_minutes),
        question_ids=[question.id for question in chosen],
        option_orders=option_orders,
        answers={},
        total_questions=len(chosen),
    )
    db.add(attempt)
    db.commit()
    return attempt


def get_attempt(db: Session, user: User, attempt_id: int) -> AssessmentAttempt:
    attempt = db.get(AssessmentAttempt, attempt_id)
    if attempt is None or attempt.user_id != user.id:
        raise NotFoundError("Attempt not found.")
    finalize_if_expired(db, attempt)
    return attempt


def _questions_by_id(db: Session, ids: list[int]) -> dict[int, AssessmentQuestion]:
    rows = db.scalars(select(AssessmentQuestion).where(AssessmentQuestion.id.in_(ids)))
    return {row.id: row for row in rows}


def _ordered_options(attempt: AssessmentAttempt, question: AssessmentQuestion) -> list[OptionPublic]:
    by_key = {option["key"]: option["text"] for option in question.options}
    order = attempt.option_orders.get(str(question.id)) or list(by_key)
    return [OptionPublic(key=key, text=by_key[key]) for key in order if key in by_key]


def attempt_response(db: Session, attempt: AssessmentAttempt) -> AttemptResponse:
    """Questions for the sitting. Never includes correct answers or explanations."""
    questions = _questions_by_id(db, attempt.question_ids)
    config = db.get(AssessmentConfig, attempt.config_id)
    now = datetime.now(timezone.utc)
    return AttemptResponse(
        id=attempt.id,
        config_id=attempt.config_id,
        title=config.title if config else "Test",
        status=attempt.status,
        started_at=attempt.started_at,
        expires_at=attempt.expires_at,
        seconds_remaining=max(0, int((_utc(attempt.expires_at) - now).total_seconds())),
        total_questions=attempt.total_questions,
        answers=attempt.answers or {},
        questions=[
            AttemptQuestion(
                id=question_id,
                number=index,
                text=questions[question_id].text,
                options=_ordered_options(attempt, questions[question_id]),
            )
            for index, question_id in enumerate(attempt.question_ids, start=1)
            if question_id in questions
        ],
    )


def save_answer(db: Session, attempt: AssessmentAttempt, question_id: int, answer_key: str | None) -> None:
    if attempt.status != "in_progress":
        raise PolicyError("This attempt has already been submitted.")
    if question_id not in attempt.question_ids:
        raise PolicyError("That question is not part of this attempt.")
    answers = dict(attempt.answers or {})
    if answer_key is None:
        answers.pop(str(question_id), None)
    else:
        key = answer_key.strip().upper()
        if key not in attempt.option_orders.get(str(question_id), []):
            raise PolicyError("That is not a valid option for this question.")
        answers[str(question_id)] = key
    attempt.answers = answers  # reassign so the JSON change is persisted
    db.commit()


def _grade(db: Session, attempt: AssessmentAttempt, final_status: str) -> None:
    questions = _questions_by_id(db, attempt.question_ids)
    answers = attempt.answers or {}
    correct = sum(
        1 for question_id in attempt.question_ids
        if question_id in questions and answers.get(str(question_id)) == questions[question_id].correct_key
    )
    config = db.get(AssessmentConfig, attempt.config_id)
    percent = round(correct / attempt.total_questions * 100, 1) if attempt.total_questions else 0.0
    attempt.correct_count = correct
    attempt.score_percent = percent
    attempt.passed = percent >= (config.pass_mark_percent if config else 50)
    attempt.status = final_status
    attempt.submitted_at = datetime.now(timezone.utc)
    db.commit()


def finalize_if_expired(db: Session, attempt: AssessmentAttempt) -> None:
    if attempt.status != "in_progress":
        return
    deadline = _utc(attempt.expires_at) + timedelta(seconds=SUBMIT_GRACE_SECONDS)
    if datetime.now(timezone.utc) > deadline:
        _grade(db, attempt, "expired")


def submit_attempt(db: Session, attempt: AssessmentAttempt) -> AssessmentAttempt:
    if attempt.status == "in_progress":
        _grade(db, attempt, "submitted")
    return attempt


def attempt_result(db: Session, attempt: AssessmentAttempt) -> AttemptResult:
    if attempt.status == "in_progress":
        raise PolicyError("Submit the test to see your results.")
    config = db.get(AssessmentConfig, attempt.config_id)
    reveal = bool(config.reveal_answers) if config else True
    answers = attempt.answers or {}
    review: list[ReviewItem] = []
    if reveal:
        questions = _questions_by_id(db, attempt.question_ids)
        for index, question_id in enumerate(attempt.question_ids, start=1):
            question = questions.get(question_id)
            if question is None:
                continue
            chosen = answers.get(str(question_id))
            review.append(
                ReviewItem(
                    question_id=question_id,
                    number=index,
                    text=question.text,
                    options=_ordered_options(attempt, question),
                    chosen_key=chosen,
                    correct_key=question.correct_key,
                    is_correct=chosen == question.correct_key,
                    explanation=question.explanation,
                )
            )
    percent = attempt.score_percent or 0.0
    return AttemptResult(
        attempt_id=attempt.id,
        config_id=attempt.config_id,
        title=config.title if config else "Test",
        status=attempt.status,
        total_questions=attempt.total_questions,
        answered=len(answers),
        correct_count=attempt.correct_count or 0,
        score_percent=percent,
        pass_mark_percent=config.pass_mark_percent if config else 50,
        passed=bool(attempt.passed),
        grade=grade_label(percent),
        submitted_at=attempt.submitted_at,
        answers_revealed=reveal,
        review=review,
    )


def list_attempts(db: Session, user: User) -> list[tuple[AssessmentAttempt, str]]:
    rows = db.execute(
        select(AssessmentAttempt, AssessmentConfig.title)
        .join(AssessmentConfig, AssessmentConfig.id == AssessmentAttempt.config_id)
        .where(AssessmentAttempt.user_id == user.id)
        .order_by(AssessmentAttempt.id.desc())
        .limit(100)
    ).all()
    return [(attempt, title) for attempt, title in rows]
