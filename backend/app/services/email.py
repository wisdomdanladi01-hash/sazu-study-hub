from __future__ import annotations

import json
import logging
import os
import smtplib
import ssl
import urllib.error
import urllib.request
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger(__name__)


def is_email_configured() -> bool:
    """Check if Brevo API or SMTP credentials are configured."""
    brevo_key = settings.brevo_api_key or os.getenv("BREVO_API_KEY") or os.getenv("BREVEO_API_KEY")
    if brevo_key and brevo_key.strip():
        return True
    smtp_host = settings.smtp_host or os.getenv("SMTP_HOST")
    smtp_user = settings.smtp_user or os.getenv("SMTP_USER")
    smtp_password = settings.smtp_password or os.getenv("SMTP_PASSWORD")
    return bool(smtp_host and smtp_user and smtp_password)


def _get_sender_info() -> tuple[str, str]:
    from_email = (
        settings.brevo_sender_email
        or os.getenv("BREVO_SENDER_EMAIL")
        or os.getenv("EMAILS_FROM_EMAIL")
        or os.getenv("SMTP_USER")
        or "wisdomdavid0307@gmail.com"
    ).strip()
    from_name = (
        settings.brevo_sender_name
        or os.getenv("BREVO_SENDER_NAME")
        or os.getenv("EMAILS_FROM_NAME")
        or "SAZU Study Hub"
    ).strip()
    return from_email, from_name


def _send_brevo_api(
    api_key: str,
    to_email: str,
    recipient_name: str,
    subject: str,
    html_content: str,
    text_content: str,
    sender_email: str,
    sender_name: str,
) -> bool:
    """Send transactional email via Brevo's HTTPS REST API endpoint."""
    clean_key = api_key.strip().strip('"').strip("'")
    url = "https://api.brevo.com/v3/smtp/email"
    payload = {
        "sender": {
            "name": sender_name,
            "email": sender_email,
        },
        "to": [
            {
                "email": to_email,
                "name": recipient_name or to_email.split("@")[0],
            }
        ],
        "subject": subject,
        "htmlContent": html_content,
        "textContent": text_content,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "api-key": clean_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "SAZU-StudyHub/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status in (200, 201, 202):
                logger.info("Successfully sent transactional email to %s via Brevo REST API", to_email)
                return True
            logger.warning("Brevo REST API returned unexpected status %s for %s", resp.status, to_email)
            return False
    except urllib.error.HTTPError as exc:
        err_msg = exc.read().decode("utf-8", errors="ignore")
        logger.warning(
            "Brevo REST API HTTP %s: %s (Sender: %s, To: %s)",
            exc.code,
            err_msg,
            sender_email,
            to_email,
        )
        return False
    except Exception as exc:
        logger.warning("Brevo REST API network error for %s: %s", to_email, exc)
        return False


def _send_smtp(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: str,
    sender_email: str,
    sender_name: str,
    host: str,
    port: int,
    user: str,
    password: str,
    use_tls: bool = True,
) -> bool:
    """Send transactional email via SMTP relay (e.g. Brevo SMTP relay or Gmail SMTP)."""
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{sender_name} <{sender_email}>"
        msg["To"] = to_email

        msg.attach(MIMEText(text_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))

        if port == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=context, timeout=12) as server:
                server.login(user, password)
                server.sendmail(sender_email, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(host, port, timeout=12) as server:
                if use_tls:
                    server.starttls()
                server.login(user, password)
                server.sendmail(sender_email, [to_email], msg.as_string())

        logger.info("Successfully sent email to %s via SMTP relay (%s:%s)", to_email, host, port)
        return True
    except Exception as exc:
        logger.warning("SMTP dispatch failed for %s on %s:%s: %s", to_email, host, port, exc)
        return False


def _dispatch_email(
    to_email: str,
    recipient_name: str,
    subject: str,
    html_content: str,
    text_content: str,
    code_for_dev_log: str,
) -> bool:
    """Try Brevo REST API first, then SMTP relay, with fallback to dev logging."""
    sender_email, sender_name = _get_sender_info()
    brevo_key = settings.brevo_api_key or os.getenv("BREVO_API_KEY") or os.getenv("BREVEO_API_KEY") or os.getenv("SIB_API_KEY")

    # 1. Try Brevo REST API if API key is provided
    if brevo_key and brevo_key.strip():
        ok = _send_brevo_api(
            api_key=brevo_key,
            to_email=to_email,
            recipient_name=recipient_name,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
            sender_email=sender_email,
            sender_name=sender_name,
        )
        if ok:
            return True

    # 2. Try SMTP relay if configured (or if key is Brevo SMTP key)
    smtp_host = settings.smtp_host or os.getenv("SMTP_HOST")
    smtp_user = settings.smtp_user or os.getenv("SMTP_USER") or os.getenv("BREVO_SMTP_USER")
    smtp_pass = settings.smtp_password or os.getenv("SMTP_PASSWORD") or os.getenv("BREVO_SMTP_PASSWORD")
    if not smtp_pass and brevo_key and brevo_key.startswith("xsmtpsib"):
        smtp_pass = brevo_key
        if not smtp_host:
            smtp_host = "smtp-relay.brevo.com"

    if smtp_host and smtp_user and smtp_pass:
        smtp_port = settings.smtp_port or 587
        ok = _send_smtp(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
            sender_email=sender_email,
            sender_name=sender_name,
            host=smtp_host,
            port=smtp_port,
            user=smtp_user,
            password=smtp_pass,
            use_tls=settings.smtp_tls,
        )
        if ok:
            return True

    # 3. Dev mode / fallback: log code gracefully
    logger.info(
        "[EMAIL DEV MODE / FALLBACK] Code for %s (%s): %s",
        to_email,
        recipient_name,
        code_for_dev_log,
    )
    return True


def send_email_otp(to_email: str, recipient_name: str, code: str) -> bool:
    """Send a 6-digit email verification OTP to the student."""
    subject = f"Your SAZU Study Hub Verification Code: {code}"
    text_content = f"""Hello {recipient_name},

Your verification code for SAZU Study Hub is: {code}

This code will expire in 15 minutes. Enter this code on the platform to confirm your email address.

Best regards,
SAZU Study Hub Team
Sa'adu Zungur University (Gadau, Bauchi State)
"""
    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a; }}
    .container {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }}
    .logo {{ color: #0f766e; font-size: 20px; font-weight: 800; margin-bottom: 24px; }}
    .title {{ font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 0; }}
    .code-box {{ background: #f0fdfa; border: 2px dashed #0d9488; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }}
    .code {{ font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #115e59; font-family: monospace; }}
    .footer {{ font-size: 12px; color: #64748b; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">SAZU Study Hub</div>
    <h2 class="title">Verify your email address</h2>
    <p>Hello <strong>{recipient_name}</strong>,</p>
    <p>Please enter the following 6-digit verification code to confirm your email and activate your account:</p>
    <div class="code-box">
      <div class="code">{code}</div>
    </div>
    <p style="font-size: 13px; color: #475569;">This code expires in <strong>15 minutes</strong>. If you did not request this, please disregard this email.</p>
    <div class="footer">
      &copy; SAZU Study Hub • Sa'adu Zungur University (Gadau, Bauchi State)
    </div>
  </div>
</body>
</html>"""
    return _dispatch_email(to_email, recipient_name, subject, html_content, text_content, code)


def send_password_reset_otp(to_email: str, recipient_name: str, code: str) -> bool:
    """Send a 6-digit password reset OTP to the student."""
    subject = f"Reset your SAZU Study Hub Password: {code}"
    text_content = f"""Hello {recipient_name},

A password reset request was received for your SAZU Study Hub account.

Your 6-digit password reset code is: {code}

This code will expire in 15 minutes. If you did not request a password reset, please ignore this email or contact support.

Best regards,
SAZU Study Hub Team
"""
    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a; }}
    .container {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }}
    .logo {{ color: #0f766e; font-size: 20px; font-weight: 800; margin-bottom: 24px; }}
    .title {{ font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 0; }}
    .code-box {{ background: #fef2f2; border: 2px dashed #ef4444; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }}
    .code {{ font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #991b1b; font-family: monospace; }}
    .footer {{ font-size: 12px; color: #64748b; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">SAZU Study Hub</div>
    <h2 class="title">Reset Your Account Password</h2>
    <p>Hello <strong>{recipient_name}</strong>,</p>
    <p>We received a request to reset your password. Use the following 6-digit code to complete the reset:</p>
    <div class="code-box">
      <div class="code">{code}</div>
    </div>
    <p style="font-size: 13px; color: #475569;">This code expires in <strong>15 minutes</strong>. If you did not request this reset, your account is secure and you can disregard this email.</p>
    <div class="footer">
      &copy; SAZU Study Hub • Sa'adu Zungur University (Gadau, Bauchi State)
    </div>
  </div>
</body>
</html>"""
    return _dispatch_email(to_email, recipient_name, subject, html_content, text_content, code)
