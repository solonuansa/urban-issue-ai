from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Form, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_operator_or_admin
from app.models.dashboard_view_model import DashboardView
from app.models.user_model import User

router = APIRouter()


def _serialize_view(item: DashboardView) -> dict:
    try:
        payload = json.loads(item.payload_json)
    except json.JSONDecodeError:
        payload = {}
    return {
        "id": item.id,
        "name": item.name,
        "payload": payload,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


@router.get("/")
def list_saved_views(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    items = (
        db.query(DashboardView)
        .filter(DashboardView.user_id == current_user.id)
        .order_by(DashboardView.updated_at.desc(), DashboardView.id.desc())
        .all()
    )
    return {"views": [_serialize_view(item) for item in items]}


@router.post("/")
def create_saved_view(
    name: str = Form(..., min_length=2, max_length=80),
    payload_json: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    clean_name = name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="name is required")

    try:
        parsed = json.loads(payload_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="payload_json must be valid JSON") from exc

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="payload_json must be an object")

    required_keys = {"priority", "status", "search", "hotspot_days", "hotspot_mode", "hotspot_risk"}
    if not required_keys.issubset(set(parsed.keys())):
        raise HTTPException(
            status_code=400,
            detail=(
                "payload_json must include keys: "
                "priority, status, search, hotspot_days, hotspot_mode, hotspot_risk"
            ),
        )

    current_count = db.query(DashboardView).filter(DashboardView.user_id == current_user.id).count()
    if current_count >= 12:
        raise HTTPException(status_code=400, detail="Maximum 12 saved views per user")

    item = DashboardView(
        user_id=current_user.id,
        name=clean_name,
        payload_json=json.dumps(parsed),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"message": "Saved view created", "view": _serialize_view(item)}


@router.delete("/{view_id}")
def delete_saved_view(
    view_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    item = (
        db.query(DashboardView)
        .filter(DashboardView.id == view_id)
        .filter(DashboardView.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Saved view not found")
    db.delete(item)
    db.commit()
    return {"message": "Saved view deleted"}
