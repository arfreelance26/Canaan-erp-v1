"""Room Summon — Admin-only "come to my room" push.

Pure realtime: pushes a "The owner has requested your presence in their
room." dialog straight to a staff member's screen over the existing chat
WebSocket, or to every current member of a Canaan Chat group at once. Nothing
about delivery is awaited or acknowledged — the only thing written to the
database is an audit row of who was summoned, when, and by whom (see
models.RoomSummon), since otherwise this leaves no trace anywhere.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from security import TokenUser, get_current_user, require_roles
from websocket_manager import emit_to_users

router = APIRouter(prefix="/room-summon", tags=["Room Summon"])


@router.post("", response_model=schemas.RoomSummonOut, status_code=201, dependencies=[Depends(require_roles())])
def send_summon(
    payload: schemas.RoomSummonCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    me = current_user.id
    if me is None:
        raise HTTPException(400, "This action requires a logged-in Admin account.")

    if payload.target_type == "user":
        staff = db.get(models.Staff, payload.target_id)
        if not staff or staff.deleted_at is not None:
            raise HTTPException(404, "Staff member not found.")
        recipients = [staff.id] if staff.id != me else []
        recipient_names = [staff.name] if staff.id != me else []
        target_label = staff.name
    else:
        conv = db.get(models.ChatConversation, payload.target_id)
        if not conv or conv.kind != "group":
            raise HTTPException(404, "Group not found.")
        members = (
            db.query(models.Staff)
            .join(models.ChatParticipant, models.ChatParticipant.staff_id == models.Staff.id)
            .filter(
                models.ChatParticipant.conversation_id == conv.id,
                models.ChatParticipant.left_at.is_(None),
                models.Staff.id != me,
            )
            .all()
        )
        recipients = [s.id for s in members]
        recipient_names = [s.name for s in members]
        target_label = conv.title or "Group"

    if not recipients:
        raise HTTPException(400, "Nobody to summon — the target has no other members.")

    row = models.RoomSummon(
        summoned_by=me,
        summoned_by_name=current_user.name,
        target_type=payload.target_type,
        target_id=payload.target_id,
        target_label=target_label,
        recipient_ids=recipients,
        recipient_names=recipient_names,
        created_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    emit_to_users(recipients, "room_summon", {
        "summonedByName": current_user.name,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
    })

    return row


@router.get("", response_model=list[schemas.RoomSummonOut], dependencies=[Depends(require_roles())])
def list_summons(
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """Admin-only audit list — most recent summons first."""
    rows = (
        db.query(models.RoomSummon)
        .order_by(models.RoomSummon.id.desc())
        .limit(min(max(limit, 1), 200))
        .all()
    )
    return rows
