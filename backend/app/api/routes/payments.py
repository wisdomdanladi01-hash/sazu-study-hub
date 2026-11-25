import json
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_admin, get_current_user, get_optional_user, require_capability
from app.db.database import get_db
from app.models.academic import Semester
from app.models.commerce import AccessPackage, Payment
from app.models.subscription import Subscription
from app.models.user import Role, User
from app.schemas.payments import (
    PaymentInitializeRequest,
    PaymentInitializeResponse,
    PaymentResponse,
    PaymentVerificationResponse,
    SubscriptionPackageCreate,
    SubscriptionPackageResponse,
    SubscriptionPackageUpdate,
    SubscriptionResponse,
)
from app.services.errors import ConflictError, NotFoundError, PolicyError
from app.services.payments import (
    PaymentRejected,
    _user_has_any_active_subscription,
    create_subscription_package,
    delete_subscription_package,
    get_package_metrics,
    get_package_target_name,
    get_payment_history,
    get_subscription_package,
    get_user_subscriptions,
    initialize_payment,
    list_subscription_packages,
    subscription_status_for_payment,
    update_subscription_package,
    verify_payment,
)
from app.services.paystack import (
    PaystackError,
    PaystackNotConfigured,
    verify_webhook_signature,
)

router = APIRouter(tags=["subscriptions and payments"])
admin_router = APIRouter(prefix="/admin", tags=["subscription administration"])
webhook_router = APIRouter(prefix="/payments/paystack", tags=["payment webhooks"])


def _payment_response(payment: Payment) -> PaymentResponse:
    return PaymentResponse(
        id=payment.id,
        user_id=payment.user_id,
        reference=payment.provider_reference or payment.idempotency_key,
        package_id=payment.package_id,
        subscription_id=payment.subscription_id,
        status=payment.status,
        provider_status=payment.provider_status,
        amount_minor=payment.amount_minor,
        currency=payment.currency,
        semester_id=payment.semester_id,
        failure_reason=payment.failure_reason,
        verified_at=payment.verified_at,
        refund_review_status=payment.refund_review_status,
        created_at=payment.created_at,
    )


def _subscription_response(subscription: Subscription) -> SubscriptionResponse:
    return SubscriptionResponse(
        id=subscription.id,
        user_id=subscription.user_id,
        package_id=subscription.package_id,
        semester_id=subscription.semester_id,
        starts_at=subscription.starts_at,
        ends_at=subscription.ends_at,
        status=subscription.status,
        is_active=subscription.is_active,
        created_at=subscription.created_at,
    )


def _package_response(
    package: AccessPackage,
    semester: Semester | None = None,
    target_name: str | None = None,
    buyers_count: int = 0,
    total_revenue_minor: int = 0,
    effective_price_minor: int | None = None,
) -> SubscriptionPackageResponse:
    return SubscriptionPackageResponse(
        id=package.id,
        name=package.name,
        description=package.description,
        package_type=package.package_type,
        price_minor=package.price_minor,
        subscriber_price_minor=package.subscriber_price_minor,
        effective_price_minor=effective_price_minor if effective_price_minor is not None else package.price_minor,
        currency=package.currency,
        semester_id=package.semester_id,
        academic_session_id=package.academic_session_id,
        academic_level_id=package.academic_level_id,
        course_id=package.course_id,
        resource_id=package.resource_id,
        target_name=target_name,
        semester_starts_on=semester.starts_on if semester else None,
        semester_ends_on=semester.ends_on if semester else None,
        available_from=package.available_from,
        available_until=package.available_until,
        is_active=package.is_active,
        buyers_count=buyers_count,
        total_revenue_minor=total_revenue_minor,
    )


def _raise_service_error(exc: Exception) -> None:
    if isinstance(exc, NotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if isinstance(exc, ConflictError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if isinstance(exc, PolicyError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    raise exc


@router.get(
    "/subscriptions/packages", response_model=list[SubscriptionPackageResponse]
)
def available_subscription_packages(
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> list[SubscriptionPackageResponse]:
    now = datetime.now(timezone.utc)
    is_active_sub = _user_has_any_active_subscription(db, user.id, now) if user else False
    results = []
    for package, semester, target_name, buyers, rev in list_subscription_packages(db):
        eff_price = (
            package.subscriber_price_minor
            if (is_active_sub and package.subscriber_price_minor is not None)
            else package.price_minor
        )
        results.append(
            _package_response(
                package,
                semester,
                target_name,
                buyers,
                rev,
                effective_price_minor=eff_price,
            )
        )
    return results


@router.get(
    "/subscriptions/plans", response_model=list[SubscriptionPackageResponse], include_in_schema=False
)
def available_subscription_plans(
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> list[SubscriptionPackageResponse]:
    return available_subscription_packages(user, db)


@admin_router.get(
    "/subscriptions/packages", response_model=list[SubscriptionPackageResponse]
)
def admin_subscription_packages(
    _admin: User = Depends(require_capability("manage_packages")),
    db: Session = Depends(get_db),
) -> list[SubscriptionPackageResponse]:
    return [
        _package_response(package, semester, target_name, buyers, rev)
        for package, semester, target_name, buyers, rev in list_subscription_packages(db, include_inactive=True)
    ]


@admin_router.post(
    "/subscriptions/packages",
    response_model=SubscriptionPackageResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_subscription_package(
    data: SubscriptionPackageCreate,
    admin: User = Depends(require_capability("manage_packages")),
    db: Session = Depends(get_db),
) -> SubscriptionPackageResponse:
    try:
        package = create_subscription_package(db, admin, **data.model_dump())
    except (ConflictError, PolicyError) as exc:
        _raise_service_error(exc)
    semester = db.get(Semester, package.semester_id) if package.semester_id else None
    target_name = get_package_target_name(db, package)
    buyers, rev = get_package_metrics(db, package.id)
    return _package_response(package, semester, target_name, buyers, rev)


@admin_router.patch(
    "/subscriptions/packages/{package_id}",
    response_model=SubscriptionPackageResponse,
)
def edit_subscription_package(
    package_id: int,
    data: SubscriptionPackageUpdate,
    admin: User = Depends(require_capability("manage_packages")),
    db: Session = Depends(get_db),
) -> SubscriptionPackageResponse:
    try:
        package = get_subscription_package(db, package_id)
        package = update_subscription_package(
            db, admin, package, data.model_dump(exclude_unset=True)
        )
    except (ConflictError, NotFoundError, PolicyError) as exc:
        _raise_service_error(exc)
    semester = db.get(Semester, package.semester_id) if package.semester_id else None
    target_name = get_package_target_name(db, package)
    buyers, rev = get_package_metrics(db, package.id)
    return _package_response(package, semester, target_name, buyers, rev)


@admin_router.delete(
    "/subscriptions/packages/{package_id}",
    status_code=status.HTTP_200_OK,
)
def remove_subscription_package(
    package_id: int,
    admin: User = Depends(require_capability("manage_packages")),
    db: Session = Depends(get_db),
):
    try:
        package = get_subscription_package(db, package_id)
        delete_subscription_package(db, admin, package)
    except (ConflictError, NotFoundError, PolicyError) as exc:
        _raise_service_error(exc)
    return {"message": f"Package '{package.name}' deleted or deactivated successfully."}


@router.post(
    "/payments/initialize",
    response_model=PaymentInitializeResponse,
    status_code=status.HTTP_201_CREATED,
)
def initialize_subscription_payment(
    data: PaymentInitializeRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PaymentInitializeResponse:
    target_callback = data.callback_url
    if not target_callback:
        origin = request.headers.get("origin") or request.headers.get("referer")
        if origin:
            clean_origin = origin.split("?")[0].rstrip("/")
            for subpath in ("/pricing", "/materials", "/courses", "/dashboard"):
                if subpath in clean_origin:
                    clean_origin = clean_origin.split(subpath)[0]
            target_callback = f"{clean_origin}/payment/return"

    try:
        payment = initialize_payment(db, user, data.package_id, callback_url=target_callback)
    except (ConflictError, NotFoundError, PolicyError) as exc:
        _raise_service_error(exc)
    except PaystackNotConfigured as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except PaystackError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    if payment.checkout_url is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The payment provider did not return checkout information.",
        )
    return PaymentInitializeResponse(
        id=payment.id,
        reference=payment.provider_reference or payment.idempotency_key,
        status=payment.status,
        amount_minor=payment.amount_minor,
        currency=payment.currency,
        checkout_url=payment.checkout_url,
    )


@router.post(
    "/payments/initiate",
    response_model=PaymentInitializeResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
def initiate_subscription_payment(
    data: PaymentInitializeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PaymentInitializeResponse:
    return initialize_subscription_payment(data, user, db)


@router.post(
    "/payments/{reference}/verify",
    response_model=PaymentVerificationResponse,
    responses={202: {"model": PaymentVerificationResponse}},
)
def verify_own_payment(
    reference: Annotated[str, Path(min_length=1, max_length=200)],
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PaymentVerificationResponse:
    try:
        payment, subscription = verify_payment(
            db, reference, owner_user_id=user.id
        )
    except NotFoundError as exc:
        _raise_service_error(exc)
    except PaymentRejected as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except PaystackNotConfigured as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except PaystackError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    if payment.status == "pending":
        response.status_code = status.HTTP_202_ACCEPTED
    return PaymentVerificationResponse(
        payment=_payment_response(payment),
        subscription_status=subscription_status_for_payment(payment, subscription),
    )


@router.get("/payments", response_model=list[PaymentResponse])
def own_payment_history(
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[PaymentResponse]:
    return [
        _payment_response(payment)
        for payment in get_payment_history(
            db, owner_user_id=user.id, limit=limit, offset=offset
        )
    ]


@router.get("/subscriptions/me", response_model=list[SubscriptionResponse])
def own_subscriptions(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SubscriptionResponse]:
    return [
        _subscription_response(subscription)
        for subscription in get_user_subscriptions(db, user.id)
    ]


@admin_router.get("/payments", response_model=list[PaymentResponse])
def admin_payment_history(
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    _admin: User = Depends(require_capability("view_payments")),
    db: Session = Depends(get_db),
) -> list[PaymentResponse]:
    return [
        _payment_response(payment)
        for payment in get_payment_history(
            db, owner_user_id=None, limit=limit, offset=offset
        )
    ]


@admin_router.get("/subscriptions", response_model=list[SubscriptionResponse])
def admin_subscription_history(
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    _admin: User = Depends(require_capability("view_payments")),
    db: Session = Depends(get_db),
) -> list[SubscriptionResponse]:
    subscriptions = db.scalars(
        select(Subscription)
        .order_by(Subscription.created_at.desc(), Subscription.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return [_subscription_response(item) for item in subscriptions]


@webhook_router.post("/webhook")
async def paystack_webhook(
    request: Request,
    db: Session = Depends(get_db),
    signature: Annotated[str | None, Header(alias="x-paystack-signature")] = None,
) -> dict[str, str]:
    content_length = request.headers.get("content-length")
    if content_length is not None and content_length.isdigit() and int(content_length) > 1_048_576:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Webhook payload is too large.",
        )
    body_buffer = bytearray()
    async for chunk in request.stream():
        body_buffer.extend(chunk)
        if len(body_buffer) > 1_048_576:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Webhook payload is too large.",
            )
    body = bytes(body_buffer)
    if not signature:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature.")
    try:
        if not verify_webhook_signature(body, signature):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid webhook signature.",
            )
    except PaystackNotConfigured as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    try:
        payload = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook payload."
        ) from exc
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook payload."
        )
    event = payload.get("event")
    if event not in {"charge.success", "charge.failed"}:
        return {"status": "ignored"}
    data = payload.get("data")
    reference = data.get("reference") if isinstance(data, dict) else None
    if not isinstance(reference, str) or not reference:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Webhook transaction reference is missing.",
        )
    try:
        verify_payment(db, reference)
    except NotFoundError:
        return {"status": "ignored"}
    except PaymentRejected:
        return {"status": "recorded"}
    except PaystackNotConfigured as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except PaystackError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return {"status": "received"}
