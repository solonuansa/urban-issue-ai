import os

# Application settings
APP_NAME = "AI Civic Issue Reporting"
DEBUG = True

# Database
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./civic_reports.db")

# File upload
UPLOAD_DIR = "uploads"
MAX_FILE_SIZE_MB = 5

# AI model
MODEL_PATH = "ai/cv_model/weights/model.pt"

# Urgency score weights
WEIGHT_SEVERITY = 0.5
WEIGHT_LOCATION = 0.3
WEIGHT_REPEAT = 0.2

# Priority thresholds
PRIORITY_LOW_MAX = 40
PRIORITY_MEDIUM_MAX = 70
