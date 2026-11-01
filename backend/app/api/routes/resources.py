from datetime import datetime
from typing import Annotated, Literal

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import bearer_scheme, get_current_admin, get_current_user
from app.core.config import settings
from app.core.security import decode_access_token
from app.db.database import get_db
from app.models.resource import Resource
from app.models.user import Role, User
from app.schemas.resource import (
    PreviewPolicy,
    ResourceCategoryCreate,
    ResourceCategoryResponse,
    ResourceFileResponse,
    ResourcePreviewResponse,
    ResourceResponse,
    ResourceUpdate,
)
from app.services.errors import ConflictError, NotFoundError, PolicyError
from app.services.resources import (
    can_download_resource,
    create_resource,
    create_resource_category,
    delete_resource,
    get_resource,
    get_resource_file,
    list_resource_categories,
    list_resource_files,
    list_resources,
    replace_resource_file,
    resource_download_path,
    resource_file_download_path,
    resource_is_available,
    update_resource,
)

router = APIRouter(prefix="/resources", tags=["resources"])
admin_router = APIRouter(prefix="/admin/resources", tags=["resource administration"])


def _get_resource_or_404(db: Session, resource_id: int) -> Resource:
    try:
        return get_resource(db, resource_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


def _read_upload(upload: UploadFile) -> bytes:
    return upload.file.read(settings.resource_max_bytes + 1)


def _is_admin(db: Session, user: User) -> bool:
    return user.is_superuser or db.scalar(
        select(Role.id).where(Role.id == user.role_id, Role.name == "admin")
    ) is not None


def _upload_error(exc: ValueError, content: bytes) -> HTTPException:
    code = (
        status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
        if len(content) > settings.resource_max_bytes
        else status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
    )
    return HTTPException(status_code=code, detail=str(exc))


def _get_optional_user(
    credentials: HTTPAuthorizationCredentials | None,
    db: Session,
) -> User | None:
    if credentials is None:
        return None
    try:
        user_id = decode_access_token(credentials.credentials)
        user = db.get(User, user_id)
        return user if user and user.is_active else None
    except Exception:
        return None


@router.get("/categories", response_model=list[ResourceCategoryResponse])
def resource_categories(
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ResourceCategoryResponse]:
    return list_resource_categories(db)


@router.get("", response_model=list[ResourceResponse])
def browse_resources(
    search: Annotated[str | None, Query(max_length=100)] = None,
    category_id: Annotated[int | None, Query(gt=0)] = None,
    course_id: Annotated[int | None, Query(gt=0)] = None,
    academic_level_id: Annotated[int | None, Query(gt=0)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ResourceResponse]:
    is_admin = _is_admin(db, user)
    return list_resources(
        db,
        include_unpublished=is_admin,
        search=search,
        category_id=category_id,
        course_id=course_id,
        academic_level_id=academic_level_id,
        limit=limit,
        offset=offset,
    )


@router.get("/{resource_id}", response_model=ResourceResponse)
def read_resource(
    resource_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceResponse:
    resource = _get_resource_or_404(db, resource_id)
    is_admin = _is_admin(db, user)
    if not is_admin and not resource_is_available(resource):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found.")
    return resource


@router.get("/{resource_id}/preview", response_model=ResourcePreviewResponse)
def get_resource_preview(
    resource_id: int,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
    db: Session = Depends(get_db),
) -> ResourcePreviewResponse:
    resource = _get_resource_or_404(db, resource_id)
    if not resource_is_available(resource):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found.")

    user = _get_optional_user(credentials, db)
    policy = resource.preview_policy or "none"

    # If preview policy is none and access is not public:
    if policy == "none" and resource.access_policy != "public":
        return ResourcePreviewResponse(
            id=resource.id,
            title=resource.title,
            file_name=resource.file_name,
            mime_type=resource.mime_type,
            preview_policy="none",
            preview_available=False,
            preview_type="none",
            message="No preview has been published for this item.",
        )

    # If preview requires authentication:
    if policy == "authenticated_only" and user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to view this preview.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Determine preview type and content
    preview_content = resource.preview_content
    mime = (resource.mime_type or "").lower()

    if preview_content:
        return ResourcePreviewResponse(
            id=resource.id,
            title=resource.title,
            file_name=resource.file_name,
            mime_type=resource.mime_type,
            preview_policy=policy,
            preview_available=True,
            preview_type="text",
            preview_content=preview_content,
            message="Approved preview sample.",
        )

    if mime.startswith("image/"):
        return ResourcePreviewResponse(
            id=resource.id,
            title=resource.title,
            file_name=resource.file_name,
            mime_type=resource.mime_type,
            preview_policy=policy,
            preview_available=True,
            preview_type="image",
            preview_url=f"/api/v1/resources/{resource.id}/preview/file",
            message="Image preview.",
        )

    if mime == "application/pdf":
        is_public_doc = resource.access_policy == "public"
        return ResourcePreviewResponse(
            id=resource.id,
            title=resource.title,
            file_name=resource.file_name,
            mime_type=resource.mime_type,
            preview_policy=policy,
            preview_available=is_public_doc or bool(preview_content),
            preview_type="pdf" if is_public_doc else "none",
            preview_url=f"/api/v1/resources/{resource.id}/preview/file" if is_public_doc else None,
            preview_content=preview_content,
            message="PDF preview available." if is_public_doc else "Preview excerpt not yet published for this PDF.",
        )

    if mime in ("text/plain", "text/markdown"):
        return ResourcePreviewResponse(
            id=resource.id,
            title=resource.title,
            file_name=resource.file_name,
            mime_type=resource.mime_type,
            preview_policy=policy,
            preview_available=True,
            preview_type="text",
            preview_content=preview_content or "Text material preview.",
            message="Text preview.",
        )

    return ResourcePreviewResponse(
        id=resource.id,
        title=resource.title,
        file_name=resource.file_name,
        mime_type=resource.mime_type,
        preview_policy=policy,
        preview_available=False,
        preview_type="unsupported",
        message=f"In-browser preview is unavailable for {resource.mime_type} files. Please download the document to view it.",
    )


@router.get("/{resource_id}/preview/file", response_class=FileResponse)
def stream_preview_file(
    resource_id: int,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
    db: Session = Depends(get_db),
) -> FileResponse:
    resource = _get_resource_or_404(db, resource_id)
    if not resource_is_available(resource):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found.")

    user = _get_optional_user(credentials, db)
    policy = resource.preview_policy or "none"

    if policy == "authenticated_only" and user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to view this preview file.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    mime = (resource.mime_type or "").lower()
    is_image = mime.startswith("image/")
    is_public = resource.access_policy == "public"

    # Only images or public documents may stream full file content as preview
    if not (is_image or is_public):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Full file access is restricted. Use the published sample preview or sign in with an active subscription.",
        )

    try:
        path = resource_download_path(resource)
    except (NotFoundError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return FileResponse(
        path=path,
        media_type=resource.mime_type,
        filename=f"preview-{resource.file_name}",
        content_disposition_type="inline",
    )


@router.get("/{resource_id}/download", response_class=FileResponse)
def download_resource(
    resource_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    resource = _get_resource_or_404(db, resource_id)
    is_admin = _is_admin(db, user)
    if not is_admin:
        if not resource_is_available(resource):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found.")
        if not can_download_resource(db, user, resource):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this resource.",
            )
    try:
        path = resource_download_path(resource)
    except (NotFoundError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return FileResponse(
        path=path,
        media_type=resource.mime_type,
        filename=resource.file_name,
        content_disposition_type="attachment",
    )


@router.get("/{resource_id}/files", response_model=list[ResourceFileResponse])
def get_resource_files(
    resource_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ResourceFileResponse]:
    resource = _get_resource_or_404(db, resource_id)
    is_admin = _is_admin(db, user)
    if not is_admin and not resource_is_available(resource):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found.")
    return list_resource_files(db, resource_id)


@router.get("/{resource_id}/files/{file_id}/download", response_class=FileResponse)
def download_resource_file_item(
    resource_id: int,
    file_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    resource = _get_resource_or_404(db, resource_id)
    is_admin = _is_admin(db, user)
    if not is_admin:
        if not resource_is_available(resource):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found.")
        if not can_download_resource(db, user, resource):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this resource.",
            )
    try:
        file_record = get_resource_file(db, resource_id, file_id)
        path = resource_file_download_path(file_record)
    except (NotFoundError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return FileResponse(
        path=path,
        media_type=file_record.mime_type,
        filename=file_record.original_filename,
        content_disposition_type="attachment",
    )


@admin_router.get("", response_model=list[ResourceResponse])
def admin_list_resources(
    search: Annotated[str | None, Query(max_length=100)] = None,
    category_id: Annotated[int | None, Query(gt=0)] = None,
    course_id: Annotated[int | None, Query(gt=0)] = None,
    academic_level_id: Annotated[int | None, Query(gt=0)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> list[ResourceResponse]:
    return list_resources(
        db,
        include_unpublished=True,
        search=search,
        category_id=category_id,
        course_id=course_id,
        academic_level_id=academic_level_id,
        limit=limit,
        offset=offset,
    )


@admin_router.post("", response_model=ResourceResponse, status_code=status.HTTP_201_CREATED)
def upload_resource(
    title: Annotated[str, Form(min_length=1, max_length=255)],
    upload: Annotated[UploadFile | None, File()] = None,
    files: Annotated[list[UploadFile] | None, File()] = None,
    description: Annotated[str | None, Form(max_length=10_000)] = None,
    category_id: Annotated[int | None, Form(gt=0)] = None,
    course_id: Annotated[int | None, Form(gt=0)] = None,
    course_offering_id: Annotated[int | None, Form(gt=0)] = None,
    academic_level_id: Annotated[int | None, Form(gt=0)] = None,
    academic_session_id: Annotated[int | None, Form(gt=0)] = None,
    semester_id: Annotated[int | None, Form(gt=0)] = None,
    resource_type_id: Annotated[int | None, Form(gt=0)] = None,
    is_published: Annotated[bool, Form()] = False,
    access_policy: Annotated[
        Literal["subscription_or_entitlement", "entitlement_only", "public"], Form()
    ] = "subscription_or_entitlement",
    preview_policy: Annotated[
        Literal["none", "public_sample", "authenticated_only"], Form()
    ] = "none",
    preview_content: Annotated[str | None, Form(max_length=20_000)] = None,
    requires_verification: Annotated[bool, Form()] = True,
    available_from: Annotated[datetime | None, Form()] = None,
    available_until: Annotated[datetime | None, Form()] = None,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> ResourceResponse:
    uploaded_files: list[UploadFile] = []
    if files:
        uploaded_files.extend(files)
    if upload and upload not in uploaded_files:
        uploaded_files.insert(0, upload)

    if not uploaded_files:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one file or document is required for upload.",
        )

    file_items: list[tuple[bytes, str, str | None]] = []
    try:
        if not title.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="title cannot be blank.",
            )

        for up in uploaded_files:
            c = _read_upload(up)
            file_items.append((c, up.filename or "unnamed", up.content_type))

        resource = create_resource(
            db,
            admin,
            title=title,
            description=description,
            category_id=category_id,
            course_id=course_id,
            course_offering_id=course_offering_id,
            academic_level_id=academic_level_id,
            academic_session_id=academic_session_id,
            semester_id=semester_id,
            resource_type_id=resource_type_id,
            is_published=is_published,
            access_policy=access_policy,
            preview_policy=preview_policy,
            preview_content=preview_content,
            requires_verification=requires_verification,
            available_from=available_from,
            available_until=available_until,
            files=file_items,
        )
    except PolicyError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except ValueError as exc:
        # Use first file's content for length check if available
        first_content = file_items[0][0] if file_items else b""
        raise _upload_error(exc, first_content) from exc
    finally:
        for up in uploaded_files:
            try:
                up.file.close()
            except Exception:
                pass
    return resource


@admin_router.post(
    "/categories",
    response_model=ResourceCategoryResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_category(
    data: ResourceCategoryCreate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> ResourceCategoryResponse:
    try:
        return create_resource_category(db, admin, data.name, data.description)
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@admin_router.patch("/{resource_id}", response_model=ResourceResponse)
def patch_resource(
    resource_id: int,
    data: ResourceUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> ResourceResponse:
    resource = _get_resource_or_404(db, resource_id)
    try:
        return update_resource(db, admin, resource, data.model_dump(exclude_unset=True))
    except PolicyError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@admin_router.post("/{resource_id}/file", response_model=ResourceResponse)
def replace_file(
    resource_id: int,
    upload: Annotated[UploadFile, File()],
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> ResourceResponse:
    resource = _get_resource_or_404(db, resource_id)
    content = _read_upload(upload)
    try:
        return replace_resource_file(
            db,
            admin,
            resource,
            upload.filename or "",
            upload.content_type,
            content,
        )
    except ValueError as exc:
        raise _upload_error(exc, content) from exc
    finally:
        upload.file.close()


@admin_router.delete("/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_resource(
    resource_id: int,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> None:
    resource = _get_resource_or_404(db, resource_id)
    try:
        delete_resource(db, admin, resource)
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@admin_router.get("/categories", response_model=list[ResourceCategoryResponse])
def admin_resource_categories(
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> list[ResourceCategoryResponse]:
    return list_resource_categories(db)
