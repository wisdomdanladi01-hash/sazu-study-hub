from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import and_, exists, or_, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.private_storage import (
    delete_private_storage_key,
    resolve_private_storage_key,
)
from app.core.storage import get_storage_provider
from app.models.academic import (
    AcademicLevel,
    AcademicSession,
    Course,
    CourseOffering,
    ResourceType,
    Semester,
    StudentAcademicProfile,
)
from app.models.audit import AuditEvent
from app.models.commerce import AccessPackage, Entitlement, PackageCourse, PackageResource, Payment
from app.models.resource import (
    Resource,
    ResourceCategory,
    ResourceCourseOffering,
    ResourceFile,
)
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.resource import AccessPolicy
from app.services.errors import ConflictError, NotFoundError, PolicyError


_RESOURCE_REFERENCES = {
    "category_id": ResourceCategory,
    "course_id": Course,
    "course_offering_id": CourseOffering,
    "academic_level_id": AcademicLevel,
    "academic_session_id": AcademicSession,
    "semester_id": Semester,
    "resource_type_id": ResourceType,
}


def _validate_references(db: Session, values: dict[str, Any]) -> None:
    for field_name, model in _RESOURCE_REFERENCES.items():
        reference_id = values.get(field_name)
        if reference_id is not None and db.get(model, reference_id) is None:
            raise PolicyError(f"The selected {field_name.removesuffix('_id').replace('_', ' ')} does not exist.")

    available_from = values.get("available_from")
    available_until = values.get("available_until")
    if available_from is not None and available_until is not None:
        if _utc(available_until) <= _utc(available_from):
            raise PolicyError("available_until must be later than available_from.")


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _audit(db: Session, actor_id: int, action: str, resource_id: int) -> None:
    db.add(
        AuditEvent(
            actor_user_id=actor_id,
            action=action,
            target_type="resource",
            target_id=str(resource_id),
        )
    )


def create_resource(
    db: Session,
    admin: User,
    *,
    title: str,
    description: str | None,
    category_id: int | None,
    course_id: int | None,
    course_offering_id: int | None = None,
    academic_level_id: int | None = None,
    academic_session_id: int | None = None,
    semester_id: int | None = None,
    resource_type_id: int | None = None,
    is_published: bool = False,
    access_policy: AccessPolicy = "subscription_or_entitlement",
    preview_policy: str = "none",
    preview_content: str | None = None,
    requires_verification: bool = True,
    available_from: datetime | None = None,
    available_until: datetime | None = None,
    original_filename: str = "",
    content_type: str | None = None,
    content: bytes | None = None,
    files: list[tuple[bytes, str, str | None]] | None = None,
    additional_offering_ids: list[int] | None = None,
) -> Resource:
    # Auto-populate course, level, semester from offering if provided
    if course_offering_id is not None:
        offering = db.get(CourseOffering, course_offering_id)
        if offering is not None:
            if course_id is None:
                course_id = offering.course_id
            if academic_level_id is None:
                academic_level_id = offering.academic_level_id
            if semester_id is None:
                semester_id = offering.semester_id

    values = {
        "category_id": category_id,
        "course_id": course_id,
        "course_offering_id": course_offering_id,
        "academic_level_id": academic_level_id,
        "academic_session_id": academic_session_id,
        "semester_id": semester_id,
        "resource_type_id": resource_type_id,
        "available_from": available_from,
        "available_until": available_until,
    }
    _validate_references(db, values)

    file_items = files or []
    if not file_items and content:
        file_items = [(content, original_filename, content_type)]

    if not file_items:
        raise ValueError("At least one valid file or image must be provided.")

    storage_provider = get_storage_provider()
    stored_files = []
    try:
        for idx, (f_content, f_name, f_mime) in enumerate(file_items, start=1):
            stored = storage_provider.store_file(
                f_content, f_name, f_mime, subfolder="resources"
            )
            stored_files.append((stored, idx))
    except Exception:
        for stored, _ in stored_files:
            storage_provider.delete_file(stored.storage_key)
        raise

    # Primary file is the first file
    primary_stored, _ = stored_files[0]
    total_bytes = sum(stored.size_bytes for stored, _ in stored_files)

    resource = Resource(
        title=title.strip(),
        description=description,
        file_name=primary_stored.original_filename,
        storage_path=primary_stored.storage_key,
        storage_provider=primary_stored.storage_provider,
        mime_type=primary_stored.content_type,
        file_size_bytes=total_bytes,
        file_checksum_sha256=primary_stored.sha256,
        created_by_id=admin.id,
        is_published=is_published,
        access_policy=access_policy,
        preview_policy=preview_policy,
        preview_content=preview_content,
        requires_verification=requires_verification,
        **values,
    )

    try:
        db.add(resource)
        db.flush()

        # Add ResourceFile records
        for stored, order in stored_files:
            rf = ResourceFile(
                resource_id=resource.id,
                storage_provider=stored.storage_provider,
                storage_key=stored.storage_key,
                original_filename=stored.original_filename,
                mime_type=stored.content_type,
                file_size_bytes=stored.size_bytes,
                file_checksum_sha256=stored.sha256,
                page_order=order,
            )
            db.add(rf)

        # Associate course offerings
        all_offerings = set()
        if course_offering_id:
            all_offerings.add(course_offering_id)
        if additional_offering_ids:
            all_offerings.update(additional_offering_ids)

        for off_id in all_offerings:
            db.add(ResourceCourseOffering(resource_id=resource.id, course_offering_id=off_id))

        _audit(db, admin.id, "admin.resource_created", resource.id)
        db.commit()
        db.refresh(resource)
        return resource
    except SQLAlchemyError:
        db.rollback()
        for stored, _ in stored_files:
            storage_provider.delete_file(stored.storage_key)
        raise


def list_resources(
    db: Session,
    *,
    include_unpublished: bool,
    search: str | None,
    category_id: int | None,
    course_id: int | None,
    academic_level_id: int | None,
    limit: int,
    offset: int,
) -> list[Resource]:
    query = select(Resource)
    if not include_unpublished:
        now = datetime.now(timezone.utc)
        query = query.where(
            Resource.is_published.is_(True),
            or_(Resource.available_from.is_(None), Resource.available_from <= now),
            or_(Resource.available_until.is_(None), Resource.available_until > now),
        )
    if search and search.strip():
        raw_s = search.strip()
        spaceless_s = re.sub(r"\s+", "", raw_s)
        spaced_s = re.sub(r"([a-zA-Z]+)(\d+)", r"\1 \2", raw_s)
        tokens = [t for t in re.split(r"[\s\-_]+", raw_s) if t]

        search_terms = {raw_s, spaceless_s, spaced_s}

        term_conditions = []
        for term in search_terms:
            term_conditions.extend([
                Resource.title.ilike(f"%{term}%"),
                Resource.description.ilike(f"%{term}%"),
                Resource.file_name.ilike(f"%{term}%"),
                Course.code.ilike(f"%{term}%"),
                Course.title.ilike(f"%{term}%"),
            ])

        if len(tokens) > 1:
            token_and_clauses = []
            for tok in tokens:
                token_and_clauses.append(
                    or_(
                        Resource.title.ilike(f"%{tok}%"),
                        Resource.description.ilike(f"%{tok}%"),
                        Resource.file_name.ilike(f"%{tok}%"),
                        Course.code.ilike(f"%{tok}%"),
                        Course.title.ilike(f"%{tok}%"),
                    )
                )
            query = query.outerjoin(Course, Resource.course_id == Course.id).where(
                or_(
                    or_(*term_conditions),
                    and_(*token_and_clauses),
                )
            )
        else:
            query = query.outerjoin(Course, Resource.course_id == Course.id).where(
                or_(*term_conditions)
            )
    if category_id is not None:
        query = query.where(Resource.category_id == category_id)
    if course_id is not None:
        query = query.where(Resource.course_id == course_id)
    if academic_level_id is not None:
        query = query.where(Resource.academic_level_id == academic_level_id)
    return list(
        db.scalars(
            query.order_by(Resource.created_at.desc(), Resource.id.desc())
            .limit(limit)
            .offset(offset)
        )
    )


def get_resource(db: Session, resource_id: int) -> Resource:
    resource = db.get(Resource, resource_id)
    if resource is None:
        raise NotFoundError("Resource not found.")
    return resource


def list_resource_files(db: Session, resource_id: int) -> list[ResourceFile]:
    return list(
        db.scalars(
            select(ResourceFile)
            .where(ResourceFile.resource_id == resource_id)
            .order_by(ResourceFile.page_order.asc(), ResourceFile.id.asc())
        )
    )


def get_resource_file(db: Session, resource_id: int, file_id: int) -> ResourceFile:
    file = db.scalar(
        select(ResourceFile).where(
            ResourceFile.id == file_id, ResourceFile.resource_id == resource_id
        )
    )
    if file is None:
        raise NotFoundError("Resource file not found.")
    return file


def update_resource(
    db: Session, admin: User, resource: Resource, changes: dict[str, Any]
) -> Resource:
    _validate_references(db, changes)
    combined_values = {
        "available_from": changes.get("available_from", resource.available_from),
        "available_until": changes.get("available_until", resource.available_until),
    }
    if combined_values["available_from"] is not None and combined_values["available_until"] is not None:
        if _utc(combined_values["available_until"]) <= _utc(combined_values["available_from"]):
            raise PolicyError("available_until must be later than available_from.")

    for field_name, value in changes.items():
        if field_name == "title":
            value = value.strip()
        setattr(resource, field_name, value)

    if changes.get("course_offering_id"):
        off_id = changes["course_offering_id"]
        exists_assoc = db.scalar(
            select(ResourceCourseOffering.id).where(
                ResourceCourseOffering.resource_id == resource.id,
                ResourceCourseOffering.course_offering_id == off_id,
            )
        )
        if not exists_assoc:
            db.add(ResourceCourseOffering(resource_id=resource.id, course_offering_id=off_id))
    try:
        _audit(db, admin.id, "admin.resource_updated", resource.id)
        db.commit()
        db.refresh(resource)
        return resource
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("The resource conflicts with existing platform records.") from exc


def replace_resource_file(
    db: Session,
    admin: User,
    resource: Resource,
    original_filename: str,
    content_type: str | None,
    content: bytes,
) -> Resource:
    storage_provider = get_storage_provider()
    stored = storage_provider.store_file(content, original_filename, content_type)
    old_storage_path = resource.storage_path
    resource.storage_path = stored.storage_key
    resource.storage_provider = stored.storage_provider
    resource.file_name = stored.original_filename
    resource.mime_type = stored.content_type
    resource.file_size_bytes = stored.size_bytes
    resource.file_checksum_sha256 = stored.sha256

    try:
        # Also update or insert primary resource file record
        primary_rf = db.scalar(
            select(ResourceFile)
            .where(ResourceFile.resource_id == resource.id, ResourceFile.page_order == 1)
        )
        if primary_rf is None:
            primary_rf = ResourceFile(
                resource_id=resource.id,
                storage_provider=stored.storage_provider,
                storage_key=stored.storage_key,
                original_filename=stored.original_filename,
                mime_type=stored.content_type,
                file_size_bytes=stored.size_bytes,
                file_checksum_sha256=stored.sha256,
                page_order=1,
            )
            db.add(primary_rf)
        else:
            primary_rf.storage_key = stored.storage_key
            primary_rf.storage_provider = stored.storage_provider
            primary_rf.original_filename = stored.original_filename
            primary_rf.mime_type = stored.content_type
            primary_rf.file_size_bytes = stored.size_bytes
            primary_rf.file_checksum_sha256 = stored.sha256

        _audit(db, admin.id, "admin.resource_file_replaced", resource.id)
        db.commit()
        db.refresh(resource)
    except SQLAlchemyError:
        db.rollback()
        storage_provider.delete_file(stored.storage_key)
        raise

    storage_provider.delete_file(old_storage_path)
    return resource


def delete_resource(db: Session, admin: User, resource: Resource) -> None:
    referenced_by_package = db.scalar(
        select(PackageResource.id).where(PackageResource.resource_id == resource.id).limit(1)
    )
    referenced_by_entitlement = db.scalar(
        select(Entitlement.id).where(Entitlement.resource_id == resource.id).limit(1)
    )
    if referenced_by_package is not None or referenced_by_entitlement is not None:
        raise ConflictError("Remove this resource from packages and entitlements before deleting it.")

    storage_provider = get_storage_provider()
    resource_id = resource.id
    keys_to_delete = [resource.storage_path]
    for rf in resource.files:
        if rf.storage_key not in keys_to_delete:
            keys_to_delete.append(rf.storage_key)

    try:
        db.delete(resource)
        _audit(db, admin.id, "admin.resource_deleted", resource_id)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("The resource is still referenced by other platform records.") from exc

    for key in keys_to_delete:
        storage_provider.delete_file(key)


def list_resource_categories(db: Session) -> list[ResourceCategory]:
    return list(db.scalars(select(ResourceCategory).order_by(ResourceCategory.name.asc())))


def create_resource_category(
    db: Session, admin: User, name: str, description: str | None
) -> ResourceCategory:
    category = ResourceCategory(name=name.strip(), description=description)
    try:
        db.add(category)
        db.flush()
        _audit(db, admin.id, "admin.resource_category_created", category.id)
        db.commit()
        db.refresh(category)
        return category
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("A resource category with this name already exists.") from exc


@dataclass(frozen=True)
class AccessDecision:
    """Result of an access check. ``expires_at`` is None when access has no end date."""

    allowed: bool
    expires_at: datetime | None = None
    reason: str | None = None


def is_verified_student(db: Session, user: User) -> bool:
    return (
        db.scalar(
            select(StudentAcademicProfile.id).where(
                StudentAcademicProfile.user_id == user.id,
                StudentAcademicProfile.verified_level_id.is_not(None),
            )
        )
        is not None
    )


def find_paid_entitlement(
    db: Session,
    user: User,
    *,
    resource_id: int | None,
    course_id: int | None,
    semester_id: int | None,
) -> tuple[int, datetime | None] | None:
    """Find an active, paid entitlement covering a resource or a course/semester.

    Pass ``resource_id=None`` to check course-level access only (used by practice tests).
    Returns ``(entitlement_id, expires_at)`` or None.
    """
    now = datetime.now(timezone.utc)

    conditions = []
    if resource_id is not None:
        conditions.append(Entitlement.resource_id == resource_id)
        conditions.append(
            exists().where(
                PackageResource.package_id == Entitlement.package_id,
                PackageResource.resource_id == resource_id,
            )
        )
        res_obj = db.get(Resource, resource_id)
        if res_obj and res_obj.academic_level_id:
            conditions.append(
                exists().where(
                    AccessPackage.id == Entitlement.package_id,
                    AccessPackage.package_type == "level",
                    AccessPackage.academic_level_id == res_obj.academic_level_id,
                )
            )
    if course_id is not None:
        conditions.append(Entitlement.course_id == course_id)
        conditions.append(
            exists().where(
                PackageCourse.package_id == Entitlement.package_id,
                PackageCourse.course_id == course_id,
            )
        )
        conditions.append(
            exists().where(
                AccessPackage.id == Entitlement.package_id,
                AccessPackage.package_type == "level",
                CourseOffering.course_id == course_id,
                CourseOffering.academic_level_id == AccessPackage.academic_level_id,
            )
        )
    if semester_id is not None:
        conditions.append(
            exists().where(
                Entitlement.subscription_id == Subscription.id,
                Entitlement.user_id == user.id,
                Entitlement.status == "active",
                Entitlement.expires_at > now,
                Subscription.user_id == user.id,
                Subscription.status == "active",
                Subscription.is_active.is_(True),
                Subscription.starts_at <= now,
                Subscription.ends_at > now,
                Payment.subscription_id == Subscription.id,
                Payment.status == "succeeded",
                Subscription.semester_id == semester_id,
            )
        )
    if not conditions:
        return None

    row = db.execute(
        select(Entitlement.id, Entitlement.expires_at)
        .join(Payment, Payment.id == Entitlement.payment_id)
        .where(
            Entitlement.user_id == user.id,
            Entitlement.status == "active",
            Payment.status == "succeeded",
            or_(Entitlement.expires_at.is_(None), Entitlement.expires_at > now),
            or_(*conditions),
        )
        .order_by(Entitlement.expires_at.desc().nulls_first())
        .limit(1)
    ).first()
    if row is None:
        return None
    return row[0], row[1]


def resource_access(db: Session, user: User, resource: Resource) -> AccessDecision:
    """Decide whether a student may read this resource, and until when."""
    if resource.requires_verification and not is_verified_student(db, user):
        return AccessDecision(False, reason="verification_required")

    if resource.access_policy == "public":
        return AccessDecision(True, None)

    found = find_paid_entitlement(
        db,
        user,
        resource_id=resource.id,
        course_id=resource.course_id,
        semester_id=resource.semester_id,
    )
    if found is None:
        return AccessDecision(False, reason="subscription_required")
    return AccessDecision(True, found[1])


def can_download_resource(db: Session, user: User, resource: Resource) -> bool:
    return resource_access(db, user, resource).allowed


def resource_download_path(resource: Resource) -> Path:
    storage_provider = get_storage_provider()
    path = storage_provider.resolve_local_path(resource.storage_path)
    if path is None or not path.is_file():
        # Fall back to checking local private storage directory
        path = resolve_private_storage_key(resource.storage_path)
        if not path.is_file():
            raise NotFoundError("Resource file not found.")
    return path


def resource_file_download_path(file: ResourceFile) -> Path:
    storage_provider = get_storage_provider()
    path = storage_provider.resolve_local_path(file.storage_key)
    if path is None or not path.is_file():
        path = resolve_private_storage_key(file.storage_key)
        if not path.is_file():
            raise NotFoundError("Resource file not found.")
    return path


def resource_is_available(resource: Resource, now: datetime | None = None) -> bool:
    current = now or datetime.now(timezone.utc)
    if not resource.is_published:
        return False
    if resource.available_from is not None and _utc(resource.available_from) > current:
        return False
    if resource.available_until is not None and _utc(resource.available_until) <= current:
        return False
    return True
