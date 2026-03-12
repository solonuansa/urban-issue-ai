import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import MAX_FILE_SIZE_MB, UPLOAD_DIR
from app.core.database import get_db
from app.models.report_model import Report
from app.services.cv_service import classify_image
from app.services.response_service import generate_response
from app.services.urgency_service import calculate_urgency
from app.utils.geo_utils import haversine_distance

router = APIRouter()

os.makedirs(UPLOAD_DIR, exist_ok=True)
UPLOAD_ROOT = Path(UPLOAD_DIR)
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}


@router.post("/submit")
async def submit_report(
    image: UploadFile = File(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    location_importance: int = Form(..., ge=1, le=100),
    db: Session = Depends(get_db),
):
    """
    Submit a new civic issue report.
    - Classifies the image
    - Calculates urgency score
    - Generates an auto response
    - Saves report to database
    """
    # 1. Validate and save image to disk
    content_type = image.content_type or ""
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported image type. Use JPG, PNG, or WEBP.",
        )

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

    # 2. Classify image via CV service
    cv_result = classify_image(str(file_path))

    # 3. Count nearby repeat reports (within 500 m, same issue type)
    nearby = db.query(Report).filter(Report.issue_type == cv_result["issue_type"]).all()
    repeat_count = sum(
        1
        for r in nearby
        if haversine_distance(latitude, longitude, r.latitude, r.longitude) < 0.5
    )

    # 4. Calculate urgency score
    urgency = calculate_urgency(cv_result["severity"], location_importance, repeat_count)

    # 5. Generate auto response
    auto_response = generate_response(
        cv_result["issue_type"], cv_result["severity"], urgency["priority_label"]
    )

    image_public_url = f"/uploads/{filename}"

    # 6. Persist to database
    report = Report(
        issue_type=cv_result["issue_type"],
        severity_level=cv_result["severity"],
        urgency_score=urgency["urgency_score"],
        priority_label=urgency["priority_label"],
        latitude=latitude,
        longitude=longitude,
        image_url=image_public_url,
        auto_response=auto_response,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return {
        "message": "Report submitted successfully",
        "data": {
            "id": report.id,
            "issue_type": report.issue_type,
            "severity_level": report.severity_level,
            "urgency_score": report.urgency_score,
            "priority_label": report.priority_label,
            "latitude": report.latitude,
            "longitude": report.longitude,
            "image_url": report.image_url,
            "auto_response": report.auto_response,
            "created_at": report.created_at,
            "cv_confidence": cv_result.get("confidence", 0.0),
        },
    }


@router.get("/")
def get_reports(
    priority: str | None = None,
    db: Session = Depends(get_db),
):
    """Get all reports, optionally filtered by priority label."""
    query = db.query(Report)
    if priority:
        priority_upper = priority.upper()
        if priority_upper not in ("HIGH", "MEDIUM", "LOW"):
            raise HTTPException(status_code=400, detail="priority must be HIGH, MEDIUM, or LOW")
        query = query.filter(Report.priority_label == priority_upper)
    reports = query.order_by(Report.created_at.desc()).all()
    return {
        "reports": [
            {
                "id": r.id,
                "issue_type": r.issue_type,
                "severity_level": r.severity_level,
                "urgency_score": r.urgency_score,
                "priority_label": r.priority_label,
                "latitude": r.latitude,
                "longitude": r.longitude,
                "image_url": r.image_url,
                "auto_response": r.auto_response,
                "created_at": r.created_at,
            }
            for r in reports
        ]
    }


@router.get("/{report_id}")
def get_report(report_id: int, db: Session = Depends(get_db)):
    """Get a single report by ID."""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return {
        "report": {
            "id": report.id,
            "issue_type": report.issue_type,
            "severity_level": report.severity_level,
            "urgency_score": report.urgency_score,
            "priority_label": report.priority_label,
            "latitude": report.latitude,
            "longitude": report.longitude,
            "image_url": report.image_url,
            "auto_response": report.auto_response,
            "created_at": report.created_at,
        }
    }
