"""
Report Model – defines the database table schema for reports.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    issue_type = Column(String, nullable=False)        # pothole | garbage
    severity_level = Column(String, nullable=False)    # small | medium | large
    urgency_score = Column(Float, nullable=False)
    priority_label = Column(String, nullable=False)    # LOW | MEDIUM | HIGH
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    image_url = Column(String, nullable=True)
    auto_response = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
