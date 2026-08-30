"""
Payment Requests — the finance-side second stage of a Canaan Chat payment note.

Flow:
    1. Staff member sends a payment note to a colleague in Canaan Chat.
    2. That colleague approves or rejects it (chat_messages.payment_status).
       A peer *rejection* is terminal and still lands here (Rejected bucket)
       purely for visibility — there's nothing for Accounts to action on it.
    3. An *approved* note lands here for Accounts/Admin to actually action:
         "Approve for Payment" -> finance_status "approved" (Unpaid: authorized,
             money hasn't moved yet)
         "Reject"              -> finance_status "rejected" (terminal)
    4. Once "approved" (Unpaid), a later, separate action — "Mark as Paid" —
       records that the money actually moved: finance_status becomes "paid".
       This is deliberately its own step/columns (paid_by/paid_at), not folded
       into step 3, because authorizing a payment and actually disbursing it
       are different moments and are very often different people.

This is deliberately a separate, narrow surface from routers/chat.py, not an
extension of it:

* Chat messages are participant-only everywhere else in this app. This page
  can't be — Accounts needs to see approved requests from chats they were
  never part of. So this router intentionally bypasses `_require_participant`
  for GET, but exposes only {amount, description, who/when at each stage} —
  never the surrounding conversation, and never a path to read, edit, or
  delete the underlying chat message (those stay behind the normal
  participant-gated chat routes untouched).
* Gated to Accounts/Admin only, matching every other financial view in this
  app (see main.py's FINANCE dependency group).
"""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

import models
import schemas
from chat_crypto import MAX_ATTACHMENT_BYTES, ChatCryptoError, decrypt_bytes, encrypt_bytes, safe_decrypt
from database import get_db
from routers.chat import _post_system_message, _sniff_image_mime
from security import TokenUser, get_current_user

router = APIRouter(prefix="/payment-requests", tags=["Payment Requests"])


def _parse_note(msg: models.ChatMessage) -> tuple[str, str]:
    """Decrypt a payment note's {amount, note} JSON. Degrades to placeholders
    on corruption rather than failing the whole list for one bad row."""
    raw = safe_decrypt(msg.ciphertext, conversation_id=msg.conversation_id, sender_id=msg.sender_id)
    try:
        parsed = json.loads(raw)
        amount = str(parsed.get("amount", "0"))
        note = str(parsed.get("note", "") or "")
    except (ValueError, AttributeError):
        amount, note = "0", "[unreadable]"
    return amount, note


def _to_out(msg: models.ChatMessage) -> schemas.PaymentRequestOut:
    """Every *_name field here comes straight off the row — a snapshot taken at
    write time (see models.ChatMessage) — not a live join to Staff. The staff
    row behind any of these ids can be hard-deleted from "Our Staff" at any
    time; the snapshot is what keeps this history readable regardless."""
    amount, note = _parse_note(msg)
    return schemas.PaymentRequestOut(
        id=msg.id,
        conversation_id=msg.conversation_id,
        amount=amount,
        description=note,
        asked_by_id=msg.sender_id,
        asked_by_name=msg.sender_name,
        asked_at=msg.created_at,
        payment_status=msg.payment_status,
        approved_by_id=msg.payment_decided_by,
        approved_by_name=msg.payment_decided_by_name,
        approved_at=msg.payment_decided_at,
        finance_status=msg.finance_status,
        finance_decided_by_id=msg.finance_decided_by,
        finance_decided_by_name=msg.finance_decided_by_name,
        finance_decided_at=msg.finance_decided_at,
        paid_by_id=msg.paid_by,
        paid_by_name=msg.paid_by_name,
        paid_at=msg.paid_at,
        has_proof=msg.paid_proof_ciphertext is not None,
    )


@router.get("", response_model=list[schemas.PaymentRequestOut])
def list_payment_requests(
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Every chat payment note a peer has already decided on, company-wide —
    regardless of which conversation it came from or whether the viewer was
    ever part of it. Includes peer-rejected notes (terminal, shown for
    visibility only) alongside every finance outcome of a peer-approved note
    (pending/Unpaid/paid/rejected) so the page's filter cards can bucket them
    client-side — a note can be "Rejected" either because the peer rejected it
    in chat, or because Accounts rejected it after approval."""
    msgs = (
        db.query(models.ChatMessage)
        .filter(
            models.ChatMessage.content_type == "payment",
            models.ChatMessage.payment_status.in_(["approved", "rejected"]),
            models.ChatMessage.deleted_at.is_(None),
        )
        .order_by(models.ChatMessage.payment_decided_at.desc())
        .all()
    )
    return [_to_out(m) for m in msgs]


@router.post("/{message_id}/decision", response_model=schemas.PaymentRequestOut)
def decide_payment_request(
    message_id: int,
    payload: schemas.PaymentRequestDecision,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Approve for Payment / Reject — Accounts/Admin's first word on an already
    peer-approved note. Terminal for "rejected"; "approved" (Unpaid) can move
    on exactly once more, via /mark-paid below."""
    me = current_user.id
    if me is None:
        raise HTTPException(403, "This account is not linked to a staff record.")

    msg = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.id == message_id)
        .with_for_update()
        .first()
    )
    if (
        not msg
        or msg.content_type != "payment"
        or msg.payment_status != "approved"
        or msg.deleted_at is not None
    ):
        raise HTTPException(404, "Payment request not found.")
    if msg.finance_status is not None:
        raise HTTPException(409, f"This payment request was already {msg.finance_status}.")

    decider = db.get(models.Staff, me)
    if not decider:
        raise HTTPException(403, "This account is not linked to a staff record.")

    msg.finance_status = payload.status
    msg.finance_decided_by = me
    msg.finance_decided_by_name = decider.name
    msg.finance_decided_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)

    # Let the original requester (and anyone else in that chat) know the
    # outcome, the same way the peer-approval step already does — posted into
    # the *original* conversation, even though the decider here was never a
    # participant in it.
    label = "Approved for Payment" if payload.status == "approved" else "Rejected by Accounts"
    try:
        _post_system_message(db, msg.conversation_id, me, f"Payment Request Has Been {label}")
    except ChatCryptoError:
        pass  # the finance decision itself is already committed; a missed chat notice isn't worth failing the request over

    return _to_out(msg)


@router.post("/{message_id}/mark-paid", response_model=schemas.PaymentRequestOut)
async def mark_payment_request_paid(
    message_id: int,
    proof: UploadFile = File(..., description="Proof of payment photo — required."),
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Mark an already-approved (Unpaid) request as actually paid. A proof
    photo is mandatory — this is the whole point of the step, not an optional
    attachment — and is verified by magic bytes, not the client's claimed
    content-type, then encrypted at rest the same way every other file in this
    app is. Only valid from finance_status "approved"; can only happen once."""
    me = current_user.id
    if me is None:
        raise HTTPException(403, "This account is not linked to a staff record.")

    msg = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.id == message_id)
        .with_for_update()
        .first()
    )
    if (
        not msg
        or msg.content_type != "payment"
        or msg.payment_status != "approved"
        or msg.deleted_at is not None
    ):
        raise HTTPException(404, "Payment request not found.")
    if msg.finance_status != "approved":
        raise HTTPException(
            409,
            "Only an approved (Unpaid) request can be marked as paid."
            if msg.finance_status is None
            else f"This payment request was already {msg.finance_status}.",
        )

    # Read one byte past the cap so an oversized upload is caught without ever
    # holding the whole (potentially huge) body in memory.
    data = await proof.read(MAX_ATTACHMENT_BYTES + 1)
    if len(data) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(413, f"Proof photo is too large — the limit is {MAX_ATTACHMENT_BYTES // (1024 * 1024)} MB.")
    if not data:
        raise HTTPException(400, "A proof-of-payment photo is required to mark this as paid.")
    mime = _sniff_image_mime(data)
    if mime is None:
        raise HTTPException(415, "Proof must be an image (JPEG, PNG, GIF, or WEBP).")

    payer = db.get(models.Staff, me)
    if not payer:
        raise HTTPException(403, "This account is not linked to a staff record.")

    try:
        envelope = encrypt_bytes(data, conversation_id=msg.conversation_id, sender_id=msg.sender_id, max_len=MAX_ATTACHMENT_BYTES)
    except ChatCryptoError as exc:
        raise HTTPException(400, str(exc))

    msg.paid_proof_ciphertext = envelope
    msg.paid_proof_mime = mime
    msg.paid_by = me
    msg.paid_by_name = payer.name
    msg.paid_at = datetime.now(timezone.utc)
    msg.finance_status = "paid"
    db.commit()
    db.refresh(msg)

    try:
        _post_system_message(db, msg.conversation_id, me, "Payment Request Has Been Paid")
    except ChatCryptoError:
        pass

    return _to_out(msg)


@router.get("/{message_id}/proof")
def get_payment_request_proof(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """Stream the decrypted proof-of-payment photo. Same Accounts/Admin gate as
    the rest of this router (see main.py) — no participant check needed since
    that gate already covers who may reach this endpoint at all."""
    msg = db.get(models.ChatMessage, message_id)
    if not msg or msg.content_type != "payment" or msg.paid_proof_ciphertext is None:
        raise HTTPException(404, "No proof photo found for this payment request.")

    try:
        data = decrypt_bytes(msg.paid_proof_ciphertext, conversation_id=msg.conversation_id, sender_id=msg.sender_id)
    except ChatCryptoError:
        raise HTTPException(500, "This proof photo could not be decrypted.")

    return Response(
        content=data,
        media_type=msg.paid_proof_mime or "application/octet-stream",
        headers={
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "Cache-Control": "private, max-age=3600",
        },
    )
