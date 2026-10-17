"""To-do — a private task list per staff member (Topbar's To-do button, next
to Notes). Strictly owner-only, the same as Notes: every route scopes to the
caller, and a task belonging to anyone else answers 404 (not 403), so even
Admin can't read or detect someone else's tasks.

Abuse limits (tasks are tiny, so these are simpler than Notes'):
- MAX_TODOS per person, done ones included — "Clear completed" frees room.
- A per-person write rate limit (WRITES_PER_MINUTE), well above what ticking
  tasks off by hand produces.
- Request bodies over MAX_REQUEST_BYTES are refused before being read (see
  the notes_request_size middleware in main.py, which covers /todos too).
"""
import threading
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from security import TokenUser, get_current_user

router = APIRouter(prefix="/todos", tags=["To-do"])

MAX_TODOS = 300
WRITES_PER_MINUTE = 120
MAX_REQUEST_BYTES = 16_000          # enforced in main.py before the body is read

_rate_lock = threading.Lock()
_rate: dict[int, list] = {}  # staff_id -> [window_minute, writes_in_window]


def _me(user: TokenUser) -> int:
    if user.id is None:
        raise HTTPException(400, "To-do needs a signed-in staff account.")
    return user.id


def _take_rate(me: int) -> None:
    minute = int(time.time() // 60)
    with _rate_lock:
        window, used = _rate.get(me, [minute, 0])
        if window != minute:
            window, used = minute, 0
        allowed = used < WRITES_PER_MINUTE
        if allowed:
            _rate[me] = [window, used + 1]
        if len(_rate) > 2_000:
            for k in [k for k, (w, _) in _rate.items() if w != minute]:
                del _rate[k]
    if not allowed:
        raise HTTPException(429, "You're updating tasks too quickly. Please wait a moment.")


def _usage(db: Session, me: int) -> dict:
    count = db.query(func.count(models.Todo.id)).filter(models.Todo.staff_id == me).scalar() or 0
    return {"count": int(count), "max_todos": MAX_TODOS}


def _own_todo(db: Session, todo_id: int, me: int) -> models.Todo:
    todo = db.query(models.Todo).filter(models.Todo.id == todo_id, models.Todo.staff_id == me).first()
    if not todo:
        raise HTTPException(404, "Task not found.")
    return todo


@router.get("", response_model=schemas.TodoListOut)
def list_todos(db: Session = Depends(get_db), user: TokenUser = Depends(get_current_user)):
    """The caller's tasks — open ones first (important, then by due date),
    then done ones, most recently finished first."""
    me = _me(user)
    todos = (
        db.query(models.Todo)
        .filter(models.Todo.staff_id == me)
        .order_by(
            models.Todo.done.asc(),
            models.Todo.important.desc(),
            models.Todo.due_date.is_(None).asc(),
            models.Todo.due_date.asc(),
            models.Todo.done_at.desc(),
            models.Todo.id.desc(),
        )
        .all()
    )
    return {"items": todos, "usage": _usage(db, me)}


@router.post("", response_model=schemas.TodoOut, status_code=201)
def create_todo(payload: schemas.TodoCreate, db: Session = Depends(get_db),
                user: TokenUser = Depends(get_current_user)):
    me = _me(user)
    _take_rate(me)
    # Lock this person's staff row so two simultaneous creates can't both
    # pass the count check below.
    db.query(models.Staff.id).filter(models.Staff.id == me).with_for_update().first()
    if db.query(func.count(models.Todo.id)).filter(models.Todo.staff_id == me).scalar() >= MAX_TODOS:
        db.rollback()
        raise HTTPException(400, f"You can keep up to {MAX_TODOS} tasks. Clear completed ones to add more.")
    now = datetime.now(timezone.utc)
    todo = models.Todo(staff_id=me, title=payload.title, due_date=payload.due_date,
                       important=payload.important, created_at=now, updated_at=now)
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return todo


# Registered before /{todo_id} so "completed" is never read as an id.
@router.delete("/completed", response_model=schemas.TodoUsageOut)
def clear_completed(db: Session = Depends(get_db), user: TokenUser = Depends(get_current_user)):
    me = _me(user)
    _take_rate(me)
    db.query(models.Todo).filter(models.Todo.staff_id == me, models.Todo.done.is_(True)).delete(synchronize_session=False)
    db.commit()
    return _usage(db, me)


@router.patch("/{todo_id}", response_model=schemas.TodoOut)
def update_todo(todo_id: int, payload: schemas.TodoUpdate, db: Session = Depends(get_db),
                user: TokenUser = Depends(get_current_user)):
    me = _me(user)
    _take_rate(me)
    todo = _own_todo(db, todo_id, me)
    sent = payload.model_fields_set
    if "title" in sent and payload.title is not None:
        todo.title = payload.title
    if "important" in sent and payload.important is not None:
        todo.important = payload.important
    if "due_date" in sent:
        todo.due_date = payload.due_date  # null clears it
    if "done" in sent and payload.done is not None and payload.done != todo.done:
        todo.done = payload.done
        todo.done_at = datetime.now(timezone.utc) if payload.done else None
    todo.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(todo)
    return todo


@router.delete("/{todo_id}", response_model=schemas.TodoUsageOut)
def delete_todo(todo_id: int, db: Session = Depends(get_db), user: TokenUser = Depends(get_current_user)):
    me = _me(user)
    _take_rate(me)
    db.delete(_own_todo(db, todo_id, me))
    db.commit()
    return _usage(db, me)
