"""
Audit log model for report workflow changes.
"""

from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.sql import func

from app.core.database import Base


class ReportAuditLog(Base):
    __tablename__ = "report_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, nullable=False, index=True)
    previous_status = Column(String, nullable=True)
    new_status = Column(String, nullable=True)
    changed_by_user_id = Column(Integer, nullable=False)
    assigned_to_user_id = Column(Integer, nullable=True)
    note = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
