"""Canaan Chat: direct and group conversations, messages (text, voice,
attachments, payment notes), group admin actions, the payment-request
workflow (peer → Accounts → paid with proof), owner view and room summon."""
import pytest

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200
WEBM = b"\x1aE\xdf\xa3" + b"\x00" * 200
PDF = b"%PDF-1.4\n" + b"0" * 200


@pytest.fixture(scope="module")
def people(api_as, staff):
    """Two staff members who chat, plus their API helpers."""
    return {
        "a": staff["Maintenance"], "b": staff["Accounts"],
        "A": api_as("Maintenance"), "B": api_as("Accounts"),
    }


@pytest.fixture(scope="module")
def direct(people):
    return people["A"].post("/chat/conversations/direct", json={"staff_id": people["b"].id})


@pytest.fixture()
def group(api, staff):
    return api.post("/chat/conversations/group", json={
        "title": "Pytest group", "member_ids": [staff["Maintenance"].id, staff["Accounts"].id],
    })


def test_direct_conversation_and_messages(people, direct):
    A, B = people["A"], people["B"]
    cid = direct["id"]
    assert A.post("/chat/conversations/direct", json={"staff_id": people["b"].id})["id"] == cid  # same thread
    msg = A.post(f"/chat/conversations/{cid}/messages", json={"text": "Hello"})
    assert [m["id"] for m in B.get(f"/chat/conversations/{cid}/messages")][-1] == msg["id"]
    assert B.get(f"/chat/conversations/{cid}")["id"] == cid
    B.post(f"/chat/conversations/{cid}/read", json={"message_id": msg["id"]})
    A.post(f"/chat/conversations/{cid}/typing", json={"typing": True})
    B.post(f"/chat/conversations/{cid}/mute", json={"muted": True})

    assert A.patch(f"/chat/messages/{msg['id']}", json={"text": "Hello there"})["text"] == "Hello there"
    B.patch(f"/chat/messages/{msg['id']}", json={"text": "hijack"}, expect=403)
    assert A.delete(f"/chat/messages/{msg['id']}")["deleted"] is True


def test_outsiders_cannot_read_a_conversation(api_as, direct):
    api_as("Auditor").get(f"/chat/conversations/{direct['id']}/messages", expect=(403, 404))


def test_voice_and_attachments(people, direct):
    A, B = people["A"], people["B"]
    cid = direct["id"]
    voice = A.post(f"/chat/conversations/{cid}/voice", files={"file": ("note.webm", WEBM, "audio/webm")},
                   data={"duration_ms": "1500"})
    assert B.get(f"/chat/messages/{voice['id']}/voice").content.startswith(b"\x1aE\xdf\xa3")
    A.post(f"/chat/conversations/{cid}/voice", files={"file": ("x.webm", b"not audio at all", "audio/webm")},
           data={"duration_ms": "10"}, expect=415)

    photo = A.post(f"/chat/conversations/{cid}/attachment", files={"file": ("bill.jpg", JPEG, "image/jpeg")})
    doc = A.post(f"/chat/conversations/{cid}/attachment", files={"file": ("bill.pdf", PDF, "application/pdf")})
    assert B.get(f"/chat/messages/{doc['id']}/attachment").content == PDF
    media = B.get(f"/chat/conversations/{cid}/media", params={"kind": "image"})
    assert photo["id"] in [m["id"] for m in media]


def test_group_admin_actions(api, group, staff):
    gid = group["id"]
    assert api.patch(f"/chat/conversations/{gid}", json={"title": "Renamed group"})["title"] == "Renamed group"
    api.post(f"/chat/conversations/{gid}/photo", files={"file": ("g.jpg", JPEG, "image/jpeg")})
    assert api.get(f"/chat/conversations/{gid}/photo").content == JPEG
    api.delete(f"/chat/conversations/{gid}/photo")
    api.post(f"/chat/conversations/{gid}/members", json={"member_ids": [staff["Auditor"].id]})
    detail = api.delete(f"/chat/conversations/{gid}/members/{staff['Auditor'].id}")
    assert staff["Auditor"].id not in [int(m["staff_id"]) for m in detail["members"]]


def test_payment_note_workflow(api, people, direct):
    """Peer approves the note → Accounts approves for payment → marked paid with a proof photo."""
    A, B = people["A"], people["B"]
    note = A.post(f"/chat/conversations/{direct['id']}/messages", json={
        "content_type": "payment", "amount": 1500, "note": "Tyre puncture", "text": "",
    })
    A.post(f"/chat/messages/{note['id']}/payment-status", json={"status": "approved"}, expect=403)  # own note
    assert B.post(f"/chat/messages/{note['id']}/payment-status", json={"status": "approved"})["payment_status"] == "approved"

    decided = api.post(f"/payment-requests/{note['id']}/decision", json={"status": "approved"})
    assert decided["finance_status"] == "approved"
    api.post(f"/payment-requests/{note['id']}/decision", json={"status": "approved"}, expect=409)
    paid = api.post(f"/payment-requests/{note['id']}/mark-paid", files={"proof": ("proof.jpg", JPEG, "image/jpeg")})
    assert paid["finance_status"] == "paid"
    assert api.get(f"/payment-requests/{note['id']}/proof").content == JPEG


def test_owner_view(api, db, direct):
    import settings_store
    settings_store.set_chat_owner_view_password(db, "pytest-owner-pass")
    api.post("/chat/owner-view/unlock", json={"password": "wrong-password"}, expect=401)
    token = api.post("/chat/owner-view/unlock", json={"password": "pytest-owner-pass"})["token"]
    owner = {"X-Owner-View-Token": token}
    assert direct["id"] in [c["id"] for c in api.get("/chat/owner-view/conversations", headers=owner)]
    api.get(f"/chat/owner-view/conversations/{direct['id']}/messages", headers=owner)
    api.post("/chat/owner-view/change-password", json={
        "current_password": "pytest-owner-pass", "new_password": "pytest-owner-pass-2"})
    api.post("/chat/owner-view/lock", headers=owner)
    api.get("/chat/owner-view/conversations", headers=owner, expect=401)


def test_room_summon(api, staff, group):
    api.post("/room-summon", json={"target_type": "user", "target_id": staff["Maintenance"].id})
    api.post("/room-summon", json={"target_type": "group", "target_id": group["id"]})
    assert api.get("/room-summon")
