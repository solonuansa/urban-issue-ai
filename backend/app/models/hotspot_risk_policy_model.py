from sqlalchemy import Column, DateTime, Float, Integer
from sqlalchemy.sql import func

from app.core.database import Base


class HotspotRiskPolicy(Base):
    __tablename__ = "hotspot_risk_policy"

    id = Column(Integer, primary_key=True, index=True)

    weight_total = Column(Float, nullable=False)
    weight_high = Column(Float, nullable=False)
    weight_open = Column(Float, nullable=False)

    medium_score_min = Column(Float, nullable=False)
    high_score_min = Column(Float, nullable=False)
    critical_score_min = Column(Float, nullable=False)

    medium_count_min = Column(Integer, nullable=False)
    high_count_min = Column(Integer, nullable=False)
    critical_count_min = Column(Integer, nullable=False)
    critical_high_count_min = Column(Integer, nullable=False)

    updated_by_user_id = Column(Integer, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
