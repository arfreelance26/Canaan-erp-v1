"""
Envelope encryption for Canaan Chat message bodies.

Every message body is encrypted with AES-256-GCM *before* it reaches the
database, so the `chat_messages` table — and therefore every backup, replica and
mysqldump — holds only ciphertext. GCM is an AEAD mode: it provides
confidentiality *and* integrity, so a tampered or truncated row fails to decrypt
rather than silently returning corrupted text.

Stored envelope layout (one BLOB column, so a row can never carry a nonce that
belongs to a different ciphertext):

    byte 0      envelope version (currently 1)
    byte 1      key id  — which key in the keyring encrypted this row
    bytes 2..13 96-bit random nonce
    bytes 14..  AES-GCM ciphertext || 128-bit auth tag

Associated data (authenticated but not encrypted) binds each ciphertext to the
conversation and sender it was written for. Moving a row to another conversation,
or rewriting its sender_id, makes it undecryptable instead of letting an attacker
with DB write access relocate somebody's message into a thread they can read.

Key configuration (first match wins):

    CHAT_ENCRYPTION_KEYS   "1:<base64>,2:<base64>"  keyring; supports rotation
    CHAT_ENCRYPTION_KEY_ID "2"                      which key encrypts new rows
    CHAT_ENCRYPTION_KEY    "<base64>"               single key, becomes id 1

Each key is 32 raw bytes, base64- or hex-encoded. Generate one with:

    python -c "import base64,os; print(base64.b64encode(os.urandom(32)).decode())"

To rotate: add a new id to CHAT_ENCRYPTION_KEYS, point CHAT_ENCRYPTION_KEY_ID at
it, and restart. Old messages keep decrypting under their original key id; only
new writes use the new key. Never remove a key that still has rows.

If nothing is configured, a key is derived from SECRET_KEY via HKDF so local
development works out of the box. That is refused under APP_ENV=production,
because it would tie message confidentiality to the JWT signing key — one leak
would then expose both sessions and chat history.
"""
import base64
import binascii
import os
import warnings

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from dotenv import load_dotenv

load_dotenv()

ENVELOPE_VERSION = 1
NONCE_LEN = 12          # 96 bits — the size AES-GCM is defined for
KEY_LEN = 32            # AES-256
HEADER_LEN = 2          # version + key id
MIN_ENVELOPE_LEN = HEADER_LEN + NONCE_LEN + 16   # + GCM tag

# Hard ceiling on a single message body. Keeps one client from parking megabytes
# of ciphertext in a row and blowing out the read path for everyone in the thread.
MAX_PLAINTEXT_BYTES = 16_000

# Ceiling for a voice note's raw audio bytes — several minutes of compressed
# speech (Opus/AAC) comfortably fits well under this.
MAX_VOICE_BYTES = 8 * 1024 * 1024

# Ceiling for an image/file attachment — the same standard cap every other
# upload endpoint in this app uses (see files.py MAX_FILE_SIZE), so "send a
# photo" in chat isn't more restrictive than uploading one anywhere else.
# The chat_messages.ciphertext column is LONGBLOB, so this fits with room
# to spare for the envelope header.
MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

_APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
_IS_PRODUCTION = _APP_ENV in ("production", "prod")


class ChatCryptoError(Exception):
    """Raised when a message body cannot be encrypted or decrypted."""


def _decode_key_material(raw: str) -> bytes:
    """Accept a 32-byte key as base64 or hex; reject anything else loudly."""
    s = raw.strip()
    for decoder in (base64.b64decode, lambda v: binascii.unhexlify(v.encode())):
        try:
            key = decoder(s)
        except Exception:
            continue
        if len(key) == KEY_LEN:
            return key
    raise ChatCryptoError(
        "Chat encryption keys must decode to exactly 32 bytes (base64 or hex). "
        'Generate one with: python -c "import base64,os; '
        'print(base64.b64encode(os.urandom(32)).decode())"'
    )


def _derive_dev_key() -> bytes:
    """Development fallback — HKDF-SHA256 over SECRET_KEY with a chat-only info label."""
    secret = os.getenv("SECRET_KEY") or "canaan-erp-development-secret"
    return HKDF(
        algorithm=hashes.SHA256(),
        length=KEY_LEN,
        salt=b"canaan.chat.envelope.v1",
        info=b"chat-message-body-encryption",
    ).derive(secret.encode())


def _load_keyring() -> tuple[dict[int, bytes], int]:
    """Build {key_id: key_bytes} plus the id new messages are encrypted under."""
    multi = (os.getenv("CHAT_ENCRYPTION_KEYS") or "").strip()
    if multi:
        keyring: dict[int, bytes] = {}
        for entry in multi.split(","):
            entry = entry.strip()
            if not entry:
                continue
            if ":" not in entry:
                raise ChatCryptoError(
                    'CHAT_ENCRYPTION_KEYS entries must look like "1:<base64 key>". '
                    f"Could not parse: {entry[:12]}..."
                )
            id_part, key_part = entry.split(":", 1)
            try:
                key_id = int(id_part.strip())
            except ValueError:
                raise ChatCryptoError(f"CHAT_ENCRYPTION_KEYS key id must be an integer, got {id_part!r}")
            if not 0 <= key_id <= 255:
                raise ChatCryptoError("CHAT_ENCRYPTION_KEYS key ids must be between 0 and 255.")
            keyring[key_id] = _decode_key_material(key_part)
        if not keyring:
            raise ChatCryptoError("CHAT_ENCRYPTION_KEYS is set but contains no usable keys.")

        active_env = (os.getenv("CHAT_ENCRYPTION_KEY_ID") or "").strip()
        if active_env:
            try:
                active = int(active_env)
            except ValueError:
                raise ChatCryptoError("CHAT_ENCRYPTION_KEY_ID must be an integer.")
            if active not in keyring:
                raise ChatCryptoError(
                    f"CHAT_ENCRYPTION_KEY_ID={active} is not present in CHAT_ENCRYPTION_KEYS."
                )
        else:
            active = max(keyring)
        return keyring, active

    single = (os.getenv("CHAT_ENCRYPTION_KEY") or "").strip()
    if single:
        return {1: _decode_key_material(single)}, 1

    if _IS_PRODUCTION:
        raise RuntimeError(
            "Canaan Chat encryption is not configured and APP_ENV=production. Refusing to "
            "start: deriving the message key from SECRET_KEY would make one leaked signing "
            "key expose the entire chat history. Set CHAT_ENCRYPTION_KEY in the environment "
            '(python -c "import base64,os; print(base64.b64encode(os.urandom(32)).decode())").'
        )
    warnings.warn(
        "CHAT_ENCRYPTION_KEY is not set — deriving a development chat key from SECRET_KEY. "
        "Set CHAT_ENCRYPTION_KEY before storing real conversations.",
        stacklevel=2,
    )
    return {0: _derive_dev_key()}, 0


_KEYRING, _ACTIVE_KEY_ID = _load_keyring()
_CIPHERS: dict[int, AESGCM] = {kid: AESGCM(key) for kid, key in _KEYRING.items()}


def _aad(conversation_id: int, sender_id: int | None) -> bytes:
    """Associated data — pins a ciphertext to its conversation and author."""
    return f"canaan.chat.v1|conv={int(conversation_id)}|sender={'' if sender_id is None else int(sender_id)}".encode()


def _self_test() -> None:
    """Round-trip a canary value through the active key at import time.

    A misconfigured key (truncated, wrong encoding, active-id pointing at a key
    that isn't actually in the keyring) would otherwise stay silent until the
    first real message send or read, and surface only as an opaque request
    failure. Failing here instead means a bad deploy never comes up serving
    chat at all — the same fail-fast contract security.py already applies to
    SECRET_KEY.
    """
    canary = b"canaan-chat-self-test"
    nonce = os.urandom(NONCE_LEN)
    try:
        ciphertext = _CIPHERS[_ACTIVE_KEY_ID].encrypt(nonce, canary, _aad(0, None))
        roundtrip = _CIPHERS[_ACTIVE_KEY_ID].decrypt(nonce, ciphertext, _aad(0, None))
    except Exception as exc:  # pragma: no cover — defensive; a bad key should never reach here
        raise RuntimeError(f"Canaan Chat encryption self-test failed: {exc}") from exc
    if roundtrip != canary:
        raise RuntimeError("Canaan Chat encryption self-test failed: round-trip mismatch.")


_self_test()


def encrypt_bytes(
    data: bytes, *, conversation_id: int, sender_id: int | None, max_len: int = MAX_PLAINTEXT_BYTES
) -> bytes:
    """Encrypt raw bytes into a stored envelope. `max_len` lets a caller (e.g. voice
    notes) apply its own size ceiling instead of the text-message default."""
    if data is None:
        raise ChatCryptoError("Payload cannot be null.")
    if len(data) > max_len:
        raise ChatCryptoError(f"Payload is too large (limit {max_len} bytes).")

    nonce = os.urandom(NONCE_LEN)
    ciphertext = _CIPHERS[_ACTIVE_KEY_ID].encrypt(
        nonce, data, _aad(conversation_id, sender_id)
    )
    return bytes([ENVELOPE_VERSION, _ACTIVE_KEY_ID]) + nonce + ciphertext


def decrypt_bytes(envelope: bytes | None, *, conversation_id: int, sender_id: int | None) -> bytes:
    """Decrypt a stored envelope back to raw bytes. Raises ChatCryptoError on tampering
    or a missing key."""
    if not envelope:
        return b""
    blob = bytes(envelope)
    if len(blob) < MIN_ENVELOPE_LEN:
        raise ChatCryptoError("Stored message is truncated or not an encrypted envelope.")

    version, key_id = blob[0], blob[1]
    if version != ENVELOPE_VERSION:
        raise ChatCryptoError(f"Unsupported chat envelope version {version}.")
    cipher = _CIPHERS.get(key_id)
    if cipher is None:
        raise ChatCryptoError(
            f"No chat encryption key with id {key_id} is configured — it is still needed to "
            "read existing messages. Restore it in CHAT_ENCRYPTION_KEYS."
        )

    nonce = blob[HEADER_LEN:HEADER_LEN + NONCE_LEN]
    ciphertext = blob[HEADER_LEN + NONCE_LEN:]
    try:
        return cipher.decrypt(nonce, ciphertext, _aad(conversation_id, sender_id))
    except InvalidTag:
        raise ChatCryptoError(
            "Message failed its integrity check — the stored row was altered, or it belongs "
            "to a different conversation/sender than the one it is filed under."
        )


def encrypt_message(plaintext: str, *, conversation_id: int, sender_id: int | None) -> bytes:
    """Encrypt a text message body into its stored envelope. Raises ChatCryptoError if too long."""
    if plaintext is None:
        raise ChatCryptoError("Message body cannot be null.")
    return encrypt_bytes(
        plaintext.encode("utf-8"), conversation_id=conversation_id, sender_id=sender_id,
        max_len=MAX_PLAINTEXT_BYTES,
    )


def decrypt_message(envelope: bytes | None, *, conversation_id: int, sender_id: int | None) -> str:
    """Decrypt a stored text envelope. Raises ChatCryptoError on tampering or a missing key."""
    return decrypt_bytes(envelope, conversation_id=conversation_id, sender_id=sender_id).decode("utf-8")


def safe_decrypt(envelope: bytes | None, *, conversation_id: int, sender_id: int | None) -> str:
    """Decrypt for list/read paths, degrading to a placeholder instead of failing the request.

    One unreadable row (a key removed, a row hand-edited) should not take down an
    entire conversation load, so callers that render history use this variant.
    """
    try:
        return decrypt_message(envelope, conversation_id=conversation_id, sender_id=sender_id)
    except ChatCryptoError:
        return "[unreadable message]"


def active_key_id() -> int:
    """Key id new messages are written under — surfaced for ops/health checks."""
    return _ACTIVE_KEY_ID
