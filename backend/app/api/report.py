from __future__ import annotations

import os
import uuid
import csv
from io import StringIO
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import String, cast, func, or_
from sqlalchemy.orm import Session

from app.config import MAX_FILE_SIZE_MB, REPORT_RATE_LIMIT_PER_MINUTE, UPLOAD_DIR
from app.core.database import get_db
from app.dependencies.auth import get_current_user, require_operator_or_admin
from app.models.report_model import Report
from app.models.report_audit_log import ReportAuditLog
from app.models.notification_model import Notification
from app.models.user_model import User
from app.services.cv_service import classify_image
from app.services.response_service import generate_response
from app.services.urgency_service import calculate_urgency
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


def _to_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


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


@router.get("/metrics/hotspots")
def get_report_hotspots(
    days: int = Query(default=14, ge=1, le=180),
    status_filter: str | None = Query(default="OPEN", alias="status"),
    priority: str | None = Query(default=None),
    grid_size: float = Query(default=0.01, ge=0.001, le=0.1),
    db: Session = Depends(get_db),
    _: User = Depends(require_operator_or_admin),
):
    query = db.query(Report)

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

    reports = query.all()
    buckets: dict[tuple[float, float], dict] = {}

    for r in reports:
        lat = round(round(r.latitude / grid_size) * grid_size, 6)
        lng = round(round(r.longitude / grid_size) * grid_size, 6)
        key = (lat, lng)
        if key not in buckets:
            buckets[key] = {
                "lat": lat,
                "lng": lng,
                "count": 0,
                "high_count": 0,
                "open_count": 0,
            }
        buckets[key]["count"] += 1
        if r.priority_label == "HIGH":
            buckets[key]["high_count"] += 1
        if r.status in ("NEW", "IN_REVIEW", "IN_PROGRESS"):
            buckets[key]["open_count"] += 1

    hotspots = sorted(buckets.values(), key=lambda item: item["count"], reverse=True)
    return {
        "hotspots": hotspots,
        "meta": {
            "days": days,
            "grid_size": grid_size,
            "total_reports": len(reports),
            "total_hotspots": len(hotspots),
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
