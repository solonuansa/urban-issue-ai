"""
CV Service – classifies an image and returns issue type + severity.

MVP Strategy:
  - If model weights exist → use YOLO/torch inference via ai/cv_model/inference.py
  - Otherwise → use a rule-based heuristic from image metadata as a placeholder
    so the rest of the pipeline (scoring, response, DB) can be tested end-to-end.
"""

import os

from app.config import MODEL_PATH


def classify_image(image_path: str) -> dict:
    """
    Classify the given image.

    Returns:
        {
            "issue_type": "pothole" | "garbage",
            "severity": "small" | "medium" | "large",
            "confidence": float
        }
    """
    # Use real model if weights are available
    if os.path.exists(MODEL_PATH):
        from ai.cv_model.inference import run_inference
        return run_inference(image_path, MODEL_PATH)

    # ── MVP Placeholder ──────────────────────────────────────────────────────
    # Derive a deterministic-but-varied mock result from the image file size so
    # that different uploads produce different labels (useful for testing).
    try:
        file_size = os.path.getsize(image_path)
    except OSError:
        file_size = 0

    issue_types = ["pothole", "garbage"]
    severity_levels = ["small", "medium", "large"]

    issue_type = issue_types[file_size % 2]
    severity = severity_levels[file_size % 3]
    confidence = round(0.55 + (file_size % 40) / 100, 2)  # 0.55 – 0.94

    return {
        "issue_type": issue_type,
        "severity": severity,
        "confidence": confidence,
    }
