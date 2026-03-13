from sqlalchemy.orm import Session

from app.config import (
    DEMO_ACCOUNT_PASSWORD,
    DEMO_ACCOUNTS_ENABLED,
    DEMO_ADMIN_EMAIL,
    DEMO_CITIZEN_EMAIL,
    DEMO_OPERATOR_EMAIL,
)
from app.models.user_model import User
from app.services.auth_service import hash_password


def ensure_demo_accounts(db: Session) -> None:
    if not DEMO_ACCOUNTS_ENABLED:
        return

    demo_users = [
        ("Demo Citizen", DEMO_CITIZEN_EMAIL.strip().lower(), "citizen"),
        ("Demo Operator", DEMO_OPERATOR_EMAIL.strip().lower(), "operator"),
        ("Demo Admin", DEMO_ADMIN_EMAIL.strip().lower(), "admin"),
    ]

    for full_name, email, role in demo_users:
        if not email:
            continue
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            continue
        db.add(
            User(
                full_name=full_name,
                email=email,
                password_hash=hash_password(DEMO_ACCOUNT_PASSWORD),
                role=role,
            )
        )

    db.commit()
