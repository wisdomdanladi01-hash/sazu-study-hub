from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_admin, get_current_user, get_user_capabilities, require_capability
from app.core.config import settings
from app.db.database import get_db
from app.models.identity import VerificationSubmission
from app.models.user import Role, User
from app.schemas.verification import (
    VerificationDecision,
    VerificationDocumentResponse,
    VerificationQueueItem,
    VerificationStateResponse,
    VerificationSubmissionCreate,
    VerificationSubmissionResponse,
)
from app.services.errors import ConflictError, NotFoundError, PolicyError
from app.services.verification import (
    audit_verification_document_access,
    get_authorized_verification_document,
    get_verification_state,
    list_verification_documents,
    list_pending_verifications,
    record_verification_document,
    review_verification,
    submit_verification,
)

router = APIRouter(prefix="/verification", tags=["student verification"])
admin_router = APIRouter(
    prefix="/admin/verification",
    tags=["verification administration"],
    dependencies=[Depends(require_capability("manage_verifications"))],
)


def _submission_response(submission: VerificationSubmission) -> VerificationSubmissionResponse:
    return VerificationSubmissionResponse(
        id=submission.id,
        status=submission.status,
        verification_method=submission.verification_method,
    )


@router.get("/state", response_model=VerificationStateResponse)
def verification_state(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> VerificationStateResponse:
    state, verified_level_id, verified_session_id = get_verification_state(db, user.id)
    return VerificationStateResponse(
        status=state,
        verified_level_id=verified_level_id,
        verified_session_id=verified_session_id,
    )


@router.post(
    "/submissions",
    response_model=VerificationSubmissionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_verification_submission(
    data: VerificationSubmissionCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> VerificationSubmissionResponse:
    try:
        submission = submit_verification(db, user, data)
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except PolicyError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return _submission_response(submission)


@router.post(
    "/submissions/{submission_id}/documents",
    response_model=VerificationDocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_verification_document(
    submission_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    upload: UploadFile = File(...),
) -> VerificationDocumentResponse:
    content = await upload.read(settings.verification_document_max_bytes + 1)
    try:
        document = record_verification_document(
            db,
            user,
            submission_id,
            upload.filename or "supporting-document",
            upload.content_type,
            content,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PolicyError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except ValueError as exc:
        status_code = (
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
            if len(content) > settings.verification_document_max_bytes
            else status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
        )
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    finally:
        await upload.close()

    return VerificationDocumentResponse(
        id=document.id,
        original_filename=document.original_filename,
        mime_type=document.mime_type,
        size_bytes=document.size_bytes,
    )


@router.get(
    "/submissions/{submission_id}/documents/{document_id}",
    response_class=FileResponse,
)
def read_verification_document(
    submission_id: int,
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    is_admin = user.is_superuser or ("manage_verifications" in get_user_capabilities(user, db))
    try:
        document, path = get_authorized_verification_document(
            db, user, document_id, is_admin
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    submission = db.get(VerificationSubmission, submission_id)
    if submission is None or document.submission_id != submission.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Verification document not found.")
    audit_verification_document_access(db, user, document, is_admin)
    return FileResponse(
        path=path,
        media_type=document.mime_type,
        filename=Path(document.original_filename).name,
        content_disposition_type="attachment",
    )


@admin_router.get("/submissions", response_model=list[VerificationQueueItem])
def pending_verifications(
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> list[VerificationQueueItem]:
    return [
        VerificationQueueItem(
            id=item.id,
            user_id=item.user_id,
            status=item.status,
            jamb_registration_number=item.jamb_registration_number,
            matriculation_number=item.matriculation_number,
            programme_id=item.programme_id,
            department_id=item.department_id,
            admission_session_id=item.admission_session_id,
            claimed_level_id=item.claimed_level_id,
        )
        for item in list_pending_verifications(db)
    ]


@admin_router.get(
    "/submissions/{submission_id}/documents",
    response_model=list[VerificationDocumentResponse],
)
def verification_documents_for_review(
    submission_id: int,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> list[VerificationDocumentResponse]:
    try:
        documents = list_verification_documents(db, submission_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return [
        VerificationDocumentResponse(
            id=document.id,
            original_filename=document.original_filename,
            mime_type=document.mime_type,
            size_bytes=document.size_bytes,
        )
        for document in documents
    ]


@admin_router.post(
    "/submissions/{submission_id}/decision",
    response_model=VerificationSubmissionResponse,
)
def decide_verification(
    submission_id: int,
    data: VerificationDecision,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> VerificationSubmissionResponse:
    try:
        submission = review_verification(db, admin, submission_id, data)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PolicyError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return _submission_response(submission)
