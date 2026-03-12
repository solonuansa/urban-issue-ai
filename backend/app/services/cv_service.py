"""
CV service for issue classification.

Strategy:
1. If model weights and inference module are available, run real inference.
2. Otherwise, return a deterministic mock result for MVP flow testing.
"""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path
from typing import Any

from app.config import MODEL_PATH, PROJECT_ROOT


def _load_inference_runner() -> Any | None:
    inference_file = PROJECT_ROOT / "ai" / "cv_model" / "inference.py"
    if not inference_file.exists():
        return None

    spec = importlib.util.spec_from_file_location("urban_issue_ai_inference", inference_file)
    if spec is None or spec.loader is None:
        return None

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return getattr(module, "run_inference", None)


def classify_image(image_path: str) -> dict:
    """
    Returns:
        {
            "issue_type": "pothole" | "garbage",
            "severity": "small" | "medium" | "large",
            "confidence": float
        }
    """
    model_path = Path(MODEL_PATH)
    run_inference = _load_inference_runner()
    if run_inference and model_path.exists():
        return run_inference(image_path, str(model_path))

    # Deterministic mock output based on file size for end-to-end testing.
    try:
        file_size = os.path.getsize(image_path)
    except OSError:
        file_size = 0

    issue_types = ["pothole", "garbage"]
    severity_levels = ["small", "medium", "large"]

    issue_type = issue_types[file_size % 2]
    severity = severity_levels[file_size % 3]
    confidence = round(0.55 + (file_size % 40) / 100, 2)

    return {
        "issue_type": issue_type,
        "severity": severity,
        "confidence": confidence,
    }
