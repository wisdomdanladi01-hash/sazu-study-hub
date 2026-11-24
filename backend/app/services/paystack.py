import hashlib
import hmac
from dataclasses import dataclass
from urllib.parse import quote

import httpx

from app.core.config import settings


class PaystackError(Exception):
    """A safe, user-facing summary of a failed provider interaction."""


class PaystackNotConfigured(PaystackError):
    """Paystack credentials are missing or violate the environment policy."""


@dataclass(frozen=True)
class VerifiedTransaction:
    reference: str
    status: str
    amount_minor: int
    currency: str
    customer_email: str | None


def _secret_key() -> str:
    secret = settings.paystack_secret_key.strip()
    if not secret:
        raise PaystackNotConfigured("Paystack is not configured.")

    is_production = settings.app_env.strip().lower() == "production"
    is_live_key = secret.startswith("sk_live_")
    if is_production and not (is_live_key and settings.paystack_live_enabled):
        raise PaystackNotConfigured(
            "Production payments require a live Paystack key and PAYSTACK_LIVE_ENABLED=true."
        )
    if is_live_key and (not is_production or not settings.paystack_live_enabled):
        raise PaystackNotConfigured(
            "Live Paystack credentials are disabled outside explicitly enabled production."
        )
    if not is_live_key and not secret.startswith("sk_test_"):
        raise PaystackNotConfigured("Use a Paystack test secret key for non-production payments.")
    return secret


def _request(method: str, path: str, *, json: dict | None = None) -> dict:
    secret = _secret_key()
    url = f"{settings.paystack_api_url.rstrip('/')}/{path.lstrip('/')}"
    try:
        response = httpx.request(
            method,
            url,
            json=json,
            headers={
                "Authorization": f"Bearer {secret}",
                "Content-Type": "application/json",
                "User-Agent": "SAZU-StudyHub/1.0 (https://sazu.edu.ng)",
            },
            timeout=settings.paystack_timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
    except (httpx.TimeoutException, httpx.TransportError) as exc:
        raise PaystackError("Paystack could not be reached; payment remains pending.") from exc
    except (httpx.HTTPStatusError, ValueError) as exc:
        raise PaystackError("Paystack returned an invalid or unsuccessful response.") from exc

    if not isinstance(payload, dict) or payload.get("status") is not True:
        raise PaystackError("Paystack returned an invalid or unsuccessful response.")
    return payload


def initialize_transaction(
    *, email: str, amount_minor: int, currency: str, reference: str
) -> str:
    payload = _request(
        "POST",
        "/transaction/initialize",
        json={
            "email": email,
            "amount": amount_minor,
            "currency": currency,
            "reference": reference,
            "callback_url": settings.paystack_callback_url,
        },
    )
    data = payload.get("data")
    if not isinstance(data, dict):
        raise PaystackError("Paystack returned incomplete checkout information.")
    if data.get("reference") != reference:
        raise PaystackError("Paystack returned a mismatched transaction reference.")
    authorization_url = data.get("authorization_url")
    if not isinstance(authorization_url, str) or not authorization_url.startswith("https://"):
        raise PaystackError("Paystack returned an invalid checkout URL.")
    return authorization_url


def verify_transaction(reference: str) -> VerifiedTransaction:
    payload = _request(
        "GET",
        f"/transaction/verify/{quote(reference, safe='')}",
    )
    data = payload.get("data")
    if not isinstance(data, dict):
        raise PaystackError("Paystack returned incomplete verification information.")
    customer = data.get("customer")
    customer_email = customer.get("email") if isinstance(customer, dict) else None
    amount = data.get("amount")
    if not isinstance(amount, int) or isinstance(amount, bool):
        raise PaystackError("Paystack returned an invalid transaction amount.")
    status_value = data.get("status")
    reference_value = data.get("reference")
    currency_value = data.get("currency")
    if not isinstance(status_value, str) or not isinstance(reference_value, str):
        raise PaystackError("Paystack returned incomplete transaction details.")
    if not isinstance(currency_value, str):
        raise PaystackError("Paystack returned an invalid transaction currency.")
    return VerifiedTransaction(
        reference=reference_value,
        status=status_value.lower(),
        amount_minor=amount,
        currency=currency_value.upper(),
        customer_email=customer_email.lower() if isinstance(customer_email, str) else None,
    )


def verify_webhook_signature(body: bytes, signature: str) -> bool:
    secret = _secret_key()
    expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature)
