from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import get_current_user
from app.models.notification_model import Notification
from app.models.user_model import User

router = APIRouter()


def _serialize_notification(n: Notification) -> dict:
    return {
        "id": n.id,
        "user_id": n.user_id,
        "title": n.title,
        "body": n.body,
        "type": n.type,
        "related_report_id": n.related_report_id,
        "is_read": n.is_read,
        "created_at": n.created_at,
    }


@router.get("/")
def list_notifications(
    unread_only: bool = Query(default=False),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        query = query.filter(Notification.is_read.is_(False))

    items = query.order_by(Notification.created_at.desc()).limit(limit).all()
    unread_count = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .filter(Notification.is_read.is_(False))
        .count()
    )
    return {
        "notifications": [_serialize_notification(n) for n in items],
        "unread_count": unread_count,
    }


@router.patch("/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification = (
        db.query(Notification)
        .filter(Notification.id == notification_id)
        .filter(Notification.user_id == current_user.id)
        .first()
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.is_read = True
    db.commit()
    db.refresh(notification)
    return {"notification": _serialize_notification(notification)}


@router.patch("/read-all")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .filter(Notification.is_read.is_(False))
        .all()
    )
    for item in items:
        item.is_read = True
    db.commit()
    return {"message": "All notifications marked as read", "updated_count": len(items)}
