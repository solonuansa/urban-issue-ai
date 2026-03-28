"""
Report Model – defines the database table schema for reports.
"""

from sqlalchemy import Column, DateTime, Float, Index, Integer, String
from sqlalchemy.sql import func
from app.core.database import Base


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        Index("ix_reports_created_at", "created_at"),
        Index("ix_reports_status", "status"),
        Index("ix_reports_issue_type", "issue_type"),
        Index("ix_reports_priority_label", "priority_label"),
        Index("ix_reports_lat_lng", "latitude", "longitude"),
    )

    id = Column(Integer, primary_key=True, index=True)
    issue_type = Column(String, nullable=False)        # pothole | garbage
    severity_level = Column(String, nullable=False)    # small | medium | large
    urgency_score = Column(Float, nullable=False)
    priority_label = Column(String, nullable=False)    # LOW | MEDIUM | HIGH
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    image_url = Column(String, nullable=True)
    auto_response = Column(String, nullable=True)
    created_by_user_id = Column(Integer, nullable=True)
    status = Column(String, nullable=False, default="NEW")  # NEW | IN_REVIEW | IN_PROGRESS | RESOLVED | REJECTED
    assigned_to_user_id = Column(Integer, nullable=True)
    resolution_note = Column(String, nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
