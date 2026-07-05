import asyncio
import json
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, event_type: str, payload: dict = {}):
        if not self.active_connections:
            return
        message = json.dumps({"type": event_type, "payload": payload})
        dead = []
        for ws in self.active_connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active_connections.remove(ws)


manager = ConnectionManager()
_loop: asyncio.AbstractEventLoop | None = None


def set_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


def emit(event_type: str, payload: dict = {}) -> None:
    """Schedule a broadcast from any thread (sync route handlers included)."""
    if _loop is None or not _loop.is_running():
        return
    asyncio.run_coroutine_threadsafe(manager.broadcast(event_type, payload), _loop)
