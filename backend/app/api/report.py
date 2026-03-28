from __future__ import annotations

import os
import uuid
import csv
import math
from io import StringIO
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import String, case, cast, func, or_
from sqlalchemy.orm import Session

from app.config import (
    CITIZEN_ALERT_COOLDOWN_HIGH_MIN,
    CITIZEN_ALERT_COOLDOWN_MEDIUM_MIN,
    CITIZEN_ALERT_HIGH_COUNT_MIN,
    CITIZEN_ALERT_HIGH_PRIORITY_NEAR_MIN,
    CITIZEN_ALERT_HIGH_SCORE_MIN,
    CITIZEN_ALERT_MEDIUM_COUNT_MIN,
    CITIZEN_ALERT_MEDIUM_SCORE_MIN,
    HOTSPOT_RISK_CRITICAL_COUNT_MIN,
    HOTSPOT_RISK_CRITICAL_HIGH_COUNT_MIN,
    HOTSPOT_RISK_CRITICAL_SCORE_MIN,
    HOTSPOT_RISK_HIGH_COUNT_MIN,
    HOTSPOT_RISK_HIGH_SCORE_MIN,
    HOTSPOT_RISK_MEDIUM_COUNT_MIN,
    HOTSPOT_RISK_MEDIUM_SCORE_MIN,
    HOTSPOT_RISK_WEIGHT_HIGH,
    HOTSPOT_RISK_WEIGHT_OPEN,
    HOTSPOT_RISK_WEIGHT_TOTAL,
    MAX_FILE_SIZE_MB,
    REPORT_RATE_LIMIT_PER_MINUTE,
    UPLOAD_DIR,
)
from app.core.database import get_db
from app.dependencies.auth import get_current_user, require_admin, require_operator_or_admin
from app.models.hotspot_risk_policy_model import HotspotRiskPolicy
from app.models.report_model import Report
from app.models.report_audit_log import ReportAuditLog
from app.models.notification_model import Notification
from app.models.user_model import User
from app.services.cv_service import classify_image
from app.services.external_notification_service import merge_alert_recipients, send_email_alert
from app.services.routing_service import get_route_candidates
from app.services.response_service import generate_response
from app.services.urgency_service import calculate_urgency
from app.utils.admin_area_utils import lookup_admin_area
from app.utils.geo_utils import haversine_distance
from app.utils.rate_limiter import rate_limiter

router = APIRouter()

os.makedirs(UPLOAD_DIR, exist_ok=True)
UPLOAD_ROOT = Path(UPLOAD_DIR)
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
REPORT_STATUSES = {"NEW", "IN_REVIEW", "IN_PROGRESS", "RESOLVED", "REJECTED"}
VALID_TRANSITIONS = {
    "NEW": {"IN_REVIEW", "REJECTED"},
    "IN_REVIEW": {"IN_PROGRESS", "REJECTED"},
    "IN_PROGRESS": {"RESOLVED"},
}


class HotspotRiskPolicyPayload(BaseModel):
    weight_total: float = Field(gt=0)
    weight_high: float = Field(gt=0)
    weight_open: float = Field(gt=0)
    medium_score_min: float = Field(ge=0)
    high_score_min: float = Field(ge=0)
    critical_score_min: float = Field(ge=0)
    medium_count_min: int = Field(ge=0)
    high_count_min: int = Field(ge=0)
    critical_count_min: int = Field(ge=0)
    critical_high_count_min: int = Field(ge=0)


def _default_hotspot_policy() -> dict:
    return {
        "weight_total": HOTSPOT_RISK_WEIGHT_TOTAL,
        "weight_high": HOTSPOT_RISK_WEIGHT_HIGH,
        "weight_open": HOTSPOT_RISK_WEIGHT_OPEN,
        "medium_score_min": HOTSPOT_RISK_MEDIUM_SCORE_MIN,
        "high_score_min": HOTSPOT_RISK_HIGH_SCORE_MIN,
        "critical_score_min": HOTSPOT_RISK_CRITICAL_SCORE_MIN,
        "medium_count_min": HOTSPOT_RISK_MEDIUM_COUNT_MIN,
        "high_count_min": HOTSPOT_RISK_HIGH_COUNT_MIN,
        "critical_count_min": HOTSPOT_RISK_CRITICAL_COUNT_MIN,
        "critical_high_count_min": HOTSPOT_RISK_CRITICAL_HIGH_COUNT_MIN,
    }


def _validate_hotspot_policy(policy: dict) -> None:
    if policy["medium_score_min"] > policy["high_score_min"]:
        raise HTTPException(status_code=400, detail="medium_score_min must be <= high_score_min")
    if policy["high_score_min"] > policy["critical_score_min"]:
        raise HTTPException(status_code=400, detail="high_score_min must be <= critical_score_min")
    if policy["medium_count_min"] > policy["high_count_min"]:
        raise HTTPException(status_code=400, detail="medium_count_min must be <= high_count_min")
    if policy["high_count_min"] > policy["critical_count_min"]:
        raise HTTPException(status_code=400, detail="high_count_min must be <= critical_count_min")
    if policy["critical_high_count_min"] > policy["critical_count_min"]:
        raise HTTPException(
            status_code=400,
            detail="critical_high_count_min must be <= critical_count_min",
        )


def _serialize_hotspot_policy(policy: dict, *, source: str) -> dict:
    return {
        "source": source,
        "weights": {
            "total": policy["weight_total"],
            "high": policy["weight_high"],
            "open": policy["weight_open"],
        },
        "score_min": {
            "medium": policy["medium_score_min"],
            "high": policy["high_score_min"],
            "critical": policy["critical_score_min"],
        },
        "count_min": {
            "medium": policy["medium_count_min"],
            "high": policy["high_count_min"],
            "critical": policy["critical_count_min"],
            "critical_high_count": policy["critical_high_count_min"],
        },
    }


def _get_hotspot_policy(db: Session) -> tuple[dict, str]:
    row = db.query(HotspotRiskPolicy).order_by(HotspotRiskPolicy.id.desc()).first()
    if not row:
        return _default_hotspot_policy(), "env_default"
    return (
        {
            "weight_total": float(row.weight_total),
            "weight_high": float(row.weight_high),
            "weight_open": float(row.weight_open),
            "medium_score_min": float(row.medium_score_min),
            "high_score_min": float(row.high_score_min),
            "critical_score_min": float(row.critical_score_min),
            "medium_count_min": int(row.medium_count_min),
            "high_count_min": int(row.high_count_min),
            "critical_count_min": int(row.critical_count_min),
            "critical_high_count_min": int(row.critical_high_count_min),
        },
        "db_override",
    )


def _create_notification(
    db: Session,
    *,
    user_id: int | None,
    title: str,
    body: str,
    related_report_id: int | None,
    type_: str = "info",
) -> None:
    if not user_id:
        return
    db.add(
        Notification(
            user_id=user_id,
            title=title,
            body=body,
            type=type_,
            related_report_id=related_report_id,
            is_read=False,
        )
    )


def _notify_high_priority_submission(db: Session, report: Report, reporter_name: str) -> None:
    if report.priority_label != "HIGH":
        return

    recipients = db.query(User).filter(User.role.in_(("operator", "admin"))).all()
    operator_admin_emails = [u.email for u in recipients if u.email]

    for user in recipients:
        _create_notification(
            db,
            user_id=user.id,
            title="High Priority Report Submitted",
            body=f"Report #{report.id} requires immediate triage.",
            related_report_id=report.id,
            type_="high_priority_alert",
        )

    subject = f"[Urban Issue AI] HIGH priority report #{report.id}"
    body = (
        "A high priority civic issue has been submitted.\n\n"
        f"Report ID: {report.id}\n"
        f"Issue Type: {report.issue_type}\n"
        f"Severity: {report.severity_level}\n"
        f"Priority: {report.priority_label}\n"
        f"Status: {report.status}\n"
        f"Location: {report.latitude}, {report.longitude}\n"
        f"Reporter: {reporter_name}\n"
    )
    send_email_alert(
        subject=subject,
        body=body,
        recipients=merge_alert_recipients(operator_admin_emails),
    )


def _notify_status_change_email(
    db: Session,
    *,
    report: Report,
    previous_status: str,
    new_status: str,
    changed_by_name: str,
) -> None:
    recipient_candidates: list[str] = []
    if report.created_by_user_id:
        creator = db.query(User).filter(User.id == report.created_by_user_id).first()
        if creator and creator.email:
            recipient_candidates.append(creator.email)
    if report.assigned_to_user_id:
        assignee = db.query(User).filter(User.id == report.assigned_to_user_id).first()
        if assignee and assignee.email:
            recipient_candidates.append(assignee.email)

    subject = f"[Urban Issue AI] Report #{report.id} moved to {new_status}"
    body = (
        "A report status has been updated.\n\n"
        f"Report ID: {report.id}\n"
        f"Issue Type: {report.issue_type}\n"
        f"Previous Status: {previous_status}\n"
        f"New Status: {new_status}\n"
        f"Updated By: {changed_by_name}\n"
    )
    send_email_alert(
        subject=subject,
        body=body,
        recipients=merge_alert_recipients(recipient_candidates),
    )


def _to_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _bucket_center(lat: float, lng: float, grid_size: float) -> tuple[float, float]:
    return (
        round(round(lat / grid_size) * grid_size, 6),
        round(round(lng / grid_size) * grid_size, 6),
    )


def _bucket_expr(column, grid_size: float):
    return func.round(func.round(column / grid_size) * grid_size, 6)


def _classify_hotspot_risk(
    count: int,
    high_count: int,
    open_count: int,
    policy: dict,
) -> tuple[str, float]:
    risk_score = (
        (policy["weight_total"] * float(count))
        + (policy["weight_high"] * float(high_count))
        + (policy["weight_open"] * float(open_count))
    )
    if risk_score >= policy["critical_score_min"] or (
        count >= policy["critical_count_min"]
        and high_count >= policy["critical_high_count_min"]
    ):
        return "CRITICAL", round(risk_score, 2)
    if risk_score >= policy["high_score_min"] or count >= policy["high_count_min"]:
        return "HIGH", round(risk_score, 2)
    if risk_score >= policy["medium_score_min"] or count >= policy["medium_count_min"]:
        return "MEDIUM", round(risk_score, 2)
    return "LOW", round(risk_score, 2)


def _aggregate_hotspots_by_admin_area(hotspots: list[dict], policy: dict) -> list[dict]:
    grouped: dict[str, dict] = {}
    for item in hotspots:
        area = lookup_admin_area(item["lat"], item["lng"])
        if not area:
            continue
        key = area["id"]
        bucket = grouped.setdefault(
            key,
            {
                "area_id": area["id"],
                "area_name": area["name"],
                "city": area["city"],
                "hotspot_count": 0,
                "report_count": 0,
                "high_count": 0,
                "open_count": 0,
                "risk_score": 0.0,
            },
        )
        bucket["hotspot_count"] += 1
        bucket["report_count"] += int(item["count"])
        bucket["high_count"] += int(item["high_count"])
        bucket["open_count"] += int(item["open_count"])
        bucket["risk_score"] += float(item["risk_score"])

    segments = []
    for row in grouped.values():
        risk_level, _ = _classify_hotspot_risk(
            row["report_count"],
            row["high_count"],
            row["open_count"],
            policy,
        )
        row["risk_score"] = round(row["risk_score"], 2)
        row["risk_level"] = risk_level
        segments.append(row)

    segments.sort(
        key=lambda x: (
            x["risk_score"],
            x["report_count"],
            x["high_count"],
            x["hotspot_count"],
        ),
        reverse=True,
    )
    return segments


def _to_maps_url(start_lat: float, start_lng: float, end_lat: float, end_lng: float) -> str:
    return (
        "https://www.google.com/maps/dir/?api=1"
        f"&origin={start_lat},{start_lng}"
        f"&destination={end_lat},{end_lng}"
        "&travelmode=driving"
    )


def _to_route_label(rank: int) -> str:
    if rank == 1:
        return "Rute Utama"
    if rank == 2:
        return "Alternatif A"
    if rank == 3:
        return "Alternatif B"
    return f"Alternatif {rank - 1}"


def _build_citizen_alert_policy_payload(
    *,
    risk_level: str,
    weighted_score: float,
    count: int,
    nearby_items: list[dict],
) -> dict:
    near_high_priority = sum(1 for item in nearby_items if item["priority_label"] == "HIGH")
    reasons: list[str] = []
    should_alert = False
    message = "Kondisi area relatif aman. Tetap berhati-hati saat berkendara."
    cooldown_min = 0

    if (
        risk_level == "HIGH"
        and (
            weighted_score >= CITIZEN_ALERT_HIGH_SCORE_MIN
            or count >= CITIZEN_ALERT_HIGH_COUNT_MIN
            or near_high_priority >= CITIZEN_ALERT_HIGH_PRIORITY_NEAR_MIN
        )
    ):
        should_alert = True
        cooldown_min = CITIZEN_ALERT_COOLDOWN_HIGH_MIN
        message = (
            "Peringatan risiko tinggi. Kurangi kecepatan, jaga jarak aman, dan "
            "pertimbangkan rute alternatif."
        )
        reasons = [
            f"score>={CITIZEN_ALERT_HIGH_SCORE_MIN}",
            f"count>={CITIZEN_ALERT_HIGH_COUNT_MIN}",
            f"high_priority_near>={CITIZEN_ALERT_HIGH_PRIORITY_NEAR_MIN}",
        ]
    elif (
        risk_level == "MEDIUM"
        and (
            weighted_score >= CITIZEN_ALERT_MEDIUM_SCORE_MIN
            or count >= CITIZEN_ALERT_MEDIUM_COUNT_MIN
        )
    ):
        should_alert = True
        cooldown_min = CITIZEN_ALERT_COOLDOWN_MEDIUM_MIN
        message = (
            "Area cukup berisiko. Tingkatkan kewaspadaan terhadap lubang jalan "
            "dan potensi manuver mendadak."
        )
        reasons = [
            f"score>={CITIZEN_ALERT_MEDIUM_SCORE_MIN}",
            f"count>={CITIZEN_ALERT_MEDIUM_COUNT_MIN}",
        ]

    return {
        "should_alert": should_alert,
        "level": risk_level,
        "message": message,
        "cooldown_minutes": cooldown_min,
        "near_high_priority": near_high_priority,
        "reasons": reasons,
    }


def _apply_hotspot_filters(
    query,
    *,
    days: int,
    status_filter: str | None,
    priority: str | None,
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    query = query.filter(Report.created_at >= since)

    if priority:
        priority_upper = priority.upper()
        if priority_upper not in ("HIGH", "MEDIUM", "LOW"):
            raise HTTPException(status_code=400, detail="priority must be HIGH, MEDIUM, or LOW")
        query = query.filter(Report.priority_label == priority_upper)

    if status_filter:
        status_upper = status_filter.upper()
        if status_upper == "OPEN":
            query = query.filter(Report.status.in_(("NEW", "IN_REVIEW", "IN_PROGRESS")))
        elif status_upper in REPORT_STATUSES:
            query = query.filter(Report.status == status_upper)
        else:
            raise HTTPException(
                status_code=400,
                detail="status must be OPEN, NEW, IN_REVIEW, IN_PROGRESS, RESOLVED, or REJECTED",
            )

    return query


def _build_metrics_payload(db: Session) -> dict:
    total_reports = db.query(func.count(Report.id)).scalar() or 0
    status_counts = dict(
        db.query(Report.status, func.count(Report.id))
        .group_by(Report.status)
        .all()
    )
    priority_counts = dict(
        db.query(Report.priority_label, func.count(Report.id))
        .group_by(Report.priority_label)
        .all()
    )

    fourteen_days_ago = datetime.now(timezone.utc) - timedelta(days=13)
    incoming_rows = (
        db.query(func.date(Report.created_at), func.count(Report.id))
        .filter(Report.created_at >= fourteen_days_ago)
        .group_by(func.date(Report.created_at))
        .all()
    )
    resolved_rows = (
        db.query(func.date(Report.resolved_at), func.count(Report.id))
        .filter(Report.resolved_at.isnot(None))
        .filter(Report.resolved_at >= fourteen_days_ago)
        .group_by(func.date(Report.resolved_at))
        .all()
    )

    incoming_map = {str(day): count for day, count in incoming_rows}
    resolved_map = {str(day): count for day, count in resolved_rows}

    trend = []
    for i in range(14):
        day = (fourteen_days_ago + timedelta(days=i)).date().isoformat()
        trend.append(
            {
                "date": day,
                "incoming": int(incoming_map.get(day, 0)),
                "resolved": int(resolved_map.get(day, 0)),
            }
        )

    resolved_reports = (
        db.query(Report.created_at, Report.resolved_at)
        .filter(Report.resolved_at.isnot(None))
        .all()
    )
    resolution_hours = []
    for created_at, resolved_at in resolved_reports:
        created_utc = _to_utc(created_at)
        resolved_utc = _to_utc(resolved_at)
        if created_utc and resolved_utc:
            delta = resolved_utc - created_utc
            resolution_hours.append(delta.total_seconds() / 3600)

    mttr_hours = round(sum(resolution_hours) / len(resolution_hours), 2) if resolution_hours else 0.0

    now_utc = datetime.now(timezone.utc)
    high_sla_cutoff = now_utc - timedelta(days=2)
    backlog_cutoff = now_utc - timedelta(days=7)

    high_open_breached = (
        db.query(func.count(Report.id))
        .filter(Report.priority_label == "HIGH")
        .filter(Report.status.in_(("NEW", "IN_REVIEW", "IN_PROGRESS")))
        .filter(Report.created_at <= high_sla_cutoff)
        .scalar()
        or 0
    )

    high_resolved_reports = (
        db.query(Report.created_at, Report.resolved_at)
        .filter(Report.priority_label == "HIGH")
        .filter(Report.resolved_at.isnot(None))
        .all()
    )
    high_resolved_late = 0
    for created_at, resolved_at in high_resolved_reports:
        created_utc = _to_utc(created_at)
        resolved_utc = _to_utc(resolved_at)
        if created_utc and resolved_utc and (resolved_utc - created_utc) > timedelta(days=2):
            high_resolved_late += 1

    aging_backlog_over_7d = (
        db.query(func.count(Report.id))
        .filter(Report.status.in_(("NEW", "IN_REVIEW", "IN_PROGRESS")))
        .filter(Report.created_at <= backlog_cutoff)
        .scalar()
        or 0
    )

    fourteen_days_ago_count = now_utc - timedelta(days=14)
    incoming_14d = (
        db.query(func.count(Report.id))
        .filter(Report.created_at >= fourteen_days_ago_count)
        .scalar()
        or 0
    )
    resolved_14d = (
        db.query(func.count(Report.id))
        .filter(Report.resolved_at.isnot(None))
        .filter(Report.resolved_at >= fourteen_days_ago_count)
        .scalar()
        or 0
    )
    resolution_rate_14d = round((resolved_14d / incoming_14d) * 100, 2) if incoming_14d else 0.0

    top_issue_rows = (
        db.query(Report.issue_type, func.count(Report.id))
        .group_by(Report.issue_type)
        .order_by(func.count(Report.id).desc())
        .limit(5)
        .all()
    )
    top_issue_types = [
        {"issue_type": issue_type or "unknown", "count": int(count)}
        for issue_type, count in top_issue_rows
    ]

    return {
        "summary": {
            "total_reports": int(total_reports),
            "status_counts": {
                "NEW": int(status_counts.get("NEW", 0)),
                "IN_REVIEW": int(status_counts.get("IN_REVIEW", 0)),
                "IN_PROGRESS": int(status_counts.get("IN_PROGRESS", 0)),
                "RESOLVED": int(status_counts.get("RESOLVED", 0)),
                "REJECTED": int(status_counts.get("REJECTED", 0)),
            },
            "priority_counts": {
                "HIGH": int(priority_counts.get("HIGH", 0)),
                "MEDIUM": int(priority_counts.get("MEDIUM", 0)),
                "LOW": int(priority_counts.get("LOW", 0)),
            },
        },
        "trend_14d": trend,
        "advanced": {
            "mttr_hours": mttr_hours,
            "sla_breached_high": int(high_open_breached + high_resolved_late),
            "aging_backlog_over_7d": int(aging_backlog_over_7d),
            "resolution_rate_14d": resolution_rate_14d,
            "top_issue_types": top_issue_types,
        },
    }


def _serialize_report(r: Report) -> dict:
    return {
        "id": r.id,
        "issue_type": r.issue_type,
        "severity_level": r.severity_level,
        "urgency_score": r.urgency_score,
        "priority_label": r.priority_label,
        "latitude": r.latitude,
        "longitude": r.longitude,
        "image_url": r.image_url,
        "auto_response": r.auto_response,
        "status": r.status,
        "created_by_user_id": r.created_by_user_id,
        "assigned_to_user_id": r.assigned_to_user_id,
        "resolution_note": r.resolution_note,
        "resolved_at": r.resolved_at,
        "updated_at": r.updated_at,
        "created_at": r.created_at,
    }


def _serialize_audit_log(log: ReportAuditLog) -> dict:
    return {
        "id": log.id,
        "report_id": log.report_id,
        "previous_status": log.previous_status,
        "new_status": log.new_status,
        "changed_by_user_id": log.changed_by_user_id,
        "assigned_to_user_id": log.assigned_to_user_id,
        "note": log.note,
        "created_at": log.created_at,
    }


@router.post("/submit")
async def submit_report(
    request: Request,
    image: UploadFile = File(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    location_importance: int = Form(..., ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submit a new civic issue report.
    """
    if current_user.role not in ("citizen", "operator", "admin"):
        raise HTTPException(status_code=403, detail="Invalid role")

    client_ip = request.client.host if request.client else "unknown"
    key = f"report-submit:{current_user.id}:{client_ip}"
    if not rate_limiter.hit(key, REPORT_RATE_LIMIT_PER_MINUTE):
        raise HTTPException(status_code=429, detail="Too many submissions. Please slow down.")

    content_type = image.content_type or ""
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported image type. Use JPG, PNG, or WEBP.")

    ext = os.path.splitext(image.filename)[1].lower() if image.filename else ".jpg"
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported image extension. Use .jpg, .jpeg, .png, or .webp.",
        )

    filename = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOAD_ROOT / filename
    max_size_bytes = MAX_FILE_SIZE_MB * 1024 * 1024
    total_size = 0

    with file_path.open("wb") as f:
        while True:
            chunk = await image.read(1024 * 1024)
            if not chunk:
                break
            total_size += len(chunk)
            if total_size > max_size_bytes:
                f.close()
                file_path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large. Maximum size is {MAX_FILE_SIZE_MB} MB.",
                )
            f.write(chunk)

    cv_result = classify_image(str(file_path))

    nearby = db.query(Report).filter(Report.issue_type == cv_result["issue_type"]).all()
    repeat_count = sum(
        1 for r in nearby if haversine_distance(latitude, longitude, r.latitude, r.longitude) < 0.5
    )

    urgency = calculate_urgency(cv_result["severity"], location_importance, repeat_count)
    auto_response = generate_response(
        cv_result["issue_type"], cv_result["severity"], urgency["priority_label"]
    )

    image_public_url = f"/uploads/{filename}"

    report = Report(
        issue_type=cv_result["issue_type"],
        severity_level=cv_result["severity"],
        urgency_score=urgency["urgency_score"],
        priority_label=urgency["priority_label"],
        latitude=latitude,
        longitude=longitude,
        image_url=image_public_url,
        auto_response=auto_response,
        status="NEW",
        created_by_user_id=current_user.id,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    _notify_high_priority_submission(db, report, current_user.full_name)
    db.commit()

    data = _serialize_report(report)
    data["cv_confidence"] = cv_result.get("confidence", 0.0)

    return {
        "message": "Report submitted successfully",
        "data": data,
    }


@router.get("/")
def get_reports(
    priority: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_operator_or_admin),
):
    """Get all reports, optionally filtered by priority label and status."""
    query = db.query(Report)
    if priority:
        priority_upper = priority.upper()
        if priority_upper not in ("HIGH", "MEDIUM", "LOW"):
            raise HTTPException(status_code=400, detail="priority must be HIGH, MEDIUM, or LOW")
        query = query.filter(Report.priority_label == priority_upper)

    if status_filter:
        status_upper = status_filter.upper()
        if status_upper not in REPORT_STATUSES:
            raise HTTPException(
                status_code=400,
                detail="status must be NEW, IN_REVIEW, IN_PROGRESS, RESOLVED, or REJECTED",
            )
        query = query.filter(Report.status == status_upper)

    if search:
        query_text = search.strip().lower()
        if query_text:
            query = query.filter(
                or_(
                    func.lower(Report.issue_type).contains(query_text),
                    func.lower(Report.severity_level).contains(query_text),
                    func.lower(Report.priority_label).contains(query_text),
                    func.lower(Report.status).contains(query_text),
                    cast(Report.id, String).contains(query_text),
                )
            )

    total = query.count()
    reports = (
        query.order_by(Report.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    total_pages = (total + page_size - 1) // page_size if total > 0 else 1
    return {
        "reports": [_serialize_report(r) for r in reports],
        "meta": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
        },
    }


@router.get("/operators")
def get_operator_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_operator_or_admin),
):
    users = (
        db.query(User)
        .filter(User.role.in_(("operator", "admin")))
        .order_by(User.full_name.asc())
        .all()
    )
    return {
        "operators": [
            {
                "id": u.id,
                "full_name": u.full_name,
                "email": u.email,
                "role": u.role,
            }
            for u in users
        ]
    }


@router.get("/{report_id}")
def get_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single report by ID."""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if current_user.role in ("operator", "admin") or report.created_by_user_id == current_user.id:
        return {"report": _serialize_report(report)}

    raise HTTPException(status_code=403, detail="Forbidden")


@router.patch("/{report_id}/assign")
def assign_report_operator(
    report_id: int,
    assigned_to_user_id: int = Form(...),
    note: str = Form(default="", max_length=300),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    assignee = db.query(User).filter(User.id == assigned_to_user_id).first()
    if not assignee:
        raise HTTPException(status_code=404, detail="Assigned user not found")
    if assignee.role not in ("operator", "admin"):
        raise HTTPException(status_code=400, detail="Assignee must be operator or admin")

    report.assigned_to_user_id = assignee.id
    report.updated_at = datetime.now(timezone.utc)
    db.add(
        ReportAuditLog(
            report_id=report.id,
            previous_status=report.status,
            new_status=report.status,
            changed_by_user_id=current_user.id,
            assigned_to_user_id=assignee.id,
            note=note.strip() or "Assignee updated",
        )
    )
    _create_notification(
        db,
        user_id=assignee.id,
        title="New Report Assignment",
        body=f"You were assigned to report #{report.id}.",
        related_report_id=report.id,
        type_="assignment",
    )
    if report.created_by_user_id and report.created_by_user_id != current_user.id:
        _create_notification(
            db,
            user_id=report.created_by_user_id,
            title="Report Assigned",
            body=f"Your report #{report.id} has been assigned to operations.",
            related_report_id=report.id,
            type_="status_update",
        )
    db.commit()
    db.refresh(report)

    return {
        "message": "Assignee updated",
        "report": _serialize_report(report),
    }


@router.patch("/{report_id}/status")
def update_report_status(
    report_id: int,
    new_status: str = Form(..., alias="status"),
    resolution_note: str = Form(default="", max_length=500),
    assigned_to_user_id: int | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    status_upper = new_status.upper()
    if status_upper not in REPORT_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="status must be NEW, IN_REVIEW, IN_PROGRESS, RESOLVED, or REJECTED",
        )

    if report.status != status_upper:
        allowed = VALID_TRANSITIONS.get(report.status, set())
        if status_upper not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status transition from {report.status} to {status_upper}",
            )

    if assigned_to_user_id is not None:
        assignee = db.query(User).filter(User.id == assigned_to_user_id).first()
        if not assignee:
            raise HTTPException(status_code=404, detail="Assigned user not found")
        if assignee.role not in ("operator", "admin"):
            raise HTTPException(status_code=400, detail="Assignee must be operator or admin")
        report.assigned_to_user_id = assigned_to_user_id

    previous_status = report.status
    report.status = status_upper
    report.updated_at = datetime.now(timezone.utc)

    if status_upper == "RESOLVED":
        report.resolved_at = datetime.now(timezone.utc)
        report.resolution_note = resolution_note.strip() or report.resolution_note
    elif status_upper == "REJECTED":
        report.resolution_note = resolution_note.strip() or "Rejected by operations team"

    db.add(
        ReportAuditLog(
            report_id=report.id,
            previous_status=previous_status,
            new_status=status_upper,
            changed_by_user_id=current_user.id,
            assigned_to_user_id=report.assigned_to_user_id,
            note=resolution_note.strip() or None,
        )
    )
    if report.created_by_user_id and report.created_by_user_id != current_user.id:
        _create_notification(
            db,
            user_id=report.created_by_user_id,
            title="Report Status Updated",
            body=f"Your report #{report.id} moved to {status_upper}.",
            related_report_id=report.id,
            type_="status_update",
        )
    if report.assigned_to_user_id and report.assigned_to_user_id != current_user.id:
        _create_notification(
            db,
            user_id=report.assigned_to_user_id,
            title="Workflow Updated",
            body=f"Report #{report.id} status is now {status_upper}.",
            related_report_id=report.id,
            type_="workflow",
        )
    _notify_status_change_email(
        db,
        report=report,
        previous_status=previous_status,
        new_status=status_upper,
        changed_by_name=current_user.full_name,
    )

    db.commit()
    db.refresh(report)

    return {
        "message": "Report status updated",
        "report": _serialize_report(report),
        "updated_by": {
            "id": current_user.id,
            "full_name": current_user.full_name,
            "role": current_user.role,
        },
    }


@router.get("/{report_id}/audit")
def get_report_audit_logs(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if current_user.role not in ("operator", "admin") and report.created_by_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    logs = (
        db.query(ReportAuditLog)
        .filter(ReportAuditLog.report_id == report_id)
        .order_by(ReportAuditLog.created_at.desc())
        .all()
    )

    return {"logs": [_serialize_audit_log(log) for log in logs]}


@router.get("/metrics/sla/high")
def get_high_priority_sla_board(
    db: Session = Depends(get_db),
    _: User = Depends(require_operator_or_admin),
):
    now_utc = datetime.now(timezone.utc)
    high_reports = (
        db.query(Report)
        .filter(Report.priority_label == "HIGH")
        .filter(Report.status.in_(("NEW", "IN_REVIEW", "IN_PROGRESS")))
        .order_by(Report.created_at.asc())
        .all()
    )

    items = []
    for report in high_reports:
        created_at = _to_utc(report.created_at)
        if not created_at:
            continue
        age_hours = (now_utc - created_at).total_seconds() / 3600
        due_at = created_at + timedelta(days=2)
        items.append(
            {
                **_serialize_report(report),
                "age_hours": round(age_hours, 2),
                "sla_due_at": due_at,
                "is_breached": now_utc > due_at,
            }
        )

    items.sort(key=lambda x: (not x["is_breached"], -x["age_hours"]))
    return {"items": items}


@router.get("/metrics/summary")
def get_report_analytics(
    db: Session = Depends(get_db),
    _: User = Depends(require_operator_or_admin),
):
    return _build_metrics_payload(db)


@router.get("/public/hotspots")
def get_public_hotspots_for_citizens(
    days: int = Query(default=14, ge=1, le=60),
    issue_type: str = Query(default="pothole"),
    grid_size: float = Query(default=0.01, ge=0.001, le=0.1),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    policy, policy_source = _get_hotspot_policy(db)
    _validate_hotspot_policy(policy)

    since = datetime.now(timezone.utc) - timedelta(days=days)
    bucket_lat = _bucket_expr(Report.latitude, grid_size).label("bucket_lat")
    bucket_lng = _bucket_expr(Report.longitude, grid_size).label("bucket_lng")

    base_query = (
        db.query(Report)
        .filter(Report.created_at >= since)
        .filter(Report.status.in_(("NEW", "IN_REVIEW", "IN_PROGRESS")))
    )

    issue_type_normalized = issue_type.strip().lower()
    if issue_type_normalized and issue_type_normalized != "all":
        base_query = base_query.filter(func.lower(Report.issue_type) == issue_type_normalized)

    rows = (
        base_query.with_entities(
            bucket_lat,
            bucket_lng,
            func.count(Report.id).label("count"),
            func.sum(case((Report.priority_label == "HIGH", 1), else_=0)).label("high_count"),
            func.sum(
                case((Report.status.in_(("NEW", "IN_REVIEW", "IN_PROGRESS")), 1), else_=0)
            ).label("open_count"),
        )
        .group_by(bucket_lat, bucket_lng)
        .order_by(func.count(Report.id).desc())
        .all()
    )

    hotspots = []
    for row in rows:
        count = int(row.count)
        high_count = int(row.high_count or 0)
        open_count = int(row.open_count or 0)
        risk_level, risk_score = _classify_hotspot_risk(count, high_count, open_count, policy)
        hotspots.append(
            {
                "lat": float(row.bucket_lat),
                "lng": float(row.bucket_lng),
                "count": count,
                "high_count": high_count,
                "open_count": open_count,
                "risk_level": risk_level,
                "risk_score": risk_score,
            }
        )

    hotspots.sort(
        key=lambda item: (
            item["risk_score"],
            item["count"],
            item["high_count"],
            item["open_count"],
        ),
        reverse=True,
    )

    critical_areas = sum(1 for item in hotspots if item["risk_level"] == "CRITICAL")
    high_areas = sum(1 for item in hotspots if item["risk_level"] == "HIGH")

    return {
        "hotspots": hotspots[:100],
        "meta": {
            "days": days,
            "issue_type": issue_type_normalized,
            "grid_size": grid_size,
            "total_hotspots": len(hotspots),
            "critical_areas": critical_areas,
            "high_areas": high_areas,
            "risk_policy": _serialize_hotspot_policy(policy, source=policy_source),
        },
        "advisory": {
            "headline": "Waspada area dengan konsentrasi isu tinggi, terutama jalan berlubang.",
            "tips": [
                "Kurangi kecepatan saat melintas area risiko HIGH/CRITICAL.",
                "Jaga jarak aman antar kendaraan untuk menghindari manuver mendadak.",
                "Laporkan titik jalan berlubang baru agar penanganan lebih cepat.",
            ],
        },
    }


@router.get("/public/hotspots/areas")
def get_public_hotspot_area_segments_for_citizens(
    days: int = Query(default=14, ge=1, le=60),
    issue_type: str = Query(default="pothole"),
    grid_size: float = Query(default=0.01, ge=0.001, le=0.1),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    policy, policy_source = _get_hotspot_policy(db)
    _validate_hotspot_policy(policy)

    since = datetime.now(timezone.utc) - timedelta(days=days)
    bucket_lat = _bucket_expr(Report.latitude, grid_size).label("bucket_lat")
    bucket_lng = _bucket_expr(Report.longitude, grid_size).label("bucket_lng")

    base_query = (
        db.query(Report)
        .filter(Report.created_at >= since)
        .filter(Report.status.in_(("NEW", "IN_REVIEW", "IN_PROGRESS")))
    )
    issue_type_normalized = issue_type.strip().lower()
    if issue_type_normalized and issue_type_normalized != "all":
        base_query = base_query.filter(func.lower(Report.issue_type) == issue_type_normalized)

    rows = (
        base_query.with_entities(
            bucket_lat,
            bucket_lng,
            func.count(Report.id).label("count"),
            func.sum(case((Report.priority_label == "HIGH", 1), else_=0)).label("high_count"),
            func.sum(
                case((Report.status.in_(("NEW", "IN_REVIEW", "IN_PROGRESS")), 1), else_=0)
            ).label("open_count"),
        )
        .group_by(bucket_lat, bucket_lng)
        .order_by(func.count(Report.id).desc())
        .all()
    )

    hotspots = []
    for row in rows:
        count = int(row.count)
        high_count = int(row.high_count or 0)
        open_count = int(row.open_count or 0)
        risk_level, risk_score = _classify_hotspot_risk(count, high_count, open_count, policy)
        hotspots.append(
            {
                "lat": float(row.bucket_lat),
                "lng": float(row.bucket_lng),
                "count": count,
                "high_count": high_count,
                "open_count": open_count,
                "risk_level": risk_level,
                "risk_score": risk_score,
            }
        )

    segments = _aggregate_hotspots_by_admin_area(hotspots, policy)
    return {
        "areas": segments[:20],
        "meta": {
            "days": days,
            "issue_type": issue_type_normalized,
            "grid_size": grid_size,
            "total_areas": len(segments),
            "risk_policy": _serialize_hotspot_policy(policy, source=policy_source),
        },
    }


@router.get("/public/nearby-risk")
def get_public_nearby_risk_for_citizens(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(default=3.0, ge=0.2, le=20.0),
    days: int = Query(default=30, ge=1, le=90),
    issue_type: str = Query(default="pothole"),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    policy, _ = _get_hotspot_policy(db)
    _validate_hotspot_policy(policy)

    since = datetime.now(timezone.utc) - timedelta(days=days)
    lat_delta = radius_km / 111.0
    cos_lat = max(abs(math.cos(math.radians(latitude))), 0.01)
    lng_delta = radius_km / (111.0 * cos_lat)
    query = (
        db.query(Report)
        .filter(Report.created_at >= since)
        .filter(Report.status.in_(("NEW", "IN_REVIEW", "IN_PROGRESS")))
        .filter(Report.latitude >= latitude - lat_delta)
        .filter(Report.latitude <= latitude + lat_delta)
        .filter(Report.longitude >= longitude - lng_delta)
        .filter(Report.longitude <= longitude + lng_delta)
    )

    issue_type_normalized = issue_type.strip().lower()
    if issue_type_normalized and issue_type_normalized != "all":
        query = query.filter(func.lower(Report.issue_type) == issue_type_normalized)

    reports = query.all()
    nearby_items = []
    for r in reports:
        distance_km = haversine_distance(latitude, longitude, r.latitude, r.longitude)
        if distance_km > radius_km:
            continue
        _, risk_score = _classify_hotspot_risk(
            1,
            1 if r.priority_label == "HIGH" else 0,
            1 if r.status in ("NEW", "IN_REVIEW", "IN_PROGRESS") else 0,
            policy,
        )
        nearby_items.append(
            {
                "id": r.id,
                "issue_type": r.issue_type,
                "priority_label": r.priority_label,
                "status": r.status,
                "latitude": r.latitude,
                "longitude": r.longitude,
                "distance_km": round(distance_km, 3),
                "risk_score": risk_score,
            }
        )

    nearby_items.sort(key=lambda item: (item["distance_km"], -item["risk_score"]))
    nearby_items = nearby_items[:limit]

    weighted_score = sum(
        (item["risk_score"] * (1.0 / max(item["distance_km"], 0.1))) for item in nearby_items
    )
    if weighted_score >= 80 or any(item["priority_label"] == "HIGH" for item in nearby_items[:3]):
        level = "HIGH"
    elif weighted_score >= 30 or len(nearby_items) >= 6:
        level = "MEDIUM"
    else:
        level = "LOW"
    weighted_score = round(weighted_score, 2)
    alert_payload = _build_citizen_alert_policy_payload(
        risk_level=level,
        weighted_score=weighted_score,
        count=len(nearby_items),
        nearby_items=nearby_items,
    )

    return {
        "meta": {
            "latitude": latitude,
            "longitude": longitude,
            "radius_km": radius_km,
            "days": days,
            "issue_type": issue_type_normalized,
            "count": len(nearby_items),
            "risk_level": level,
            "risk_score": weighted_score,
            "alert": alert_payload,
            "alert_policy": {
                "medium_score_min": CITIZEN_ALERT_MEDIUM_SCORE_MIN,
                "high_score_min": CITIZEN_ALERT_HIGH_SCORE_MIN,
                "medium_count_min": CITIZEN_ALERT_MEDIUM_COUNT_MIN,
                "high_count_min": CITIZEN_ALERT_HIGH_COUNT_MIN,
                "high_priority_near_min": CITIZEN_ALERT_HIGH_PRIORITY_NEAR_MIN,
                "cooldown_medium_min": CITIZEN_ALERT_COOLDOWN_MEDIUM_MIN,
                "cooldown_high_min": CITIZEN_ALERT_COOLDOWN_HIGH_MIN,
            },
        },
        "items": nearby_items,
    }


@router.get("/public/route-safety")
def get_public_route_safety_for_citizens(
    start_lat: float = Query(..., ge=-90, le=90),
    start_lng: float = Query(..., ge=-180, le=180),
    end_lat: float = Query(..., ge=-90, le=90),
    end_lng: float = Query(..., ge=-180, le=180),
    days: int = Query(default=30, ge=1, le=90),
    issue_type: str = Query(default="pothole"),
    corridor_km: float = Query(default=0.4, ge=0.1, le=2.0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    policy, _ = _get_hotspot_policy(db)
    _validate_hotspot_policy(policy)

    since = datetime.now(timezone.utc) - timedelta(days=days)
    min_lat = min(start_lat, end_lat) - 0.08
    max_lat = max(start_lat, end_lat) + 0.08
    min_lng = min(start_lng, end_lng) - 0.08
    max_lng = max(start_lng, end_lng) + 0.08

    query = (
        db.query(Report)
        .filter(Report.created_at >= since)
        .filter(Report.status.in_(("NEW", "IN_REVIEW", "IN_PROGRESS")))
        .filter(Report.latitude >= min_lat)
        .filter(Report.latitude <= max_lat)
        .filter(Report.longitude >= min_lng)
        .filter(Report.longitude <= max_lng)
    )
    issue_type_normalized = issue_type.strip().lower()
    if issue_type_normalized and issue_type_normalized != "all":
        query = query.filter(func.lower(Report.issue_type) == issue_type_normalized)
    reports = query.all()

    candidates = get_route_candidates(start_lat, start_lng, end_lat, end_lng)
    route_items = []
    for idx, candidate in enumerate(candidates, start=1):
        points = candidate["points"]
        if not points:
            continue

        total_score = 0.0
        near_count = 0
        high_count = 0
        critical_proximity = 0

        for report in reports:
            min_distance_km = min(
                haversine_distance(report.latitude, report.longitude, p_lat, p_lng)
                for p_lat, p_lng in points[:: max(1, len(points) // 50)]
            )
            if min_distance_km > corridor_km:
                continue

            near_count += 1
            if report.priority_label == "HIGH":
                high_count += 1
            if min_distance_km <= 0.15:
                critical_proximity += 1

            base_weight = 2.2 if report.priority_label == "HIGH" else 1.0
            total_score += base_weight / max(min_distance_km, 0.08)

        if critical_proximity >= 2 or total_score >= 40:
            risk_level = "HIGH"
        elif high_count >= 2 or total_score >= 18:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"

        route_items.append(
            {
                "rank": idx,
                "label": _to_route_label(idx),
                "source": candidate.get("source", "fallback"),
                "distance_km": round(float(candidate.get("distance_m", 0.0)) / 1000, 2),
                "duration_min": round(float(candidate.get("duration_s", 0.0)) / 60, 1),
                "risk_level": risk_level,
                "risk_score": round(total_score, 2),
                "near_count": near_count,
                "high_count": high_count,
                "maps_url": _to_maps_url(start_lat, start_lng, end_lat, end_lng),
            }
        )

    route_items.sort(key=lambda x: (x["risk_score"], x["high_count"], x["near_count"]))
    best = route_items[0] if route_items else None

    return {
        "meta": {
            "days": days,
            "issue_type": issue_type_normalized,
            "corridor_km": corridor_km,
            "candidate_count": len(route_items),
        },
        "best": best,
        "routes": route_items,
    }


@router.get("/public/hotspots/trend")
def get_public_hotspot_trend_for_citizens(
    days: int = Query(default=14, ge=7, le=60),
    issue_type: str = Query(default="pothole"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    since = datetime.now(timezone.utc) - timedelta(days=days - 1)
    query = (
        db.query(Report)
        .filter(Report.created_at >= since)
        .filter(Report.status.in_(("NEW", "IN_REVIEW", "IN_PROGRESS")))
    )

    issue_type_normalized = issue_type.strip().lower()
    if issue_type_normalized and issue_type_normalized != "all":
        query = query.filter(func.lower(Report.issue_type) == issue_type_normalized)

    rows = (
        query.with_entities(
            func.date(Report.created_at).label("day"),
            func.count(Report.id).label("incoming"),
            func.sum(case((Report.priority_label == "HIGH", 1), else_=0)).label("high_priority"),
        )
        .group_by(func.date(Report.created_at))
        .order_by(func.date(Report.created_at).asc())
        .all()
    )

    row_map = {
        str(r.day): {
            "incoming": int(r.incoming),
            "high_priority": int(r.high_priority or 0),
        }
        for r in rows
    }

    trend = []
    for i in range(days):
        day = (since + timedelta(days=i)).date().isoformat()
        metrics = row_map.get(day, {"incoming": 0, "high_priority": 0})
        trend.append(
            {
                "date": day,
                "incoming": metrics["incoming"],
                "high_priority": metrics["high_priority"],
            }
        )

    return {
        "meta": {
            "days": days,
            "issue_type": issue_type_normalized,
        },
        "trend": trend,
    }


@router.get("/metrics/hotspots/policy")
def get_hotspot_risk_policy(
    db: Session = Depends(get_db),
    _: User = Depends(require_operator_or_admin),
):
    policy, source = _get_hotspot_policy(db)
    _validate_hotspot_policy(policy)
    return {"policy": _serialize_hotspot_policy(policy, source=source)}


@router.patch("/metrics/hotspots/policy")
def update_hotspot_risk_policy(
    payload: HotspotRiskPolicyPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    policy = payload.model_dump()
    _validate_hotspot_policy(policy)

    row = db.query(HotspotRiskPolicy).order_by(HotspotRiskPolicy.id.desc()).first()
    if not row:
        row = HotspotRiskPolicy(**policy, updated_by_user_id=current_user.id)
        db.add(row)
    else:
        for key, value in policy.items():
            setattr(row, key, value)
        row.updated_by_user_id = current_user.id

    db.commit()
    db.refresh(row)

    final_policy, source = _get_hotspot_policy(db)
    return {
        "message": "Hotspot risk policy updated",
        "policy": _serialize_hotspot_policy(final_policy, source=source),
    }


@router.get("/metrics/hotspots")
def get_report_hotspots(
    days: int = Query(default=14, ge=1, le=180),
    status_filter: str | None = Query(default="OPEN", alias="status"),
    priority: str | None = Query(default=None),
    grid_size: float = Query(default=0.01, ge=0.001, le=0.1),
    db: Session = Depends(get_db),
    _: User = Depends(require_operator_or_admin),
):
    policy, policy_source = _get_hotspot_policy(db)
    _validate_hotspot_policy(policy)

    bucket_lat = _bucket_expr(Report.latitude, grid_size).label("bucket_lat")
    bucket_lng = _bucket_expr(Report.longitude, grid_size).label("bucket_lng")

    base_query = _apply_hotspot_filters(
        db.query(Report),
        days=days,
        status_filter=status_filter,
        priority=priority,
    )

    rows = (
        base_query.with_entities(
            bucket_lat,
            bucket_lng,
            func.count(Report.id).label("count"),
            func.sum(case((Report.priority_label == "HIGH", 1), else_=0)).label("high_count"),
            func.sum(
                case((Report.status.in_(("NEW", "IN_REVIEW", "IN_PROGRESS")), 1), else_=0)
            ).label("open_count"),
        )
        .group_by(bucket_lat, bucket_lng)
        .order_by(func.count(Report.id).desc())
        .all()
    )

    hotspots = []
    for row in rows:
        count = int(row.count)
        high_count = int(row.high_count or 0)
        open_count = int(row.open_count or 0)
        risk_level, risk_score = _classify_hotspot_risk(count, high_count, open_count, policy)
        hotspots.append(
            {
                "lat": float(row.bucket_lat),
                "lng": float(row.bucket_lng),
                "count": count,
                "high_count": high_count,
                "open_count": open_count,
                "risk_level": risk_level,
                "risk_score": risk_score,
            }
        )

    hotspots.sort(
        key=lambda item: (
            item["risk_score"],
            item["count"],
            item["high_count"],
            item["open_count"],
        ),
        reverse=True,
    )
    total_reports = int(base_query.count())
    return {
        "hotspots": hotspots,
        "meta": {
            "days": days,
            "grid_size": grid_size,
            "total_reports": total_reports,
            "total_hotspots": len(hotspots),
            "risk_policy": _serialize_hotspot_policy(policy, source=policy_source),
        },
    }


@router.get("/metrics/hotspots/reports")
def get_reports_by_hotspot_bucket(
    lat: float = Query(...),
    lng: float = Query(...),
    days: int = Query(default=14, ge=1, le=180),
    status_filter: str | None = Query(default="OPEN", alias="status"),
    priority: str | None = Query(default=None),
    grid_size: float = Query(default=0.01, ge=0.001, le=0.1),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_operator_or_admin),
):
    target_lat, target_lng = _bucket_center(lat, lng, grid_size)
    bucket_lat = _bucket_expr(Report.latitude, grid_size)
    bucket_lng = _bucket_expr(Report.longitude, grid_size)

    filtered_reports = _apply_hotspot_filters(
        db.query(Report),
        days=days,
        status_filter=status_filter,
        priority=priority,
    )
    items = (
        filtered_reports.filter(bucket_lat == target_lat)
        .filter(bucket_lng == target_lng)
        .order_by(Report.created_at.desc())
        .limit(limit)
        .all()
    )

    return {
        "reports": [_serialize_report(r) for r in items],
        "meta": {
            "lat": target_lat,
            "lng": target_lng,
            "grid_size": grid_size,
            "days": days,
            "count": len(items),
        },
    }


@router.get("/metrics/hotspots/areas")
def get_hotspot_segments_by_admin_area(
    days: int = Query(default=14, ge=1, le=180),
    status_filter: str | None = Query(default="OPEN", alias="status"),
    priority: str | None = Query(default=None),
    grid_size: float = Query(default=0.01, ge=0.001, le=0.1),
    db: Session = Depends(get_db),
    _: User = Depends(require_operator_or_admin),
):
    policy, policy_source = _get_hotspot_policy(db)
    _validate_hotspot_policy(policy)

    bucket_lat = _bucket_expr(Report.latitude, grid_size).label("bucket_lat")
    bucket_lng = _bucket_expr(Report.longitude, grid_size).label("bucket_lng")
    base_query = _apply_hotspot_filters(
        db.query(Report),
        days=days,
        status_filter=status_filter,
        priority=priority,
    )
    rows = (
        base_query.with_entities(
            bucket_lat,
            bucket_lng,
            func.count(Report.id).label("count"),
            func.sum(case((Report.priority_label == "HIGH", 1), else_=0)).label("high_count"),
            func.sum(
                case((Report.status.in_(("NEW", "IN_REVIEW", "IN_PROGRESS")), 1), else_=0)
            ).label("open_count"),
        )
        .group_by(bucket_lat, bucket_lng)
        .order_by(func.count(Report.id).desc())
        .all()
    )

    hotspots = []
    for row in rows:
        count = int(row.count)
        high_count = int(row.high_count or 0)
        open_count = int(row.open_count or 0)
        risk_level, risk_score = _classify_hotspot_risk(count, high_count, open_count, policy)
        hotspots.append(
            {
                "lat": float(row.bucket_lat),
                "lng": float(row.bucket_lng),
                "count": count,
                "high_count": high_count,
                "open_count": open_count,
                "risk_level": risk_level,
                "risk_score": risk_score,
            }
        )

    segments = _aggregate_hotspots_by_admin_area(hotspots, policy)
    return {
        "areas": segments,
        "meta": {
            "days": days,
            "grid_size": grid_size,
            "total_areas": len(segments),
            "risk_policy": _serialize_hotspot_policy(policy, source=policy_source),
        },
    }


@router.get("/metrics/export.csv")
def export_report_analytics_csv(
    db: Session = Depends(get_db),
    _: User = Depends(require_operator_or_admin),
):
    metrics = _build_metrics_payload(db)

    output = StringIO()
    writer = csv.writer(output)

    writer.writerow(["section", "key", "value"])
    writer.writerow(["summary", "total_reports", metrics["summary"]["total_reports"]])

    for key, value in metrics["summary"]["status_counts"].items():
        writer.writerow(["status_counts", key, value])
    for key, value in metrics["summary"]["priority_counts"].items():
        writer.writerow(["priority_counts", key, value])
    writer.writerow(["advanced", "mttr_hours", metrics["advanced"]["mttr_hours"]])
    writer.writerow(["advanced", "sla_breached_high", metrics["advanced"]["sla_breached_high"]])
    writer.writerow(["advanced", "aging_backlog_over_7d", metrics["advanced"]["aging_backlog_over_7d"]])
    writer.writerow(["advanced", "resolution_rate_14d", metrics["advanced"]["resolution_rate_14d"]])

    writer.writerow([])
    writer.writerow(["top_issue_types", "issue_type", "count"])
    for row in metrics["advanced"]["top_issue_types"]:
        writer.writerow(["top_issue_types", row["issue_type"], row["count"]])

    writer.writerow([])
    writer.writerow(["trend_14d", "date", "incoming", "resolved"])
    for row in metrics["trend_14d"]:
        writer.writerow(["trend_14d", row["date"], row["incoming"], row["resolved"]])

    writer.writerow([])
    writer.writerow(["reports", "id", "status", "priority", "urgency_score", "created_at", "resolved_at"])
    reports = db.query(Report).order_by(Report.created_at.desc()).all()
    for r in reports:
        writer.writerow([
            "report",
            r.id,
            r.status,
            r.priority_label,
            r.urgency_score,
            r.created_at.isoformat() if r.created_at else "",
            r.resolved_at.isoformat() if r.resolved_at else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=report_analytics.csv"},
    )
