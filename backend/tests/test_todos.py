"""To-do (Topbar → To-do): a strictly private task list per staff member."""
import pytest

import models
from routers import todos as todos_router


@pytest.fixture()
def me(auth):
    return auth("Maintenance")


@pytest.fixture(autouse=True)
def _clean(db, staff):
    yield
    db.query(models.Todo).filter(models.Todo.staff_id.in_([p.id for p in staff.values()])).delete(synchronize_session=False)
    db.commit()
    todos_router._rate.clear()


def _add(client, headers, **body):
    res = client.post("/todos", headers=headers, json={"title": "Task", **body})
    assert res.status_code == 201, res.text
    return res.json()


def test_create_and_list(client, me):
    todo = _add(client, me, title="  Call   the   tyre vendor  ", due_date="2026-11-01", important=True)
    assert todo["title"] == "Call the tyre vendor"  # whitespace collapsed
    assert todo["done"] is False and todo["important"] is True
    body = client.get("/todos", headers=me).json()
    assert [t["id"] for t in body["items"]] == [todo["id"]]
    assert body["usage"] == {"count": 1, "max_todos": todos_router.MAX_TODOS}


@pytest.mark.parametrize("title", ["", "   ", "x" * 301])
def test_bad_titles_are_refused(client, me, title):
    assert client.post("/todos", headers=me, json={"title": title}).status_code == 422


def test_order_open_first_then_important_then_due_date(client, me):
    later = _add(client, me, title="later", due_date="2026-12-01")
    sooner = _add(client, me, title="sooner", due_date="2026-11-01")
    undated = _add(client, me, title="undated")
    starred = _add(client, me, title="starred", important=True)
    done = _add(client, me, title="done")
    client.patch(f"/todos/{done['id']}", headers=me, json={"done": True})
    order = [t["title"] for t in client.get("/todos", headers=me).json()["items"]]
    assert order == ["starred", "sooner", "later", "undated", "done"]
    assert {later["id"], sooner["id"], undated["id"], starred["id"]}  # all created


def test_done_and_undo_set_and_clear_done_at(client, me):
    todo = _add(client, me)
    done = client.patch(f"/todos/{todo['id']}", headers=me, json={"done": True}).json()
    assert done["done"] is True and done["done_at"]
    undone = client.patch(f"/todos/{todo['id']}", headers=me, json={"done": False}).json()
    assert undone["done"] is False and undone["done_at"] is None


def test_rename_keeps_due_date_and_null_clears_it(client, me):
    todo = _add(client, me, due_date="2026-11-05")
    renamed = client.patch(f"/todos/{todo['id']}", headers=me, json={"title": "Renamed"}).json()
    assert renamed["title"] == "Renamed" and renamed["due_date"] == "2026-11-05"
    cleared = client.patch(f"/todos/{todo['id']}", headers=me, json={"due_date": None}).json()
    assert cleared["due_date"] is None


def test_tasks_are_private_even_from_admin(client, me, auth, builtin_admin_headers):
    todo = _add(client, me)
    admin = auth("Admin")
    assert client.get("/todos", headers=admin).json()["items"] == []
    assert client.patch(f"/todos/{todo['id']}", headers=admin, json={"done": True}).status_code == 404
    assert client.delete(f"/todos/{todo['id']}", headers=admin).status_code == 404
    assert client.get("/todos", headers=builtin_admin_headers).status_code == 400
    assert client.get("/todos").status_code == 401


def test_delete_and_clear_completed(client, me):
    a, b, c = (_add(client, me, title=t) for t in ("a", "b", "c"))
    client.patch(f"/todos/{a['id']}", headers=me, json={"done": True})
    client.patch(f"/todos/{b['id']}", headers=me, json={"done": True})
    assert client.delete("/todos/completed", headers=me).json()["count"] == 1
    assert client.delete(f"/todos/{c['id']}", headers=me).json()["count"] == 0


def test_oversized_request_is_refused_before_reading(client, me):
    res = client.post("/todos", headers=me, content=b'{"title":"' + b"x" * 20_000 + b'"}')
    assert res.status_code == 413


def test_task_limit(client, me, monkeypatch):
    monkeypatch.setattr(todos_router, "MAX_TODOS", 2)
    _add(client, me)
    _add(client, me)
    assert client.post("/todos", headers=me, json={"title": "one too many"}).status_code == 400


def test_write_rate_limit(client, me, monkeypatch):
    monkeypatch.setattr(todos_router, "WRITES_PER_MINUTE", 3)
    statuses = [client.post("/todos", headers=me, json={"title": f"t{i}"}).status_code for i in range(4)]
    assert statuses == [201, 201, 201, 429]
