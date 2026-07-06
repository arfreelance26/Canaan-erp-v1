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

    async def connect(self, websocket: WebSocket) -> bool:
        if len(self.active_connections) >= MAX_CONNECTIONS:
            await websocket.close(code=1013)  # try again later
            return False
        await websocket.accept()
        self.active_connections.append(websocket)
        return True

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

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
