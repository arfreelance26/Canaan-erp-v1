"""Canaan Chat — owner view.

A read-only window into every conversation in the company, for the one Admin
who holds the owner password. Separate from login entirely:

  - The password is its own secret (see settings_store.chat_owner_view_password_hash),
    never the staff member's login password.
  - Unlocking issues a 30-minute token (security.create_owner_view_token) sent in
    its own header (X-Owner-View-Token), never as a normal Bearer token.
  - Every route here requires both Admin role and that token (security.require_owner_view).
  - It is read-only: no send/edit/delete route exists in this file.
  - Every unlock attempt and every conversation opened is written to the audit
    log (audit.record_audit), so use of this view is never silent.
  - A handful of wrong passwords locks this admin out for a while (in-memory,
    process-local — see security.py's token-revocation list for the same caveat
    on a multi-worker deployment).

This deliberately duplicates a little of routers/chat.py's query shape rather
than threading an "override participant check" flag through the main chat
router — keeping the one path with no participant filter in its own small,
easy-to-audit file.
"""
import time

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
import schemas
import settings_store
from audit import record_audit
from database import get_db
from routers.chat import _member_out, _message_out
from security import TokenUser, create_owner_view_token, lock_owner_view_token, require_owner_view, require_roles

router = APIRouter(prefix="/chat/owner-view", tags=["Chat Owner View"])

MAX_ATTEMPTS = 5
LOCKOUT_SECONDS = 15 * 60
# staff_id -> timestamps of recent wrong attempts. Process-local; resets on restart.
_failed_attempts: dict[int, list[float]] = {}


def _check_lockout(staff_id: int) -> None:
    now = time.time()
    attempts = [t for t in _failed_attempts.get(staff_id, []) if now - t < LOCKOUT_SECONDS]
    _failed_attempts[staff_id] = attempts
    if len(attempts) >= MAX_ATTEMPTS:
        raise HTTPException(429, f"Too many wrong attempts. Try again in {LOCKOUT_SECONDS // 60} minutes.")


def _record_failure(staff_id: int) -> None:
    _failed_attempts.setdefault(staff_id, []).append(time.time())


def _clear_failures(staff_id: int) -> None:
    _failed_attempts.pop(staff_id, None)


class UnlockRequest(BaseModel):
    password: str = Field(min_length=1, max_length=200)


class UnlockResponse(BaseModel):
    token: str
    expires_at: str


@router.post("/unlock", response_model=UnlockResponse)
def unlock(
    payload: UnlockRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(require_roles()),
):
    """Admin-only. Checks the owner password and, on success, issues a
    30-minute read-only token. Every attempt is audited."""
    staff_id = current_user.id or 0
    _check_lockout(staff_id)

    configured = settings_store.chat_owner_view_password_hash(db) is not None
    if not settings_store.verify_chat_owner_view_password(db, payload.password):
        _record_failure(staff_id)
        record_audit(
            "chat.owner_view.unlock", outcome="denied", request=request,
            actor_id=current_user.id, actor_name=current_user.name, actor_role=current_user.role,
            detail="owner view not configured" if not configured else "wrong password",
        )
        if not configured:
            raise HTTPException(409, "Owner view has not been set up yet.")
        raise HTTPException(401, "Incorrect password.")

    _clear_failures(staff_id)
    token, expires_at = create_owner_view_token(staff_id)
    record_audit(
        "chat.owner_view.unlock", outcome="success", request=request,
        actor_id=current_user.id, actor_name=current_user.name, actor_role=current_user.role,
    )
    return UnlockResponse(token=token, expires_at=expires_at.isoformat())


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


@router.post("/change-password", status_code=204)
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(require_roles()),
):
    """Rotating the password requires knowing the current one — there is no
    other UI for this, by design, so only someone who already has it can
    hand it to someone else or change it."""
    staff_id = current_user.id or 0
    _check_lockout(staff_id)
    was_configured = settings_store.chat_owner_view_password_hash(db) is not None
    if was_configured and not settings_store.verify_chat_owner_view_password(db, payload.current_password):
        _record_failure(staff_id)
        record_audit(
            "chat.owner_view.change_password", outcome="denied", request=request,
            actor_id=current_user.id, actor_name=current_user.name, actor_role=current_user.role,
        )
        raise HTTPException(401, "Incorrect current password.")

    _clear_failures(staff_id)
    settings_store.set_chat_owner_view_password(db, payload.new_password)
    record_audit(
        "chat.owner_view.change_password", outcome="success", request=request,
        actor_id=current_user.id, actor_name=current_user.name, actor_role=current_user.role,
        detail="first-time setup" if not was_configured else None,
    )


@router.post("/lock", status_code=204)
def lock(
    request: Request,
    current_user: TokenUser = Depends(require_owner_view),
):
    """Called when the dialog is closed — revokes this token right away so
    closing it is a real lock, not just a client-side hide for the rest of
    the token's 30-minute window. Requires require_owner_view (a valid token
    bound to this admin), so closing without ever unlocking is a no-op."""
    token = request.headers.get("x-owner-view-token", "")
    lock_owner_view_token(token)
    record_audit(
        "chat.owner_view.lock", request=request,
        actor_id=current_user.id, actor_name=current_user.name, actor_role=current_user.role,
    )


class HistoryEntryOut(BaseModel):
    id: int
    event: str
    outcome: str
    actor_name: str | None
    resource: str | None
    detail: str | None
    created_at: str


@router.get("/history", response_model=list[HistoryEntryOut])
def list_history(
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(require_roles()),
):
    """Every unlock attempt, password change, and conversation opened — for
    any Admin, not just whoever holds the owner password. Deliberately not
    gated by require_owner_view: this is the check on Owner View's use, so it
    can't itself require having already used Owner View to see it."""
    rows = (
        db.query(models.AuditLog)
        .filter(models.AuditLog.event.like("chat.owner_view.%"))
        .order_by(models.AuditLog.id.desc())
        .limit(limit)
        .all()
    )
    return [
        HistoryEntryOut(
            id=r.id,
            event=r.event,
            outcome=r.outcome,
            actor_name=r.actor_name,
            resource=r.resource,
            detail=r.detail,
            created_at=r.created_at.isoformat() if r.created_at else "",
        )
        for r in rows
    ]


@router.get("/conversations", response_model=list[schemas.ChatOwnerConversationOut])
def list_all_conversations(
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(require_owner_view),
):
    """Every conversation in the company, newest activity first. The one place
    in Canaan Chat with no participant filter — gated entirely by require_owner_view."""
    convs = (
        db.query(models.ChatConversation)
        .order_by(models.ChatConversation.last_message_at.desc(), models.ChatConversation.id.desc())
        .all()
    )
    if not convs:
        return []
    conv_ids = [c.id for c in convs]

    member_rows = (
        db.query(models.ChatParticipant.conversation_id, models.Staff)
        .join(models.Staff, models.Staff.id == models.ChatParticipant.staff_id)
        .filter(models.ChatParticipant.conversation_id.in_(conv_ids), models.ChatParticipant.left_at.is_(None))
        .all()
    )
    members_by_conv: dict[int, list[models.Staff]] = {}
    for conv_id, staff in member_rows:
        members_by_conv.setdefault(conv_id, []).append(staff)

    newest_ids = [
        r[0] for r in db.query(func.max(models.ChatMessage.id))
        .filter(models.ChatMessage.conversation_id.in_(conv_ids))
        .group_by(models.ChatMessage.conversation_id)
        .all()
    ]
    last_by_conv: dict[int, models.ChatMessage] = {}
    if newest_ids:
        for msg in db.query(models.ChatMessage).filter(models.ChatMessage.id.in_(newest_ids)).all():
            last_by_conv[msg.conversation_id] = msg

    out = []
    for conv in convs:
        members = members_by_conv.get(conv.id, [])
        title = conv.title or ", ".join(s.name for s in members) or "Conversation"
        last = last_by_conv.get(conv.id)
        out.append(schemas.ChatOwnerConversationOut(
            id=conv.id,
            kind=conv.kind,
            title=title,
            members=[_member_out(s) for s in members],
            last_message=_message_out(last) if last else None,
            last_message_at=conv.last_message_at,
            created_at=conv.created_at,
        ))
    return out


@router.get("/conversations/{conversation_id}/messages", response_model=list[schemas.ChatMessageOut])
def list_all_messages(
    conversation_id: int,
    request: Request,
    before_id: int | None = Query(None, description="Return messages older than this id (keyset paging)"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(require_owner_view),
):
    """One page of a conversation's history, oldest-first within the page. No
    participant check. Attachments and voice notes show their filename/size —
    see ChatMessageOut — but playing them back still goes through the normal
    participant-gated media routes, so this view shows what was said, not the
    raw attachment bytes, for a conversation the owner isn't part of."""
    conv = db.get(models.ChatConversation, conversation_id)
    if not conv:
        raise HTTPException(404, "Conversation not found.")

    q = db.query(models.ChatMessage).filter(models.ChatMessage.conversation_id == conversation_id)
    if before_id:
        q = q.filter(models.ChatMessage.id < before_id)
    msgs = q.order_by(models.ChatMessage.id.desc()).limit(limit).all()
    msgs.reverse()

    if not before_id:
        # Log once per conversation opened, not once per scroll-back page.
        record_audit(
            "chat.owner_view.view", request=request,
            actor_id=current_user.id, actor_name=current_user.name, actor_role=current_user.role,
            resource=f"conversation/{conversation_id}",
        )
    return [_message_out(m) for m in msgs]
