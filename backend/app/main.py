from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import report
from app.core.database import init_db

app = FastAPI(
    title="AI Civic Issue Reporting API",
    description="MVP for classifying and prioritizing civic issues",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(report.router, prefix="/api/reports", tags=["Reports"])


@app.on_event("startup")
async def startup():
    init_db()


@app.get("/")
def root():
    return {"message": "AI Civic Issue Reporting API is running"}
