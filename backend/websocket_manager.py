import asyncio
import json
import time
from fastapi import WebSocket

MAX_CONNECTIONS = 500          # hard cap — protects the server from connection floods
DEBOUNCE_SECONDS = 0.25        # coalesce bursts of writes into one broadcast per resource


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self._pending: dict[str, dict] = {}   # key -> latest payload (coalesced)
        self._flush_scheduled = False
        # user_id -> that person's open sockets (several: multiple tabs/devices).
        # Chat delivery is addressed through this map so a message is only ever
        # written to the sockets of its own participants.
        self._by_user: dict[int, set[WebSocket]] = {}
        # user_id -> epoch seconds of their most recent disconnect. Powers the
        # "last seen" label for people who are currently offline. In-memory only:
        # a server restart forgets it (everyone simply shows no last-seen until
        # they next connect), which is an acceptable trade for zero schema churn.
        self.last_seen: dict[int, float] = {}

    def online_user_ids(self) -> list[int]:
        return list(self._by_user.keys())

    def note_last_seen(self, user_id: int) -> None:
        self.last_seen[int(user_id)] = time.time()

    async def connect(self, websocket: WebSocket, user_id: int | None = None) -> bool:
        if len(self.active_connections) >= MAX_CONNECTIONS:
            await websocket.close(code=1013)  # try again later
            return False
        await websocket.accept()
        self.active_connections.append(websocket)
        if user_id is not None:
            self._by_user.setdefault(int(user_id), set()).add(websocket)
        return True

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        for uid, sockets in list(self._by_user.items()):
            sockets.discard(websocket)
            if not sockets:
                del self._by_user[uid]

    def is_online(self, user_id: int) -> bool:
        return bool(self._by_user.get(int(user_id)))

    async def send_to_users(self, user_ids, event_type: str, payload: dict | None = None):
        """Deliver an event to specific users only — never a fan-out to everyone.

        Sent immediately rather than through the debounce buffer: coalescing is right
        for "this resource changed, refetch", but it would drop chat messages, which
        each carry unique content that must arrive.
        """
        targets: set[WebSocket] = set()
        for uid in user_ids:
            if uid is None:
                continue
            targets |= self._by_user.get(int(uid), set())
        if not targets:
            return
        message = json.dumps({"type": event_type, "payload": payload or {}, "ts": time.time()})
        dead = []
        for ws in targets:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def broadcast(self, event_type: str, payload: dict | None = None):
        if not self.active_connections:
            return
        message = json.dumps({"type": event_type, "payload": payload or {}, "ts": time.time()})
        dead = []
        for ws in self.active_connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    # -- Debounced emit: multiple writes to the same resource within the window
    #    collapse into a single broadcast, preventing client refetch storms. -----

    def emit_soon(self, event_type: str, payload: dict | None = None) -> None:
        """Queue an event for broadcast (must be called from the event loop thread)."""
        key = f"{event_type}:{(payload or {}).get('resource', '')}"
        self._pending[key] = {"type": event_type, "payload": payload or {}}
        if not self._flush_scheduled:
            self._flush_scheduled = True
            loop = _loop or asyncio.get_event_loop()
            loop.call_later(DEBOUNCE_SECONDS, lambda: asyncio.ensure_future(self._flush()))

    async def _flush(self):
        self._flush_scheduled = False
        pending, self._pending = self._pending, {}
        for item in pending.values():
            await self.broadcast(item["type"], item["payload"])


manager = ConnectionManager()
_loop: asyncio.AbstractEventLoop | None = None


def set_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


def emit(event_type: str, payload: dict | None = None) -> None:
    """Schedule a broadcast from any thread (sync route handlers included)."""
    if _loop is None or not _loop.is_running():
        return
    _loop.call_soon_threadsafe(manager.emit_soon, event_type, payload)


def emit_to_users(user_ids, event_type: str, payload: dict | None = None) -> None:
    """Push an event to specific users from a sync route handler.

    Used by chat so a message reaches its participants' sockets and nobody else's.
    """
    if _loop is None or not _loop.is_running():
        return
    recipients = [int(u) for u in user_ids if u is not None]
    if not recipients:
        return
    _loop.call_soon_threadsafe(
        lambda: asyncio.ensure_future(manager.send_to_users(recipients, event_type, payload))
    )
