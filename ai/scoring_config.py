"""
Scoring Configuration – centralised weights and mappings for the urgency model.
"""

# ─── Formula Weights ──────────────────────────────────────────────────────────
WEIGHT_SEVERITY = 0.5
WEIGHT_LOCATION = 0.3
WEIGHT_REPEAT = 0.2

# ─── Severity → Numeric Score Mapping ────────────────────────────────────────
SEVERITY_SCORE_MAP = {
    "small": 30,
    "medium": 60,
    "large": 100,
}

# ─── Location Importance Categories ──────────────────────────────────────────
# Used when automatic geo-scoring is not available
LOCATION_CATEGORY_MAP = {
    "main_road": 100,
    "secondary_road": 70,
    "residential": 40,
    "alley": 20,
}

# ─── Priority Thresholds ──────────────────────────────────────────────────────
PRIORITY_THRESHOLDS = {
    "LOW": (0, 40),
    "MEDIUM": (41, 70),
    "HIGH": (71, 100),
}
