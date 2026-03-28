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


def _resolve_float_env(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _resolve_bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _resolve_str_env(name: str, default: str) -> str:
    raw = os.getenv(name)
    if raw is None:
        return default
    val = raw.strip()
    return val if val else default


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
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-only-change-me")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = _resolve_int_env("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", 120)
LOGIN_RATE_LIMIT_PER_MINUTE = _resolve_int_env("LOGIN_RATE_LIMIT_PER_MINUTE", 10)
REPORT_RATE_LIMIT_PER_MINUTE = _resolve_int_env("REPORT_RATE_LIMIT_PER_MINUTE", 20)
LOG_LEVEL = _resolve_str_env("LOG_LEVEL", "INFO").upper()
JSON_ACCESS_LOG = _resolve_bool_env("JSON_ACCESS_LOG", True)

# Urgency score weights
WEIGHT_SEVERITY = 0.5
WEIGHT_LOCATION = 0.3
WEIGHT_REPEAT = 0.2

# Priority thresholds
PRIORITY_LOW_MAX = 40
PRIORITY_MEDIUM_MAX = 70

# Hotspot risk policy (configurable via env)
HOTSPOT_RISK_WEIGHT_TOTAL = _resolve_float_env("HOTSPOT_RISK_WEIGHT_TOTAL", 1.0)
HOTSPOT_RISK_WEIGHT_HIGH = _resolve_float_env("HOTSPOT_RISK_WEIGHT_HIGH", 1.8)
HOTSPOT_RISK_WEIGHT_OPEN = _resolve_float_env("HOTSPOT_RISK_WEIGHT_OPEN", 1.2)

HOTSPOT_RISK_MEDIUM_SCORE_MIN = _resolve_float_env("HOTSPOT_RISK_MEDIUM_SCORE_MIN", 8.0)
HOTSPOT_RISK_HIGH_SCORE_MIN = _resolve_float_env("HOTSPOT_RISK_HIGH_SCORE_MIN", 16.0)
HOTSPOT_RISK_CRITICAL_SCORE_MIN = _resolve_float_env("HOTSPOT_RISK_CRITICAL_SCORE_MIN", 28.0)

HOTSPOT_RISK_MEDIUM_COUNT_MIN = _resolve_int_env("HOTSPOT_RISK_MEDIUM_COUNT_MIN", 4)
HOTSPOT_RISK_HIGH_COUNT_MIN = _resolve_int_env("HOTSPOT_RISK_HIGH_COUNT_MIN", 8)
HOTSPOT_RISK_CRITICAL_COUNT_MIN = _resolve_int_env("HOTSPOT_RISK_CRITICAL_COUNT_MIN", 12)
HOTSPOT_RISK_CRITICAL_HIGH_COUNT_MIN = _resolve_int_env("HOTSPOT_RISK_CRITICAL_HIGH_COUNT_MIN", 3)

# Demo accounts (for local/testing)
DEMO_ACCOUNTS_ENABLED = _resolve_bool_env("DEMO_ACCOUNTS_ENABLED", True)
DEMO_ACCOUNT_PASSWORD = os.getenv("DEMO_ACCOUNT_PASSWORD", "Demo12345!")
DEMO_CITIZEN_EMAIL = os.getenv("DEMO_CITIZEN_EMAIL", "citizen.demo@urban-issue.ai")
DEMO_OPERATOR_EMAIL = os.getenv("DEMO_OPERATOR_EMAIL", "operator.demo@urban-issue.ai")
DEMO_ADMIN_EMAIL = os.getenv("DEMO_ADMIN_EMAIL", "admin.demo@urban-issue.ai")

# External notifications (optional)
EXTERNAL_ALERTS_ENABLED = _resolve_bool_env("EXTERNAL_ALERTS_ENABLED", False)
EXTERNAL_ALERT_RECIPIENTS = os.getenv("EXTERNAL_ALERT_RECIPIENTS", "")
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = _resolve_int_env("SMTP_PORT", 587)
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "noreply@urban-issue.ai")
SMTP_USE_TLS = _resolve_bool_env("SMTP_USE_TLS", True)

# Route quality upgrade (optional external routing engine)
ROUTING_ENGINE = os.getenv("ROUTING_ENGINE", "osrm").strip().lower()
OSRM_BASE_URL = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org")
ROUTING_TIMEOUT_SECONDS = _resolve_int_env("ROUTING_TIMEOUT_SECONDS", 8)

# Citizen alert policy
CITIZEN_ALERT_MEDIUM_SCORE_MIN = _resolve_float_env("CITIZEN_ALERT_MEDIUM_SCORE_MIN", 35.0)
CITIZEN_ALERT_HIGH_SCORE_MIN = _resolve_float_env("CITIZEN_ALERT_HIGH_SCORE_MIN", 70.0)
CITIZEN_ALERT_MEDIUM_COUNT_MIN = _resolve_int_env("CITIZEN_ALERT_MEDIUM_COUNT_MIN", 4)
CITIZEN_ALERT_HIGH_COUNT_MIN = _resolve_int_env("CITIZEN_ALERT_HIGH_COUNT_MIN", 6)
CITIZEN_ALERT_HIGH_PRIORITY_NEAR_MIN = _resolve_int_env("CITIZEN_ALERT_HIGH_PRIORITY_NEAR_MIN", 1)
CITIZEN_ALERT_COOLDOWN_MEDIUM_MIN = _resolve_int_env("CITIZEN_ALERT_COOLDOWN_MEDIUM_MIN", 90)
CITIZEN_ALERT_COOLDOWN_HIGH_MIN = _resolve_int_env("CITIZEN_ALERT_COOLDOWN_HIGH_MIN", 30)
