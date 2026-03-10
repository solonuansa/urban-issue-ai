"""
Urgency Service – calculates urgency score and priority label.

Formula:
    Urgency Score = (Severity × 0.5) + (Location Importance × 0.3) + (Repeat Reports × 0.2)

Priority:
    0–40   → Low
    41–70  → Medium
    71–100 → High
"""

from app.config import WEIGHT_SEVERITY, WEIGHT_LOCATION, WEIGHT_REPEAT

SEVERITY_SCORE = {
    "small": 30,
    "medium": 60,
    "large": 100,
}


def calculate_urgency(
    severity: str,
    location_importance: int,
    repeat_count: int,
) -> dict:
    """
    Calculate urgency score and assign a priority label.

    Args:
        severity: "small" | "medium" | "large"
        location_importance: score 1–100 (e.g. main road = 100)
        repeat_count: number of duplicate reports (0 = no repeat)

    Returns:
        { "urgency_score": float, "priority_label": str }
    """
    severity_val = SEVERITY_SCORE.get(severity, 30)
    repeat_val = min(repeat_count * 20, 100)  # cap at 100

    score = (
        severity_val * WEIGHT_SEVERITY
        + location_importance * WEIGHT_LOCATION
        + repeat_val * WEIGHT_REPEAT
    )

    if score <= 40:
        label = "LOW"
    elif score <= 70:
        label = "MEDIUM"
    else:
        label = "HIGH"

    return {"urgency_score": round(score, 2), "priority_label": label}
