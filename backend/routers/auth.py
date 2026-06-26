from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from pydantic import BaseModel
from database import get_db
import models

router = APIRouter(prefix="/auth", tags=["Auth"])
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

ADMIN_EMAIL = "admin@canaan.com"
ADMIN_PASSWORD = "admin"


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    id: int | None
    name: str
    email: str
    software_designation: str
    staff_id: str | None
    photo_url: str | None


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    if payload.email.strip().lower() == ADMIN_EMAIL and payload.password == ADMIN_PASSWORD:
        return LoginResponse(
            id=None,
            name="Administrator",
            email=ADMIN_EMAIL,
            software_designation="Admin",
            staff_id="ADMIN",
            photo_url=None,
        )

    member = (
        db.query(models.Staff)
        .filter(models.Staff.username == payload.email.strip())
        .first()
    )
    if not member:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not member.password_hash or not pwd_ctx.verify(payload.password, member.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return LoginResponse(
        id=member.id,
        name=member.name,
        email=member.email or member.username or "",
        software_designation=member.software_designation or "Staff",
        staff_id=member.staff_id,
        photo_url=member.photo_url,
    )
