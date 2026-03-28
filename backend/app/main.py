import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.api import auth, dashboard_view, notification, report
from app.config import BACKEND_CORS_ORIGINS, JSON_ACCESS_LOG, LOG_LEVEL, UPLOAD_DIR
from app.core.database import SessionLocal, init_db
from app.core.observability import configure_logging, log_access_event
from app.services.seed_service import ensure_demo_accounts

app = FastAPI(
    title="AI Civic Issue Reporting API",
    description="MVP for classifying and prioritizing civic issues",
    version="1.0.0",
)

configure_logging(LOG_LEVEL)
logger = logging.getLogger("urban_issue_api")

raw_origins = [origin.strip() for origin in BACKEND_CORS_ORIGINS.split(",") if origin.strip()]
allow_origins = raw_origins if raw_origins else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_observability_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    request.state.request_id = request_id
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("Unhandled exception for request_id=%s path=%s", request_id, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "request_id": request_id},
            headers={"X-Request-ID": request_id},
        )

    duration_ms = (time.perf_counter() - started) * 1000
    response.headers["X-Request-ID"] = request_id
    if JSON_ACCESS_LOG:
        client_ip = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("user-agent", "unknown")
        log_access_event(
            logger=logger,
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
            client_ip=client_ip,
            user_agent=user_agent,
        )
    return response


# Include routers
app.include_router(report.router, prefix="/api/reports", tags=["Reports"])
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(notification.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(dashboard_view.router, prefix="/api/dashboard-views", tags=["Dashboard Views"])


@app.on_event("startup")
async def startup():
    # Ensure startup is idempotent for local/dev and container restarts.
    from os import makedirs

    makedirs(UPLOAD_DIR, exist_ok=True)
    init_db()
    db = SessionLocal()
    try:
        ensure_demo_accounts(db)
    finally:
        db.close()


app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/")
def root():
    return {"message": "AI Civic Issue Reporting API is running"}


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/readyz")
def readyz():
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ready", "database": "ok"}
    except Exception as exc:
        logger.exception("Readiness check failed: %s", exc)
        return JSONResponse(status_code=503, content={"status": "not_ready", "database": "error"})
    finally:
        db.close()
