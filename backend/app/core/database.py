"""
Database setup using SQLAlchemy.
"""

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import DATABASE_URL

engine_kwargs = {}

# SQLite needs check_same_thread disabled for FastAPI threaded usage.
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def init_db() -> None:
    """Create all tables and run lightweight compatibility migrations."""
    from app import models  # noqa: F401 - registers models

    Base.metadata.create_all(bind=engine)
    _run_lightweight_migrations()


def _run_lightweight_migrations() -> None:
    """
    Add newly introduced columns for installations without Alembic yet.
    Safe for repeated startup calls.
    """
    inspector = inspect(engine)
    if "reports" not in inspector.get_table_names():
        return

    existing_columns = {col["name"] for col in inspector.get_columns("reports")}
    statements = []

    if "status" not in existing_columns:
        statements.append("ALTER TABLE reports ADD COLUMN status VARCHAR DEFAULT 'NEW'")
    if "created_by_user_id" not in existing_columns:
        statements.append("ALTER TABLE reports ADD COLUMN created_by_user_id INTEGER")
    if "assigned_to_user_id" not in existing_columns:
        statements.append("ALTER TABLE reports ADD COLUMN assigned_to_user_id INTEGER")
    if "resolution_note" not in existing_columns:
        statements.append("ALTER TABLE reports ADD COLUMN resolution_note VARCHAR")
    if "resolved_at" not in existing_columns:
        statements.append("ALTER TABLE reports ADD COLUMN resolved_at TIMESTAMP")
    if "updated_at" not in existing_columns:
        statements.append("ALTER TABLE reports ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")

    if not statements:
        return

    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def get_db():
    """Dependency: yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
