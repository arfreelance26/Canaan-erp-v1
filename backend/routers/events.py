"""Event Management — Admin schedules an upcoming meeting with specific Canaan
Chat users/groups as participants (Topbar's Event button, between Invite and
Calculator). A background worker (event_reminder_worker.py) pushes a live
"starting now" dialog to every participant's screen the moment the meeting's
start time arrives, reusing the same WebSocket mechanism as the Invite
button's live summon push — scheduled instead of click-triggered.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from security import TokenUser, get_current_user, require_roles
from websocket_manager import emit_to_users

router = APIRouter(prefix="/events", tags=["Events"])


def _event_out(db: Session, ev: models.Event) -> schemas.EventOut:
    names = [
        p.staff_name
        for p in db.query(models.EventParticipant).filter(models.EventParticipant.event_id == ev.id).all()
    ]
    return schemas.EventOut(
        id=ev.id, title=ev.title, description=ev.description, location=ev.location,
        starts_at=ev.starts_at, ends_at=ev.ends_at,
        created_by=ev.created_by, created_by_name=ev.created_by_name,
        participant_names=names, created_at=ev.created_at,
        completed_at=ev.completed_at, completed_by_name=ev.completed_by_name,
    )


def _participant_ids(db: Session, event_id: int) -> list[int]:
    return [
        p.staff_id
        for p in db.query(models.EventParticipant).filter(models.EventParticipant.event_id == event_id).all()
    ]


@router.post("", response_model=schemas.EventOut, status_code=201, dependencies=[Depends(require_roles())])
def create_event(
    payload: schemas.EventCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    me = current_user.id
    if me is None:
        raise HTTPException(400, "This action requires a logged-in Admin account.")

    # Multiple users/groups can be picked at once — resolve each target to its
    # staff ids and merge, deduping so someone picked twice (e.g. directly and
    # via a group they're in) only gets one invite.
    seen: set[int] = set()
    participants: list[tuple[int, str]] = []
    for t in payload.targets:
        if t.target_type == "user":
            staff = db.get(models.Staff, t.target_id)
            if not staff or staff.deleted_at is not None:
                raise HTTPException(404, "Staff member not found.")
            if staff.id not in seen:
                seen.add(staff.id)
                participants.append((staff.id, staff.name))
        else:
            conv = db.get(models.ChatConversation, t.target_id)
            if not conv or conv.kind != "group":
                raise HTTPException(404, "Group not found.")
            rows = (
                db.query(models.Staff)
                .join(models.ChatParticipant, models.ChatParticipant.staff_id == models.Staff.id)
                .filter(
                    models.ChatParticipant.conversation_id == conv.id,
                    models.ChatParticipant.left_at.is_(None),
                )
                .all()
            )
            for s in rows:
                if s.id not in seen:
                    seen.add(s.id)
                    participants.append((s.id, s.name))

    # The creator always sees and gets reminded of their own meeting, even if
    # they didn't separately pick themselves as a participant.
    me_staff = db.get(models.Staff, me)
    if me_staff and not any(sid == me for sid, _ in participants):
        participants.append((me, me_staff.name))

    if not participants:
        raise HTTPException(400, "Nobody to invite — the target has no members.")

    ev = models.Event(
        title=payload.title,
        description=(payload.description or "").strip() or None,
        location=(payload.location or "").strip() or None,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        created_by=me,
        created_by_name=current_user.name,
        created_at=datetime.now(timezone.utc),
    )
    db.add(ev)
    db.flush()

    for staff_id, staff_name in participants:
        db.add(models.EventParticipant(event_id=ev.id, staff_id=staff_id, staff_name=staff_name))

    db.commit()
    db.refresh(ev)
    out = _event_out(db, ev)

    emit_to_users([sid for sid, _ in participants], "event_created", out.model_dump(mode="json"))
    return out


@router.get("/upcoming", response_model=list[schemas.EventOut])
def list_my_upcoming(
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Every not-yet-completed meeting the caller is a participant in (always
    true for the creator too — see create_event), nearest first. Not filtered
    by starts_at — a meeting that's already started stays here (so it can
    still be marked complete) until someone closes it out."""
    me = current_user.id
    if me is None:
        return []
    rows = (
        db.query(models.Event)
        .join(models.EventParticipant, models.EventParticipant.event_id == models.Event.id)
        .filter(models.EventParticipant.staff_id == me, models.Event.completed_at.is_(None))
        .order_by(models.Event.starts_at.asc())
        .limit(50)
        .all()
    )
    return [_event_out(db, ev) for ev in rows]


@router.get("/history", response_model=list[schemas.EventOut])
def list_history(
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Completed meetings — Admin sees everyone's, everyone else sees only
    meetings they themselves were a participant in."""
    me = current_user.id
    if me is None:
        return []
    q = db.query(models.Event).filter(models.Event.completed_at.isnot(None))
    if current_user.role != "Admin":
        q = q.join(models.EventParticipant, models.EventParticipant.event_id == models.Event.id).filter(
            models.EventParticipant.staff_id == me
        )
    rows = q.order_by(models.Event.completed_at.desc()).limit(100).all()
    return [_event_out(db, ev) for ev in rows]


@router.post("/{event_id}/complete", response_model=schemas.EventOut)
def complete_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Any participant can close a meeting out — not Admin-only, since whoever
    attended is in the best position to know it happened."""
    me = current_user.id
    ev = db.get(models.Event, event_id)
    if not ev:
        raise HTTPException(404, "Event not found.")
    if ev.completed_at is not None:
        raise HTTPException(400, "This meeting is already marked as completed.")
    is_participant = (
        db.query(models.EventParticipant)
        .filter(models.EventParticipant.event_id == event_id, models.EventParticipant.staff_id == me)
        .first()
    )
    if not is_participant:
        raise HTTPException(404, "Event not found.")

    ev.completed_at = datetime.now(timezone.utc)
    ev.completed_by = me
    ev.completed_by_name = current_user.name
    db.commit()
    db.refresh(ev)
    out = _event_out(db, ev)

    emit_to_users(_participant_ids(db, event_id), "event_completed", out.model_dump(mode="json"))
    return out


@router.delete("/{event_id}", status_code=204, dependencies=[Depends(require_roles())])
def cancel_event(event_id: int, db: Session = Depends(get_db)):
    ev = db.get(models.Event, event_id)
    if not ev:
        raise HTTPException(404, "Event not found.")

    participant_ids = [
        p.staff_id for p in db.query(models.EventParticipant).filter(models.EventParticipant.event_id == event_id).all()
    ]
    title = ev.title
    db.query(models.EventParticipant).filter(models.EventParticipant.event_id == event_id).delete()
    db.delete(ev)
    db.commit()

    emit_to_users(participant_ids, "event_cancelled", {"eventId": event_id, "title": title})
