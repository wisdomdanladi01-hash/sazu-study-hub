"""SQLAlchemy models for the Learning Resource Platform."""

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
    ResourceType,
    Semester,
    StudentAcademicProfile,
)
from app.models.audit import AuditEvent
from app.models.commerce import (
    AccessPackage,
    Entitlement,
    PackageCourse,
    PackageResource,
    Payment,
)
from app.models.identity import VerificationDocument, VerificationSubmission
from app.models.resource import (
    Resource,
    ResourceCategory,
    ResourceCourseOffering,
    ResourceFile,
)
from app.models.subscription import Subscription, SubscriptionPlan
from app.models.user import Role, User

__all__ = [
    "Role",
    "User",
    "Programme",
    "Institution",
    "Faculty",
    "Department",
    "AcademicLevel",
    "AcademicSession",
    "Semester",
    "Course",
    "CurriculumVersion",
    "CourseOffering",
    "ResourceType",
    "StudentAcademicProfile",
    "VerificationSubmission",
    "VerificationDocument",
    "Resource",
    "ResourceCategory",
    "ResourceFile",
    "ResourceCourseOffering",
    "Subscription",
    "SubscriptionPlan",
    "AccessPackage",
    "PackageCourse",
    "PackageResource",
    "Payment",
    "Entitlement",
    "AuditEvent",
]
