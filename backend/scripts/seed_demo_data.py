from __future__ import annotations

import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.database import SessionLocal, init_db
from app.models.report_model import Report
from app.models.user_model import User


DEMO_MARKER = "[DEMO]"


def pick_priority(severity: str) -> tuple[float, str]:
    if severity == "large":
        return random.uniform(75, 95), "HIGH"
    if severity == "medium":
        return random.uniform(45, 74), "MEDIUM"
    return random.uniform(15, 44), "LOW"


def main() -> None:
    random.seed(42)
    init_db()
    db = SessionLocal()
    try:
        demo_user = (
            db.query(User)
            .filter(User.email == "citizen.demo@urban-issue.ai")
            .first()
        )
        created_by_user_id = demo_user.id if demo_user else None

        # Clear previous demo reports so seeding remains repeatable.
        db.query(Report).filter(Report.auto_response.like(f"{DEMO_MARKER}%")).delete()
        db.commit()

        now = datetime.now(timezone.utc)
        clusters = [
            # Heavy pothole zones
            {"lat": -6.205, "lng": 106.820, "issue_type": "pothole", "count": 18},
            {"lat": -6.192, "lng": 106.845, "issue_type": "pothole", "count": 14},
            {"lat": -6.240, "lng": 106.798, "issue_type": "pothole", "count": 12},
            # Mixed zones
            {"lat": -6.225, "lng": 106.860, "issue_type": "garbage", "count": 8},
            {"lat": -6.175, "lng": 106.815, "issue_type": "pothole", "count": 9},
        ]

        created = 0
        for cluster in clusters:
            for _ in range(cluster["count"]):
                severity = random.choices(
                    ["small", "medium", "large"],
                    weights=[0.35, 0.45, 0.20],
                    k=1,
                )[0]
                urgency_score, priority_label = pick_priority(severity)
                age_days = random.uniform(0, 20)
                created_at = now - timedelta(days=age_days, hours=random.uniform(0, 23))
                status = random.choices(
                    ["NEW", "IN_REVIEW", "IN_PROGRESS", "RESOLVED"],
                    weights=[0.35, 0.25, 0.25, 0.15],
                    k=1,
                )[0]
                resolved_at = None
                resolution_note = None
                if status == "RESOLVED":
                    resolved_at = created_at + timedelta(hours=random.uniform(4, 120))
                    resolution_note = f"{DEMO_MARKER} resolved by operations."

                report = Report(
                    issue_type=cluster["issue_type"],
                    severity_level=severity,
                    urgency_score=round(urgency_score, 2),
                    priority_label=priority_label,
                    latitude=round(cluster["lat"] + random.uniform(-0.004, 0.004), 6),
                    longitude=round(cluster["lng"] + random.uniform(-0.004, 0.004), 6),
                    image_url=None,
                    auto_response=f"{DEMO_MARKER} seeded report for hotspot testing.",
                    status=status,
                    created_by_user_id=created_by_user_id,
                    resolution_note=resolution_note,
                    resolved_at=resolved_at,
                    created_at=created_at,
                    updated_at=now,
                )
                db.add(report)
                created += 1

        db.commit()
        print(f"Seed completed. Inserted {created} demo reports.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
