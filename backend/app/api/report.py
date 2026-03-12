from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import MAX_FILE_SIZE_MB, REPORT_RATE_LIMIT_PER_MINUTE, UPLOAD_DIR
from app.core.database import get_db
from app.dependencies.auth import get_current_user, require_operator_or_admin
from app.models.report_model import Report
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

    reports = query.order_by(Report.created_at.desc()).all()
    return {"reports": [_serialize_report(r) for r in reports]}


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

    report.status = status_upper
    report.updated_at = datetime.now(timezone.utc)

    if status_upper == "RESOLVED":
        report.resolved_at = datetime.now(timezone.utc)
        report.resolution_note = resolution_note.strip() or report.resolution_note
    elif status_upper == "REJECTED":
        report.resolution_note = resolution_note.strip() or "Rejected by operations team"

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


@router.get("/metrics/summary")
def get_report_analytics(
    db: Session = Depends(get_db),
    _: User = Depends(require_operator_or_admin),
):
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
    }
