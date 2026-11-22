import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)


def send_email_otp(to_email: str, recipient_name: str, code: str) -> bool:
    """Send a 6-digit email verification OTP to the user.

    If SMTP credentials are not configured in environment variables,
    logs the OTP for development mode and returns True so local workflows
    and tests operate smoothly without an external mail server.
    """
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port_raw = os.getenv("SMTP_PORT", "587")
    try:
        smtp_port = int(smtp_port_raw)
    except ValueError:
        smtp_port = 587
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_tls = os.getenv("SMTP_TLS", "true").lower() in ("true", "1", "yes")
    from_email = os.getenv("EMAILS_FROM_EMAIL", "noreply@sazu-studyhub.edu.ng")
    from_name = os.getenv("EMAILS_FROM_NAME", "SAZU Study Hub")

    # In dev or unconfigured mode, log the verification code
    if not smtp_host or not smtp_user or not smtp_password:
        logger.info(
            "[EMAIL DEV MODE] SMTP not configured. Verification code for %s (%s): %s",
            to_email,
            recipient_name,
            code,
        )
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Your SAZU Study Hub Verification Code: {code}"
        msg["From"] = f"{from_name} <{from_email}>"
        msg["To"] = to_email

        text_content = f"""Hello {recipient_name},

Your verification code for SAZU Study Hub is: {code}

This code will expire in 15 minutes. If you did not request this, please disregard this email.

Best regards,
SAZU Study Hub Team
"""
        html_content = f"""<!DOCTYPE html>
<html>
<head>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a; }}
    .container {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }}
    .logo {{ color: #0f766e; font-size: 20px; font-weight: 800; margin-bottom: 24px; display: flex; align-items: center; gap: 8px; }}
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
    <p>Please use the following 6-digit verification code to complete your email verification and unlock your student learning platform account:</p>
    <div class="code-box">
      <div class="code">{code}</div>
    </div>
    <p style="font-size: 13px; color: #475569;">This code expires in <strong>15 minutes</strong>. If you did not create an account on SAZU Study Hub, you can safely ignore this email.</p>
    <div class="footer">
      &copy; SAZU Study Hub • Sa'adu Zungur University (Gadau, Bauchi State)
    </div>
  </div>
</body>
</html>"""

        msg.attach(MIMEText(text_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))

        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            if smtp_tls:
                server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(from_email, [to_email], msg.as_string())
        logger.info("Successfully sent verification email to %s", to_email)
        return True
    except Exception as exc:
        logger.warning("Failed to send email to %s: %s. Fallback logged.", to_email, exc)
        return False
