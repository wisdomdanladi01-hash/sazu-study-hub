from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Difficulty = Literal["easy", "medium", "hard"]
OPTION_KEYS = "ABCDE"


class OptionPublic(BaseModel):
    key: str
    text: str


# ---------------------------------------------------------------- admin: questions
class QuestionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    course_id: int = Field(gt=0)
    resource_id: int | None = Field(default=None, gt=0)
    topic: str | None = Field(default=None, max_length=150)
    source_label: str | None = Field(default=None, max_length=150)
    difficulty: Difficulty = "medium"
    text: str = Field(min_length=3, max_length=5000)
    options: list[str] = Field(min_length=2, max_length=5)
    correct_answer: str = Field(min_length=1, max_length=1, description="Letter of the correct option, e.g. 'B'.")
    explanation: str | None = Field(default=None, max_length=5000)
    is_active: bool = True

    @field_validator("options")
    @classmethod
    def options_not_blank(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip() for item in value]
        if any(not item for item in cleaned):
            raise ValueError("Options cannot be blank.")
        if len({item.lower() for item in cleaned}) != len(cleaned):
            raise ValueError("Options must be different from each other.")
        return cleaned

    @field_validator("text")
    @classmethod
    def text_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Question text cannot be blank.")
        return value.strip()

    @model_validator(mode="after")
    def correct_answer_is_an_option(self) -> "QuestionCreate":
        letter = self.correct_answer.strip().upper()
        if letter not in OPTION_KEYS[: len(self.options)]:
            raise ValueError(f"correct_answer must be one of {', '.join(OPTION_KEYS[: len(self.options)])}.")
        self.correct_answer = letter
        return self


class QuestionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resource_id: int | None = Field(default=None, gt=0)
    topic: str | None = Field(default=None, max_length=150)
    source_label: str | None = Field(default=None, max_length=150)
    difficulty: Difficulty | None = None
    text: str | None = Field(default=None, min_length=3, max_length=5000)
    options: list[str] | None = Field(default=None, min_length=2, max_length=5)
    correct_answer: str | None = Field(default=None, min_length=1, max_length=1)
    explanation: str | None = Field(default=None, max_length=5000)
    is_active: bool | None = None


class QuestionAdminResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_id: int
    resource_id: int | None
    topic: str | None
    source_label: str | None
    difficulty: str
    text: str
    options: list[OptionPublic]
    correct_key: str
    explanation: str | None
    is_active: bool
    created_at: datetime


class BulkImportResult(BaseModel):
    created: int
    errors: list[str] = []


# ---------------------------------------------------------------- admin: configurations
class ConfigBase(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    semester_id: int | None = Field(default=None, gt=0)
    question_count: int = Field(default=20, ge=1, le=200)
    duration_minutes: int = Field(default=30, ge=1, le=360)
    pass_mark_percent: int = Field(default=50, ge=0, le=100)
    shuffle_questions: bool = True
    shuffle_options: bool = False
    reveal_answers: bool = True
    max_attempts: int | None = Field(default=None, ge=1, le=100)
    requires_subscription: bool = True
    topics: list[str] | None = None
    resource_ids: list[int] = []
    is_published: bool = False


class ConfigCreate(ConfigBase):
    model_config = ConfigDict(extra="forbid")

    course_id: int = Field(gt=0)


class ConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    semester_id: int | None = Field(default=None, gt=0)
    question_count: int | None = Field(default=None, ge=1, le=200)
    duration_minutes: int | None = Field(default=None, ge=1, le=360)
    pass_mark_percent: int | None = Field(default=None, ge=0, le=100)
    shuffle_questions: bool | None = None
    shuffle_options: bool | None = None
    reveal_answers: bool | None = None
    max_attempts: int | None = Field(default=None, ge=1, le=100)
    requires_subscription: bool | None = None
    topics: list[str] | None = None
    resource_ids: list[int] | None = None
    is_published: bool | None = None


class CourseRef(BaseModel):
    id: int
    code: str
    title: str


class ConfigAdminResponse(BaseModel):
    id: int
    title: str
    description: str | None
    course: CourseRef
    semester_id: int | None
    question_count: int
    duration_minutes: int
    pass_mark_percent: int
    shuffle_questions: bool
    shuffle_options: bool
    reveal_answers: bool
    max_attempts: int | None
    requires_subscription: bool
    topics: list[str] | None
    resource_ids: list[int]
    is_published: bool
    pool_size: int
    attempt_count: int


# ---------------------------------------------------------------- student
class ConfigPublicResponse(BaseModel):
    id: int
    title: str
    description: str | None
    course: CourseRef
    question_count: int  # what a sitting will actually contain (capped by the pool)
    duration_minutes: int
    pass_mark_percent: int
    max_attempts: int | None
    requires_subscription: bool
    locked: bool
    lock_reason: str | None = None
    attempts_used: int = 0
    in_progress_attempt_id: int | None = None
    best_score_percent: float | None = None


class AttemptQuestion(BaseModel):
    id: int
    number: int
    text: str
    options: list[OptionPublic]


class AttemptResponse(BaseModel):
    id: int
    config_id: int
    title: str
    status: str
    started_at: datetime
    expires_at: datetime
    seconds_remaining: int
    total_questions: int
    answers: dict[str, str]
    questions: list[AttemptQuestion]


class AnswerIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question_id: int = Field(gt=0)
    answer_key: str | None = Field(default=None, min_length=1, max_length=1)


class ReviewItem(BaseModel):
    question_id: int
    number: int
    text: str
    options: list[OptionPublic]
    chosen_key: str | None
    correct_key: str | None
    is_correct: bool
    explanation: str | None = None


class AttemptResult(BaseModel):
    attempt_id: int
    config_id: int
    title: str
    status: str
    total_questions: int
    answered: int
    correct_count: int
    score_percent: float
    pass_mark_percent: int
    passed: bool
    grade: str
    submitted_at: datetime | None
    answers_revealed: bool
    review: list[ReviewItem]


class AttemptSummary(BaseModel):
    attempt_id: int
    config_id: int
    title: str
    status: str
    started_at: datetime
    score_percent: float | None
    passed: bool | None
