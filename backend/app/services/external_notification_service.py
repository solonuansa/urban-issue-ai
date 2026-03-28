from __future__ import annotations

import smtplib
from email.message import EmailMessage

from app.config import (
    EXTERNAL_ALERTS_ENABLED,
    EXTERNAL_ALERT_RECIPIENTS,
    SMTP_FROM_EMAIL,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USE_TLS,
    SMTP_USERNAME,
)


def _parse_csv_emails(raw: str) -> list[str]:
    emails: list[str] = []
    for item in raw.split(","):
        email = item.strip().lower()
        if "@" in email and email not in emails:
            emails.append(email)
    return emails


def _smtp_ready() -> bool:
    return EXTERNAL_ALERTS_ENABLED and bool(SMTP_HOST.strip()) and bool(SMTP_FROM_EMAIL.strip())


def merge_alert_recipients(dynamic_emails: list[str] | None = None) -> list[str]:
    merged = _parse_csv_emails(EXTERNAL_ALERT_RECIPIENTS)
    for email in dynamic_emails or []:
        normalized = (email or "").strip().lower()
        if "@" in normalized and normalized not in merged:
            merged.append(normalized)
    return merged


def send_email_alert(*, subject: str, body: str, recipients: list[str]) -> dict:
    if not recipients:
        return {"enabled": EXTERNAL_ALERTS_ENABLED, "attempted": 0, "sent": 0, "skipped": True}
    if not _smtp_ready():
        return {"enabled": EXTERNAL_ALERTS_ENABLED, "attempted": len(recipients), "sent": 0, "skipped": True}

    sent = 0
    for recipient in recipients:
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = SMTP_FROM_EMAIL
        message["To"] = recipient
        message.set_content(body)

        try:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as smtp:
                if SMTP_USE_TLS:
                    smtp.starttls()
                if SMTP_USERNAME:
                    smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
                smtp.send_message(message)
                sent += 1
        except Exception as exc:
            # Keep report workflow resilient even if SMTP is unavailable.
            print(f"[external_notification_service] email send failed to {recipient}: {exc}")

    return {
        "enabled": EXTERNAL_ALERTS_ENABLED,
        "attempted": len(recipients),
        "sent": sent,
        "skipped": False,
    }
