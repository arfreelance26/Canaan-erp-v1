"""
Canaan Chat — direct and group messaging.

Security model
--------------
* Message bodies are AES-256-GCM encrypted before they touch the database
  (chat_crypto.py). The API accepts and returns plaintext; the DB only ever
  holds envelopes bound to their conversation and sender.
* Access is participant-only, enforced on every single route by
  `_require_participant`. This deliberately includes Admin: an Admin can manage
  staff accounts, but cannot read a conversation they are not part of. Anything
  weaker would mean "private message" was a lie.
* Realtime updates are addressed to participants' sockets (`emit_to_users`),
  never broadcast, so message contents never reach an unrelated client.

Performance model
-----------------
The two hot paths are bounded to a fixed number of queries regardless of how much
history exists:

* `GET /chat/conversations` runs a constant ~5 queries no matter how many threads
  the user has — conversations, newest message per thread, unread counts, peers,
  and member counts are each fetched in one bulk statement rather than per row.
* `GET /chat/conversations/{id}/messages` uses keyset pagination (`before_id`)
  on the (conversation_id, id) index, so page 100 costs the same as page 1.
  OFFSET paging would degrade linearly and can skip/repeat rows as messages
  arrive mid-scroll.

Unread counts are a range scan against the read cursor on `chat_participants`
rather than per-message receipt rows, which keeps them O(unread) instead of
O(participants x messages).
"""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from jose import JWTError
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
import schemas
from chat_crypto import (
    MAX_ATTACHMENT_BYTES,
    MAX_VOICE_BYTES,
    ChatCryptoError,
    decrypt_bytes,
    encrypt_bytes,
    encrypt_message,
    safe_decrypt,
)
from database import get_db
from security import TokenUser, decode_token, get_current_user
from websocket_manager import emit_to_users

router = APIRouter(prefix="/chat", tags=["Chat"])

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 50
MAX_GROUP_MEMBERS = 256
MAX_GROUP_PHOTO_BYTES = 5 * 1024 * 1024   # 5 MB — a group icon, not a document
MAX_VOICE_SECONDS = 10 * 60   # generous ceiling; the UI itself won't run this long


def _sniff_audio_mime(data: bytes) -> str | None:
    """Identify the real container by magic bytes — never trust the client's
    reported content-type. Covers what MediaRecorder actually produces:
    Opus-in-WebM (Chrome/Edge/Firefox) and AAC-in-MP4 (Safari)."""
    if len(data) < 12:
        return None
    if data[:4] == b"\x1aE\xdf\xa3":
        return "audio/webm"
    if data[:4] == b"OggS":
        return "audio/ogg"
    if data[4:8] == b"ftyp":
        return "audio/mp4"
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "audio/wav"
    if data[:3] == b"ID3" or data[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        return "audio/mpeg"
    return None


# Same principle as files.py's uploader: the true type is decided by magic
# bytes, never the client's declared content-type. Anything that sniffs as one
# of these renders inline as a photo; everything else is offered as a plain
# downloadable file, so there is no allowlist to maintain for "send any document".
_IMAGE_SNIFFERS: tuple[tuple[bytes, str], ...] = (
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
)


def _sniff_image_mime(data: bytes) -> str | None:
    for magic, mime in _IMAGE_SNIFFERS:
        if data.startswith(magic):
            return mime
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


MAX_ATTACHMENT_FILENAME_LEN = 150


def _sanitize_filename(name: str | None) -> str:
    """Strip path separators and control characters, and cap the length —
    this becomes a Content-Disposition header value and is shown verbatim
    in the UI, so it must never be able to smuggle a path or carry a message
    an attacker controls further than "pick a display name"."""
    if not name:
        return "attachment"
    base = name.replace("\\", "/").rsplit("/", 1)[-1].strip()
    base = "".join(ch for ch in base if ch.isprintable())
    base = base.replace('"', "'")
    return base[:MAX_ATTACHMENT_FILENAME_LEN] or "attachment"

# Per-sender flood limit. A simple in-process sliding window: enough to stop a
# runaway client or a bored user spamming a thread, without a Redis dependency.
# Move to a shared store if the backend is ever scaled past one worker.
_SEND_WINDOW_SECONDS = 10.0
_SEND_MAX_IN_WINDOW = 30
_send_log: dict[int, list[float]] = {}


def _check_rate_limit(staff_id: int) -> None:
    import time

    now = time.monotonic()
    recent = [t for t in _send_log.get(staff_id, []) if now - t < _SEND_WINDOW_SECONDS]
    if len(recent) >= _SEND_MAX_IN_WINDOW:
        raise HTTPException(429, "You're sending messages too quickly. Please slow down.")
    recent.append(now)
    _send_log[staff_id] = recent
    # Opportunistic cleanup so the dict cannot grow without bound over uptime.
    if len(_send_log) > 1000:
        for uid in [u for u, ts in _send_log.items() if not any(now - t < _SEND_WINDOW_SECONDS for t in ts)]:
            _send_log.pop(uid, None)


def _me(current_user: TokenUser) -> int:
    """The caller's staff.id — chat requires a real staff record to attribute messages to."""
    if current_user.id is None:
        raise HTTPException(403, "This account is not linked to a staff record and cannot use chat.")
    return int(current_user.id)


def _direct_key(a: int, b: int) -> str:
    """Order-independent identity for a 1:1 thread, so A→B and B→A are the same row."""
    lo, hi = sorted((int(a), int(b)))
    return f"{lo}:{hi}"


def _require_participant(db: Session, conversation_id: int, staff_id: int) -> models.ChatParticipant:
    """Authorisation gate for every conversation-scoped route.

    Returns 404 rather than 403 when the caller is not a member: replying "forbidden"
    would confirm that a conversation with that id exists, which is itself a leak.
    """
    part = (
        db.query(models.ChatParticipant)
        .filter(
            models.ChatParticipant.conversation_id == conversation_id,
            models.ChatParticipant.staff_id == staff_id,
            models.ChatParticipant.left_at.is_(None),
        )
        .first()
    )
    if not part:
        raise HTTPException(404, "Conversation not found.")
    return part


def _member_out(staff: models.Staff, role: str | None = None) -> schemas.ChatMemberOut:
    return schemas.ChatMemberOut(
        staff_id=staff.id,
        name=staff.name,
        designation=staff.designation,
        department=staff.department,
        software_designation=staff.software_designation,
        photo_url=staff.photo_url,
        role=role,
    )


def _message_out(msg: models.ChatMessage) -> schemas.ChatMessageOut:
    """Decrypt one row for the wire. Deleted messages render as a tombstone, not their content.

    Voice/image/file messages carry their ciphertext as encrypted binary, not
    encrypted UTF-8 — `text` stays empty for them and the client fetches/decrypts
    the media itself from GET /chat/messages/{id}/voice or .../attachment,
    authenticated the same way as everything else in this router.

    sender_name/payment_decided_by_name come straight off the row (snapshots
    taken at write time — see models.ChatMessage), not a live join to Staff.
    That's deliberate: sender_id/payment_decided_by go NULL if that staff
    member is later hard-deleted from "Our Staff", but the name must stay
    readable in history regardless — a join would just return nothing once
    the id is gone.
    """
    deleted = msg.deleted_at is not None
    is_binary = msg.content_type in ("voice", "image", "file")
    text = (
        ""
        if deleted or is_binary
        else safe_decrypt(msg.ciphertext, conversation_id=msg.conversation_id, sender_id=msg.sender_id)
    )
    return schemas.ChatMessageOut(
        id=msg.id,
        conversation_id=msg.conversation_id,
        sender_id=msg.sender_id,
        sender_name=msg.sender_name,
        text=text,
        content_type=msg.content_type or "text",
        media_mime=None if deleted else msg.media_mime,
        duration_ms=None if deleted else msg.media_duration_ms,
        media_filename=None if deleted else msg.media_filename,
        media_size=None if deleted else msg.media_size,
        payment_status=None if deleted else msg.payment_status,
        payment_decided_by=None if deleted else msg.payment_decided_by,
        payment_decided_by_name=None if deleted else msg.payment_decided_by_name,
        payment_decided_at=None if deleted else msg.payment_decided_at,
        reply_to_id=msg.reply_to_id,
        created_at=msg.created_at,
        edited_at=msg.edited_at,
        deleted=deleted,
    )


def _participant_ids(db: Session, conversation_id: int) -> list[int]:
    rows = (
        db.query(models.ChatParticipant.staff_id)
        .filter(
            models.ChatParticipant.conversation_id == conversation_id,
            models.ChatParticipant.left_at.is_(None),
        )
        .all()
    )
    return [r[0] for r in rows]


# ---------------------------------------------------------------------------
# Contacts
# ---------------------------------------------------------------------------

@router.get("/contacts", response_model=list[schemas.ChatMemberOut])
def list_contacts(
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Everyone the caller can start a conversation with (all staff except themselves).

    Selects explicit columns so the staff photo/Aadhaar BLOBs are never loaded —
    this endpoint is hit on every chat page open.
    """
    me = _me(current_user)
    rows = (
        db.query(
            models.Staff.id,
            models.Staff.name,
            models.Staff.designation,
            models.Staff.department,
            models.Staff.software_designation,
            models.Staff.photo_url,
        )
        .filter(models.Staff.id != me)
        .order_by(models.Staff.name)
        .all()
    )
    return [
        schemas.ChatMemberOut(
            staff_id=r[0], name=r[1], designation=r[2],
            department=r[3], software_designation=r[4], photo_url=r[5],
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Conversations
# ---------------------------------------------------------------------------

@router.get("/conversations", response_model=list[schemas.ChatConversationOut])
def list_conversations(
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Sidebar payload: every thread the caller is in, newest activity first.

    Bulk-loaded in a fixed number of queries — see the module docstring.
    """
    me = _me(current_user)

    rows = (
        db.query(models.ChatConversation, models.ChatParticipant)
        .join(
            models.ChatParticipant,
            models.ChatParticipant.conversation_id == models.ChatConversation.id,
        )
        .filter(
            models.ChatParticipant.staff_id == me,
            models.ChatParticipant.left_at.is_(None),
        )
        .order_by(
            # MySQL ranks NULL below every value, so DESC already sorts threads
            # that have no messages yet to the bottom — no NULLS LAST needed
            # (which MySQL does not support anyway).
            models.ChatConversation.last_message_at.desc(),
            models.ChatConversation.id.desc(),
        )
        .all()
    )
    if not rows:
        return []

    conv_ids = [c.id for c, _ in rows]

    # --- newest message per conversation (2 queries, not one per thread) ------
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

    # --- unread counts: one aggregate, counted in the database ---------------
    # Each thread has its own read cursor, so the predicate is an OR of per-thread
    # (conversation_id = ? AND id > cursor) ranges. Every branch is an index range
    # scan on (conversation_id, id), and only the counts come back over the wire —
    # message rows are never loaded to be counted in Python.
    read_cursor = {p.conversation_id: (p.last_read_message_id or 0) for _, p in rows}
    unread_by_conv: dict[int, int] = {}
    unread_predicates = [
        and_(models.ChatMessage.conversation_id == cid, models.ChatMessage.id > cursor)
        for cid, cursor in read_cursor.items()
    ]
    if unread_predicates:
        unread_by_conv = {
            cid: count
            for cid, count in db.query(
                models.ChatMessage.conversation_id, func.count(models.ChatMessage.id)
            )
            .filter(
                or_(*unread_predicates),
                models.ChatMessage.deleted_at.is_(None),
                or_(models.ChatMessage.sender_id.is_(None), models.ChatMessage.sender_id != me),
            )
            .group_by(models.ChatMessage.conversation_id)
            .all()
        }

    # --- members: peers for direct threads, counts for groups ----------------
    member_rows = (
        db.query(models.ChatParticipant.conversation_id, models.ChatParticipant.staff_id, models.Staff)
        .join(models.Staff, models.Staff.id == models.ChatParticipant.staff_id)
        .filter(
            models.ChatParticipant.conversation_id.in_(conv_ids),
            models.ChatParticipant.left_at.is_(None),
        )
        .all()
    )
    members_by_conv: dict[int, list[models.Staff]] = {}
    for conv_id, _sid, staff in member_rows:
        members_by_conv.setdefault(conv_id, []).append(staff)

    out: list[schemas.ChatConversationOut] = []
    for conv, part in rows:
        members = members_by_conv.get(conv.id, [])
        peer = None
        title = conv.title
        if conv.kind == "direct":
            peer_staff = next((s for s in members if s.id != me), None)
            if peer_staff:
                peer = _member_out(peer_staff)
                title = peer_staff.name
        last = last_by_conv.get(conv.id)
        out.append(
            schemas.ChatConversationOut(
                id=conv.id,
                kind=conv.kind,
                title=title,
                peer=peer,
                has_photo=bool(conv.photo_url),
                member_count=len(members),
                unread_count=unread_by_conv.get(conv.id, 0),
                muted=bool(part.muted),
                my_role=part.role or "member",
                last_message=_message_out(last) if last else None,
                last_message_at=conv.last_message_at,
                created_at=conv.created_at,
            )
        )
    return out


@router.post("/conversations/direct", response_model=schemas.ChatConversationDetail, status_code=201)
def open_direct_conversation(
    payload: schemas.ChatDirectCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Open (or reopen) the 1:1 thread with another staff member — idempotent.

    Two clicks racing each other both end up on the same conversation: the unique
    index on `direct_key` rejects the loser, which then reads the winner's row.
    """
    me = _me(current_user)
    other_id = int(payload.staff_id)
    if other_id == me:
        raise HTTPException(400, "You cannot start a conversation with yourself.")
    other = db.get(models.Staff, other_id)
    if not other:
        raise HTTPException(404, "That staff member no longer exists.")

    key = _direct_key(me, other_id)
    conv = db.query(models.ChatConversation).filter(models.ChatConversation.direct_key == key).first()

    if not conv:
        conv = models.ChatConversation(kind="direct", direct_key=key, created_by=me, created_by_name=current_user.name)
        db.add(conv)
        try:
            db.flush()
            db.add_all([
                models.ChatParticipant(conversation_id=conv.id, staff_id=me, role="member"),
                models.ChatParticipant(conversation_id=conv.id, staff_id=other_id, role="member"),
            ])
            db.commit()
        except IntegrityError:
            # Lost the race — the other request created it; use theirs.
            db.rollback()
            conv = db.query(models.ChatConversation).filter(models.ChatConversation.direct_key == key).first()
            if not conv:
                raise HTTPException(500, "Could not open the conversation. Please try again.")
        db.refresh(conv)
    else:
        # Rejoin if either side had previously left the thread.
        for sid in (me, other_id):
            part = (
                db.query(models.ChatParticipant)
                .filter(
                    models.ChatParticipant.conversation_id == conv.id,
                    models.ChatParticipant.staff_id == sid,
                )
                .first()
            )
            if part is None:
                db.add(models.ChatParticipant(conversation_id=conv.id, staff_id=sid, role="member"))
            elif part.left_at is not None:
                part.left_at = None
        db.commit()

    return _conversation_detail(db, conv, me)


@router.post("/conversations/group", response_model=schemas.ChatConversationDetail, status_code=201)
def create_group(
    payload: schemas.ChatGroupCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Create a group. The creator is its first admin."""
    me = _me(current_user)
    member_ids = {int(m) for m in payload.member_ids if int(m) != me}
    if len(member_ids) > MAX_GROUP_MEMBERS:
        raise HTTPException(400, f"A group can have at most {MAX_GROUP_MEMBERS} members.")

    if member_ids:
        found = {r[0] for r in db.query(models.Staff.id).filter(models.Staff.id.in_(member_ids)).all()}
        if member_ids - found:
            raise HTTPException(400, "One or more selected members no longer exist.")

    conv = models.ChatConversation(kind="group", title=payload.title, created_by=me, created_by_name=current_user.name)
    db.add(conv)
    db.flush()
    db.add(models.ChatParticipant(conversation_id=conv.id, staff_id=me, role="admin"))
    for sid in member_ids:
        db.add(models.ChatParticipant(conversation_id=conv.id, staff_id=sid, role="member"))
    db.commit()
    db.refresh(conv)

    emit_to_users([me, *member_ids], "chat_conversation_created", {"conversation_id": conv.id})
    return _conversation_detail(db, conv, me)


def _conversation_detail(db: Session, conv: models.ChatConversation, me: int) -> schemas.ChatConversationDetail:
    parts = (
        db.query(models.ChatParticipant, models.Staff)
        .join(models.Staff, models.Staff.id == models.ChatParticipant.staff_id)
        .filter(
            models.ChatParticipant.conversation_id == conv.id,
            models.ChatParticipant.left_at.is_(None),
        )
        .all()
    )
    members = [_member_out(s, p.role) for p, s in parts]
    mine = next((p for p, _s in parts if p.staff_id == me), None)

    peer = None
    title = conv.title
    if conv.kind == "direct":
        peer_staff = next((s for _p, s in parts if s.id != me), None)
        if peer_staff:
            peer = _member_out(peer_staff)
            title = peer_staff.name

    return schemas.ChatConversationDetail(
        id=conv.id,
        kind=conv.kind,
        title=title,
        peer=peer,
        has_photo=bool(conv.photo_url),
        member_count=len(members),
        unread_count=0,
        muted=bool(mine.muted) if mine else False,
        my_role=(mine.role if mine else "member"),
        last_message=None,
        last_message_at=conv.last_message_at,
        created_at=conv.created_at,
        members=members,
    )


@router.get("/conversations/{conversation_id}", response_model=schemas.ChatConversationDetail)
def get_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    me = _me(current_user)
    _require_participant(db, conversation_id, me)
    conv = db.get(models.ChatConversation, conversation_id)
    if not conv:
        raise HTTPException(404, "Conversation not found.")
    return _conversation_detail(db, conv, me)


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------

@router.get("/conversations/{conversation_id}/messages", response_model=list[schemas.ChatMessageOut])
def list_messages(
    conversation_id: int,
    before_id: int | None = Query(None, description="Return messages older than this id (keyset paging)"),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """One page of history, oldest-first within the page.

    Paged by id rather than OFFSET so cost stays flat as a thread grows and rows
    can't shift underneath a reader while new messages arrive.
    """
    me = _me(current_user)
    _require_participant(db, conversation_id, me)

    q = db.query(models.ChatMessage).filter(models.ChatMessage.conversation_id == conversation_id)
    if before_id:
        q = q.filter(models.ChatMessage.id < before_id)
    msgs = q.order_by(models.ChatMessage.id.desc()).limit(limit).all()
    msgs.reverse()   # hand back in reading order

    return [_message_out(m) for m in msgs]


def _commit_new_message(
    db: Session, msg: models.ChatMessage, *, conversation_id: int, me: int
) -> schemas.ChatMessageOut:
    """Shared tail end of sending anything (text or voice): bump the thread's
    last-activity timestamp, advance the sender's own read cursor so their send
    never counts as unread on their other devices, commit, then push the
    finished message to every other participant's socket."""
    conv = db.get(models.ChatConversation, conversation_id)
    if conv:
        conv.last_message_at = msg.created_at

    db.flush()
    mine = (
        db.query(models.ChatParticipant)
        .filter(
            models.ChatParticipant.conversation_id == conversation_id,
            models.ChatParticipant.staff_id == me,
        )
        .first()
    )
    if mine:
        mine.last_read_message_id = msg.id
    db.commit()
    db.refresh(msg)

    out = _message_out(msg)
    recipients = [p for p in _participant_ids(db, conversation_id) if p != me]
    if recipients:
        emit_to_users(recipients, "chat_message", out.model_dump(mode="json"))
    return out


@router.post("/conversations/{conversation_id}/messages", response_model=schemas.ChatMessageOut, status_code=201)
def send_message(
    conversation_id: int,
    payload: schemas.ChatMessageCreate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Encrypt and store a message, then push it to the other participants' sockets.

    Covers both plain text and a WhatsApp-Pay-style payment note (content_type
    "payment") — the latter is cosmetic, a formatted "₹500, for fuel" card, not
    a real transfer. Its {amount, note} is JSON-encoded then run through the
    exact same text encryption as an ordinary message, so it gets identical
    at-rest protection, read-cursor handling, and realtime delivery for free."""
    me = _me(current_user)
    _require_participant(db, conversation_id, me)
    _check_rate_limit(me)

    # A reply must point at a message in this same thread — otherwise a crafted
    # reply_to_id could be used to probe for the existence of other conversations.
    if payload.reply_to_id is not None:
        parent = db.get(models.ChatMessage, payload.reply_to_id)
        if not parent or parent.conversation_id != conversation_id:
            raise HTTPException(400, "You can only reply to a message in this conversation.")

    if payload.content_type == "payment":
        body = json.dumps({"amount": str(payload.amount), "note": (payload.note or "").strip()})
    else:
        body = payload.text.strip()

    try:
        envelope = encrypt_message(body, conversation_id=conversation_id, sender_id=me)
    except ChatCryptoError as exc:
        raise HTTPException(400, str(exc))

    msg = models.ChatMessage(
        conversation_id=conversation_id,
        sender_id=me,
        sender_name=current_user.name,
        ciphertext=envelope,
        content_type=payload.content_type,
        payment_status="pending" if payload.content_type == "payment" else None,
        reply_to_id=payload.reply_to_id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(msg)
    return _commit_new_message(db, msg, conversation_id=conversation_id, me=me)


@router.post("/conversations/{conversation_id}/voice", response_model=schemas.ChatMessageOut, status_code=201)
async def send_voice_message(
    conversation_id: int,
    file: UploadFile = File(...),
    duration_ms: int = Form(...),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Record-and-send a voice note — encrypted the same way as text, just with
    audio bytes as the payload instead of UTF-8. Recorded client-side via
    MediaRecorder; the true container is verified here by magic bytes rather
    than trusting the browser's reported content-type."""
    me = _me(current_user)
    _require_participant(db, conversation_id, me)
    _check_rate_limit(me)

    if duration_ms <= 0 or duration_ms > MAX_VOICE_SECONDS * 1000:
        raise HTTPException(400, "Invalid recording duration.")

    # Read one byte past the cap so an oversized upload is caught without ever
    # holding the whole (potentially huge) body in memory.
    data = await file.read(MAX_VOICE_BYTES + 1)
    if len(data) > MAX_VOICE_BYTES:
        raise HTTPException(
            413, f"Voice message is too long — the limit is {MAX_VOICE_BYTES // (1024 * 1024)} MB."
        )
    if not data:
        raise HTTPException(400, "Empty recording.")

    mime = _sniff_audio_mime(data)
    if mime is None:
        raise HTTPException(415, "Unsupported audio format.")

    try:
        envelope = encrypt_bytes(data, conversation_id=conversation_id, sender_id=me, max_len=MAX_VOICE_BYTES)
    except ChatCryptoError as exc:
        raise HTTPException(400, str(exc))

    msg = models.ChatMessage(
        conversation_id=conversation_id,
        sender_id=me,
        sender_name=current_user.name,
        ciphertext=envelope,
        content_type="voice",
        media_mime=mime,
        media_duration_ms=duration_ms,
        created_at=datetime.now(timezone.utc),
    )
    db.add(msg)
    return _commit_new_message(db, msg, conversation_id=conversation_id, me=me)


@router.get("/messages/{message_id}/voice")
def get_voice_audio(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Stream a voice note's decrypted audio. Participant-only, like every other
    chat route — the whole router runs behind auth (see main.py), so a plain
    fetch() with the usual Bearer token is enough; no query-param token needed
    (the client can't use a bare <audio src> anyway once the bytes are encrypted
    at rest, so it always goes through an authenticated fetch + blob URL)."""
    me = _me(current_user)
    msg = db.get(models.ChatMessage, message_id)
    if not msg or msg.content_type != "voice" or msg.deleted_at is not None:
        raise HTTPException(404, "Voice message not found.")
    _require_participant(db, msg.conversation_id, me)

    try:
        data = decrypt_bytes(msg.ciphertext, conversation_id=msg.conversation_id, sender_id=msg.sender_id)
    except ChatCryptoError:
        raise HTTPException(500, "This voice message could not be decrypted.")

    return Response(
        content=data,
        media_type=msg.media_mime or "application/octet-stream",
        headers={
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, max-age=3600",
        },
    )


@router.post("/conversations/{conversation_id}/attachment", response_model=schemas.ChatMessageOut, status_code=201)
async def send_attachment(
    conversation_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Send a file — photo or any other document, matching the "paperclip"
    attach button. A sniffed image renders inline as a photo; anything else is
    stored the same way and offered as a plain downloadable file, so this
    endpoint deliberately has no type allowlist to maintain (unlike files.py's
    ID-document uploads, this isn't rendering untrusted content inline unless
    it was verifiably sniffed as an image)."""
    me = _me(current_user)
    _require_participant(db, conversation_id, me)
    _check_rate_limit(me)

    # Read one byte past the cap so an oversized upload is caught without ever
    # holding the whole (potentially huge) body in memory.
    data = await file.read(MAX_ATTACHMENT_BYTES + 1)
    if len(data) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(
            413, f"File is too large — the limit is {MAX_ATTACHMENT_BYTES // (1024 * 1024)} MB."
        )
    if not data:
        raise HTTPException(400, "Empty file.")

    image_mime = _sniff_image_mime(data)
    is_image = image_mime is not None
    mime = image_mime or (file.content_type if file.content_type else None) or "application/octet-stream"
    filename = _sanitize_filename(file.filename)

    try:
        envelope = encrypt_bytes(data, conversation_id=conversation_id, sender_id=me, max_len=MAX_ATTACHMENT_BYTES)
    except ChatCryptoError as exc:
        raise HTTPException(400, str(exc))

    msg = models.ChatMessage(
        conversation_id=conversation_id,
        sender_id=me,
        sender_name=current_user.name,
        ciphertext=envelope,
        content_type="image" if is_image else "file",
        media_mime=mime,
        media_filename=filename,
        media_size=len(data),
        created_at=datetime.now(timezone.utc),
    )
    db.add(msg)
    return _commit_new_message(db, msg, conversation_id=conversation_id, me=me)


@router.get("/messages/{message_id}/attachment")
def get_attachment(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Stream a decrypted image/file attachment. Same participant-only auth as
    every other chat route. Images render inline (needed for an <img> preview
    fetched as a blob); anything else is forced to download so a stored
    HTML/SVG payload masquerading as a "document" can never execute in the
    browser — same rule files.py already applies to non-image uploads."""
    me = _me(current_user)
    msg = db.get(models.ChatMessage, message_id)
    if not msg or msg.content_type not in ("image", "file") or msg.deleted_at is not None:
        raise HTTPException(404, "Attachment not found.")
    _require_participant(db, msg.conversation_id, me)

    try:
        data = decrypt_bytes(msg.ciphertext, conversation_id=msg.conversation_id, sender_id=msg.sender_id)
    except ChatCryptoError:
        raise HTTPException(500, "This attachment could not be decrypted.")

    filename = msg.media_filename or "attachment"
    disposition = "inline" if msg.content_type == "image" else "attachment"
    return Response(
        content=data,
        media_type=msg.media_mime or "application/octet-stream",
        headers={
            "Content-Disposition": f'{disposition}; filename="{filename}"',
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "Cache-Control": "private, max-age=3600",
        },
    )


@router.patch("/messages/{message_id}", response_model=schemas.ChatMessageOut)
def edit_message(
    message_id: int,
    payload: schemas.ChatMessageEdit,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Edit your own message. Re-encrypted in place; the edit is marked, not hidden."""
    me = _me(current_user)
    msg = db.get(models.ChatMessage, message_id)
    if not msg:
        raise HTTPException(404, "Message not found.")
    _require_participant(db, msg.conversation_id, me)
    if msg.sender_id != me:
        raise HTTPException(403, "You can only edit your own messages.")
    if msg.deleted_at is not None:
        raise HTTPException(400, "This message was deleted and can no longer be edited.")
    if msg.content_type != "text":
        raise HTTPException(400, "Only text messages can be edited.")

    try:
        msg.ciphertext = encrypt_message(
            payload.text.strip(), conversation_id=msg.conversation_id, sender_id=me
        )
    except ChatCryptoError as exc:
        raise HTTPException(400, str(exc))
    msg.edited_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)

    out = _message_out(msg)
    recipients = [p for p in _participant_ids(db, msg.conversation_id) if p != me]
    if recipients:
        emit_to_users(recipients, "chat_message_updated", out.model_dump(mode="json"))
    return out


@router.delete("/messages/{message_id}", response_model=schemas.ChatMessageOut)
def delete_message(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Soft-delete your own message (group admins may remove any message in their group).

    The row stays so reply chains and read cursors remain valid, but the ciphertext
    is destroyed — a delete genuinely removes the content, it doesn't just hide it.
    """
    me = _me(current_user)
    msg = db.get(models.ChatMessage, message_id)
    if not msg:
        raise HTTPException(404, "Message not found.")
    part = _require_participant(db, msg.conversation_id, me)

    # An automatic payment-decision notice is attributed to whoever decided
    # (see _post_system_message) so it's correctly identified as coming from
    # them, but it's still not an ordinary message they authored — it must
    # keep notifying the original requester, so it can't be deleted by anyone.
    if msg.content_type == "system":
        raise HTTPException(400, "This automatic notice can't be deleted.")

    conv = db.get(models.ChatConversation, msg.conversation_id)
    is_group_admin = conv is not None and conv.kind == "group" and part.role == "admin"
    if msg.sender_id != me and not is_group_admin:
        raise HTTPException(403, "You can only delete your own messages.")

    if msg.deleted_at is None:
        msg.deleted_at = datetime.now(timezone.utc)
        msg.ciphertext = encrypt_message(
            "", conversation_id=msg.conversation_id, sender_id=msg.sender_id
        )
        db.commit()
        db.refresh(msg)

    out = _message_out(msg)
    recipients = [p for p in _participant_ids(db, msg.conversation_id) if p != me]
    if recipients:
        emit_to_users(recipients, "chat_message_deleted", out.model_dump(mode="json"))
    return out


def _post_system_message(db: Session, conversation_id: int, me: int, text: str) -> None:
    """Post the automatic outcome notice for a payment decision, visible to
    every participant right away — including whoever triggered it, since
    their own client is already open on this conversation and should see the
    same announcement everyone else does.

    Attributed to `me` — the one who actually had the authority to approve or
    reject (the note's recipient at the chat stage, or Accounts/Admin at the
    finance stage) — rather than posted anonymously, so the message correctly
    records who caused it. Still kept as content_type "system" rather than
    "text": it reads as the app addressing the original requester ("Your
    Payment Request Has Been Approved"), not a reply typed by the decider, and
    staying "system" keeps it non-editable/non-deletable like before.
    """
    decider = db.get(models.Staff, me)
    decider_name = decider.name if decider else None

    envelope = encrypt_message(text, conversation_id=conversation_id, sender_id=me)
    msg = models.ChatMessage(
        conversation_id=conversation_id,
        sender_id=me,
        sender_name=decider_name,
        ciphertext=envelope,
        content_type="system",
        created_at=datetime.now(timezone.utc),
    )
    db.add(msg)
    conv = db.get(models.ChatConversation, conversation_id)
    if conv:
        conv.last_message_at = msg.created_at
    db.flush()

    # The person who triggered this has, by definition, already seen the outcome.
    mine = (
        db.query(models.ChatParticipant)
        .filter(
            models.ChatParticipant.conversation_id == conversation_id,
            models.ChatParticipant.staff_id == me,
        )
        .first()
    )
    if mine:
        mine.last_read_message_id = msg.id
    db.commit()
    db.refresh(msg)

    out = _message_out(msg)
    emit_to_users(_participant_ids(db, conversation_id), "chat_message", out.model_dump(mode="json"))


@router.post("/messages/{message_id}/payment-status", response_model=schemas.ChatMessageOut)
def set_payment_status(
    message_id: int,
    payload: schemas.ChatPaymentDecision,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Approve or reject a payment note — cosmetic, records a decision on the
    note itself; no money moves either way. The sender can't decide their own
    note, and a decision is terminal: whoever acts first wins, no changing it
    afterward. `with_for_update` locks the row for the transaction so two people
    (in a group) clicking Approve/Reject at the same instant can't both "win"."""
    me = _me(current_user)
    msg = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.id == message_id)
        .with_for_update()
        .first()
    )
    if not msg or msg.content_type != "payment" or msg.deleted_at is not None:
        raise HTTPException(404, "Payment note not found.")
    _require_participant(db, msg.conversation_id, me)

    if msg.sender_id == me:
        raise HTTPException(403, "You can't approve or reject your own payment note.")
    if msg.payment_status != "pending":
        raise HTTPException(409, f"This payment note was already {msg.payment_status}.")

    msg.payment_status = payload.status
    msg.payment_decided_by = me
    msg.payment_decided_by_name = current_user.name
    msg.payment_decided_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)

    out = _message_out(msg)
    recipients = [p for p in _participant_ids(db, msg.conversation_id) if p != me]
    if recipients:
        emit_to_users(recipients, "chat_message_updated", out.model_dump(mode="json"))

    # Automatic follow-up notice, addressed to the original requester:
    # "Payment Request Has Been Approved/Rejected." Posted as its own system
    # message rather than folded into the card itself, so it shows up in
    # history and unread counts the same way any other new message would.
    label = "Approved" if payload.status == "approved" else "Rejected"
    _post_system_message(db, msg.conversation_id, me, f"Payment Request Has Been {label}")

    return out


@router.post("/conversations/{conversation_id}/read")
def mark_read(
    conversation_id: int,
    payload: schemas.ChatReadPayload,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Advance the read cursor. Monotonic — a stale client can't un-read messages."""
    me = _me(current_user)
    part = _require_participant(db, conversation_id, me)
    if payload.message_id > (part.last_read_message_id or 0):
        part.last_read_message_id = payload.message_id
        db.commit()
    return {"ok": True, "last_read_message_id": part.last_read_message_id}


@router.post("/conversations/{conversation_id}/mute")
def set_mute(
    conversation_id: int,
    payload: schemas.ChatMutePayload,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    me = _me(current_user)
    part = _require_participant(db, conversation_id, me)
    part.muted = bool(payload.muted)
    db.commit()
    return {"ok": True, "muted": part.muted}


# ---------------------------------------------------------------------------
# Group membership
# ---------------------------------------------------------------------------

def _require_group_admin(db: Session, conversation_id: int, staff_id: int) -> models.ChatConversation:
    part = _require_participant(db, conversation_id, staff_id)
    conv = db.get(models.ChatConversation, conversation_id)
    if not conv or conv.kind != "group":
        raise HTTPException(400, "This action only applies to group conversations.")
    if part.role != "admin":
        raise HTTPException(403, "Only a group admin can do that.")
    return conv


@router.patch("/conversations/{conversation_id}", response_model=schemas.ChatConversationDetail)
def rename_group(
    conversation_id: int,
    payload: schemas.ChatGroupUpdate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    me = _me(current_user)
    conv = _require_group_admin(db, conversation_id, me)
    conv.title = payload.title
    db.commit()
    db.refresh(conv)
    emit_to_users(_participant_ids(db, conversation_id), "chat_conversation_updated",
                  {"conversation_id": conv.id, "title": conv.title})
    return _conversation_detail(db, conv, me)


@router.post("/conversations/{conversation_id}/photo", response_model=schemas.ChatConversationDetail)
async def upload_group_photo(
    conversation_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    me = _me(current_user)
    conv = _require_group_admin(db, conversation_id, me)
    data = await file.read(MAX_GROUP_PHOTO_BYTES + 1)
    if len(data) > MAX_GROUP_PHOTO_BYTES:
        raise HTTPException(413, "Image too large. The maximum allowed size is 5 MB.")
    if _sniff_image_mime(data) is None:
        raise HTTPException(415, "Unsupported file type. Only JPG, PNG, WEBP or GIF images are allowed.")
    conv.photo_blob = data
    conv.photo_url = _sanitize_filename(file.filename)
    db.commit()
    db.refresh(conv)
    emit_to_users(_participant_ids(db, conversation_id), "chat_conversation_updated",
                  {"conversation_id": conv.id, "photo_changed": True})
    return _conversation_detail(db, conv, me)


@router.delete("/conversations/{conversation_id}/photo", response_model=schemas.ChatConversationDetail)
def remove_group_photo(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    me = _me(current_user)
    conv = _require_group_admin(db, conversation_id, me)
    conv.photo_blob = None
    conv.photo_url = None
    db.commit()
    db.refresh(conv)
    emit_to_users(_participant_ids(db, conversation_id), "chat_conversation_updated",
                  {"conversation_id": conv.id, "photo_changed": True})
    return _conversation_detail(db, conv, me)


# ---------------------------------------------------------------------------
# Group photo download — a SEPARATE router, mounted in main.py WITHOUT the
# app-level AUTH dependency (see main.py's `app.include_router(chat.router,
# dependencies=AUTH)` vs. `app.include_router(chat.photo_router)`).
#
# Why: `chat.router` requires an Authorization header on every route via that
# app-level dependency, which runs before any route body executes. A plain
# `<img src>` cannot send custom headers, so — same as files.py's downloader —
# this route must accept the token as a `?token=` query param instead, and
# that fallback only works if it isn't gated behind a header-only dependency
# first. Auth is therefore done by hand below, same participant-only check as
# every other read in this file.
# ---------------------------------------------------------------------------
photo_router = APIRouter(prefix="/chat", tags=["Chat"])


def _require_photo_token(request: Request) -> dict:
    """Same header-or-query-param auth as files.py's downloader — a plain <img
    src> can't send an Authorization header, so the token also travels as a
    query param for this one read-only route."""
    token = ""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth.removeprefix("Bearer ").strip()
    if not token:
        token = request.query_params.get("token", "").strip()
    if not token:
        raise HTTPException(401, "Authentication required to access this file.")
    try:
        return decode_token(token)
    except JWTError:
        raise HTTPException(401, "Session expired or invalid. Please log in again.")


@photo_router.get("/conversations/{conversation_id}/photo")
def get_group_photo(
    conversation_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    # Group icons stay participant-only, same as every other conversation-scoped
    # route in this file — an authenticated-but-unrelated staff member still
    # cannot view them, unlike files.py's generic entity downloader.
    payload = _require_photo_token(request)
    staff_id = int(payload["sub"]) if str(payload.get("sub", "")).isdigit() else None
    if staff_id is None:
        raise HTTPException(401, "Session expired or invalid. Please log in again.")
    _require_participant(db, conversation_id, staff_id)

    conv = db.get(models.ChatConversation, conversation_id)
    if not conv or not conv.photo_blob:
        raise HTTPException(404, "No photo set for this group.")
    mime = _sniff_image_mime(conv.photo_blob) or "application/octet-stream"
    return Response(
        content=conv.photo_blob,
        media_type=mime,
        headers={
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )


@router.post("/conversations/{conversation_id}/members", response_model=schemas.ChatConversationDetail)
def add_members(
    conversation_id: int,
    payload: schemas.ChatMembersAdd,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    me = _me(current_user)
    conv = _require_group_admin(db, conversation_id, me)

    existing = {
        p.staff_id: p
        for p in db.query(models.ChatParticipant).filter(
            models.ChatParticipant.conversation_id == conversation_id
        ).all()
    }
    active_count = sum(1 for p in existing.values() if p.left_at is None)
    added: list[int] = []
    for raw in payload.member_ids:
        sid = int(raw)
        part = existing.get(sid)
        if part and part.left_at is None:
            continue                      # already a member
        if not db.get(models.Staff, sid):
            raise HTTPException(400, "One or more selected members no longer exist.")
        if active_count >= MAX_GROUP_MEMBERS:
            raise HTTPException(400, f"A group can have at most {MAX_GROUP_MEMBERS} members.")
        if part:
            part.left_at = None           # rejoin
        else:
            db.add(models.ChatParticipant(conversation_id=conversation_id, staff_id=sid, role="member"))
        active_count += 1
        added.append(sid)

    db.commit()
    db.refresh(conv)
    if added:
        emit_to_users(_participant_ids(db, conversation_id), "chat_conversation_updated",
                      {"conversation_id": conv.id})
    return _conversation_detail(db, conv, me)


@router.delete("/conversations/{conversation_id}/members/{staff_id}", response_model=schemas.ChatConversationDetail)
def remove_member(
    conversation_id: int,
    staff_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Remove someone from a group, or leave it yourself."""
    me = _me(current_user)
    target = int(staff_id)
    if target != me:
        conv = _require_group_admin(db, conversation_id, me)
    else:
        _require_participant(db, conversation_id, me)
        conv = db.get(models.ChatConversation, conversation_id)
        if not conv or conv.kind != "group":
            raise HTTPException(400, "This action only applies to group conversations.")

    part = (
        db.query(models.ChatParticipant)
        .filter(
            models.ChatParticipant.conversation_id == conversation_id,
            models.ChatParticipant.staff_id == target,
            models.ChatParticipant.left_at.is_(None),
        )
        .first()
    )
    if not part:
        raise HTTPException(404, "That person is not in this group.")

    remaining_admins = (
        db.query(func.count(models.ChatParticipant.id))
        .filter(
            models.ChatParticipant.conversation_id == conversation_id,
            models.ChatParticipant.left_at.is_(None),
            models.ChatParticipant.role == "admin",
            models.ChatParticipant.staff_id != target,
        )
        .scalar()
    )
    part.left_at = datetime.now(timezone.utc)
    db.flush()

    # Never strand a group without an admin — promote the longest-standing member.
    if part.role == "admin" and not remaining_admins:
        successor = (
            db.query(models.ChatParticipant)
            .filter(
                models.ChatParticipant.conversation_id == conversation_id,
                models.ChatParticipant.left_at.is_(None),
            )
            .order_by(models.ChatParticipant.joined_at.asc(), models.ChatParticipant.id.asc())
            .first()
        )
        if successor:
            successor.role = "admin"

    db.commit()
    db.refresh(conv)
    emit_to_users([*_participant_ids(db, conversation_id), target], "chat_conversation_updated",
                  {"conversation_id": conv.id})

    if target == me:
        return schemas.ChatConversationDetail(
            id=conv.id, kind=conv.kind, title=conv.title, member_count=0,
            unread_count=0, muted=False, my_role="member", members=[],
        )
    return _conversation_detail(db, conv, me)
