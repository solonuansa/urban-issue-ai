from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import auth, report
from app.config import BACKEND_CORS_ORIGINS, UPLOAD_DIR
from app.core.database import init_db

app = FastAPI(
    title="AI Civic Issue Reporting API",
    description="MVP for classifying and prioritizing civic issues",
    version="1.0.0",
)

raw_origins = [origin.strip() for origin in BACKEND_CORS_ORIGINS.split(",") if origin.strip()]
allow_origins = raw_origins if raw_origins else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(report.router, prefix="/api/reports", tags=["Reports"])
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])


@app.on_event("startup")
async def startup():
    # Ensure startup is idempotent for local/dev and container restarts.
    from os import makedirs

    makedirs(UPLOAD_DIR, exist_ok=True)
    init_db()


app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/")
def root():
    return {"message": "AI Civic Issue Reporting API is running"}
