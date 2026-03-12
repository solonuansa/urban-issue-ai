from fastapi import APIRouter, Depends, Form, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import LOGIN_RATE_LIMIT_PER_MINUTE
from app.core.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user_model import User
from app.services.auth_service import create_access_token, hash_password, verify_password
from app.utils.rate_limiter import rate_limiter

router = APIRouter()


@router.post("/register")
def register(
    full_name: str = Form(..., min_length=2, max_length=120),
    email: str = Form(..., min_length=5, max_length=190),
    password: str = Form(..., min_length=8, max_length=72),
    role: str = Form("citizen"),
    db: Session = Depends(get_db),
):
    role_normalized = role.lower()
    if role_normalized not in ("citizen", "operator", "admin"):
        raise HTTPException(status_code=400, detail="role must be citizen, operator, or admin")

    email_normalized = email.strip().lower()
    existing = db.query(User).filter(User.email == email_normalized).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email is already registered")

    user = User(
        full_name=full_name.strip(),
        email=email_normalized,
        password_hash=hash_password(password),
        role=role_normalized,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "message": "User registered successfully",
        "user": {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
            "created_at": user.created_at,
        },
    }


@router.post("/login")
def login(
    request: Request,
    email: str = Form(..., min_length=5, max_length=190),
    password: str = Form(..., min_length=8, max_length=72),
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else "unknown"
    key = f"login:{client_ip}"
    if not rate_limiter.hit(key, LOGIN_RATE_LIMIT_PER_MINUTE):
        raise HTTPException(status_code=429, detail="Too many login attempts. Please try again later.")

    email_normalized = email.strip().lower()
    user = db.query(User).filter(User.email == email_normalized).first()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(subject=str(user.id), role=user.role)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
        },
    }


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {
        "user": {
            "id": current_user.id,
            "full_name": current_user.full_name,
            "email": current_user.email,
            "role": current_user.role,
            "created_at": current_user.created_at,
        }
    }
