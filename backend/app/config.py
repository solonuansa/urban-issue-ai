import os
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = BASE_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent
load_dotenv(BACKEND_DIR / ".env")


def _resolve_int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default

# Application settings
APP_NAME = "AI Civic Issue Reporting"
DEBUG = True

# Database
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{(BACKEND_DIR / 'civic_reports.db').as_posix()}")

# File upload
UPLOAD_DIR = os.getenv("UPLOAD_DIR", str((BACKEND_DIR / "uploads").resolve()))
MAX_FILE_SIZE_MB = _resolve_int_env("MAX_FILE_SIZE_MB", 5)

# AI model
MODEL_PATH = os.getenv("MODEL_PATH", str((PROJECT_ROOT / "ai" / "cv_model" / "weights" / "model.pt").resolve()))

# API
BACKEND_CORS_ORIGINS = os.getenv("BACKEND_CORS_ORIGINS", "*")

# Urgency score weights
WEIGHT_SEVERITY = 0.5
WEIGHT_LOCATION = 0.3
WEIGHT_REPEAT = 0.2

# Priority thresholds
PRIORITY_LOW_MAX = 40
PRIORITY_MEDIUM_MAX = 70
