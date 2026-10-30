import io, json, wave
from unittest.mock import patch
import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from meetings.models import Meeting, Chunk
from meetings.auth import issue
from meetings import storage
from meetings.pipeline import process


@pytest.fixture
def client(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    settings.KURA_BOT_TOKEN = "test-bot-credential"
    settings.S3_BUCKET = ""
    u = User.objects.create_user(
        username="owner@example.test", password="test-password-only"
    )
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION="Bearer " + issue(u))
    c.owner = u
    return c


def new(client, **kw):
    import uuid

    return client.post(
        "/api/meetings",
        {
            "client_id": str(uuid.uuid4()),
            "title": "Test meeting",
            "source": "upload",
            **kw,
        },
        format="json",
    )


def wav():
    b = io.BytesIO()
    with wave.open(b, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(b"\0\0" * 16000)
    return b.getvalue()


@pytest.mark.django_db
def test_owner_isolation(client):
    id = new(client).data["id"]
    other = User.objects.create_user(username="other@example.test")
    client.credentials(HTTP_AUTHORIZATION="Bearer " + issue(other))
    assert client.get("/api/meetings").data == []
    assert client.get(f"/api/meetings/{id}").status_code == 404
    assert client.delete(f"/api/meetings/{id}").status_code == 404


@pytest.mark.django_db
def test_chunk_retries_and_integrity(client):
    id = new(client).data["id"]
    url = f"/api/meetings/{id}/chunks/0"
    assert (
        client.put(url, b"abc", content_type="application/octet-stream").status_code
        == 200
    )
    assert (
        client.put(url, b"abc", content_type="application/octet-stream").status_code
        == 200
    )
    assert Chunk.objects.count() == 1
    assert (
        client.put(url, b"changed", content_type="application/octet-stream").status_code
        == 400
    )
    assert client.post(f"/api/meetings/{id}/finish", {"chunks": 2}).status_code == 400
    assert client.post(f"/api/meetings/{id}/finish", {"chunks": 1}).status_code == 200
    assert client.post(f"/api/meetings/{id}/finish", {"chunks": 1}).status_code == 200
    assert (
        client.put(
            f"/api/meetings/{id}/chunks/1",
            b"x",
            content_type="application/octet-stream",
        ).status_code
        == 400
    )


@pytest.mark.django_db
def test_meet_url_and_capacity(client):
    assert (
        new(
            client, source="meet", meet_url="https://localhost/abc-defg-hij"
        ).status_code
        == 400
    )
    r = new(client, source="meet", meet_url="https://meet.google.com/meet/abc-defg-hij")
    assert (
        r.status_code == 201
        and r.data["meet_url"] == "https://meet.google.com/abc-defg-hij"
    )
    assert (
        new(
            client, source="meet", meet_url="https://meet.google.com/abc-defg-hij"
        ).status_code
        == 409
    )


@pytest.mark.django_db
def test_client_id_idempotency(client):
    import uuid

    id = str(uuid.uuid4())
    a = new(client, client_id=id)
    b = new(client, client_id=id)
    assert a.data["id"] == b.data["id"]


@pytest.mark.django_db
def test_internal_auth_and_late_callbacks(client):
    r = new(client, source="meet", meet_url="https://meet.google.com/abc-defg-hij")
    id = r.data["id"]
    assert client.post("/api/internal/claim").status_code == 403
    client.credentials(HTTP_AUTHORIZATION="Bearer test-bot-credential")
    assert client.post("/api/internal/claim").data["id"] == id
    Meeting.objects.filter(pk=id).update(status="deleting")
    client.post(
        f"/api/internal/meetings/{id}/state", {"status": "recording"}, format="json"
    )
    assert Meeting.objects.get(pk=id).status == "deleting"
    assert client.post(f"/api/internal/meetings/{id}/heartbeat").data["stop"]


@pytest.mark.django_db
def test_logout_revokes_token(client):
    assert client.post("/api/logout").status_code == 200
    assert client.get("/api/meetings").status_code == 401


@pytest.mark.django_db
def test_pipeline_produces_audio_timestamps_notes(client):
    r = new(client)
    id = r.data["id"]
    client.put(
        f"/api/meetings/{id}/chunks/0", wav(), content_type="application/octet-stream"
    )
    client.post(f"/api/meetings/{id}/finish", {"chunks": 1})
    m = Meeting.objects.get(pk=id)
    m.status = "processing"
    m.save()

    class Result:
        def __init__(self, result):
            self.result = result

        def raise_for_status(self):
            pass

        def json(self):
            return self.result

    class Tarka:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            pass

        def post(self, path, **kw):
            if "transcriptions" in path:
                return Result(
                    {
                        "text": "We will meet on Monday.",
                        "segments": [
                            {"start": 0, "end": 1, "text": "We will meet on Monday."}
                        ],
                    }
                )
            return Result(
                {
                    "choices": [
                        {
                            "message": {
                                "content": json.dumps(
                                    {
                                        "summary": "The next meeting is Monday.",
                                        "decisions": ["Meet on Monday."],
                                        "action_items": [],
                                    }
                                )
                            }
                        }
                    ]
                }
            )

    with patch("meetings.pipeline.httpx.Client", return_value=Tarka()):
        process(m)
    m.refresh_from_db()
    assert m.status == "ready"
    assert m.duration > 0
    assert m.segments[0]["start"] == 0
    assert m.notes["summary"] == "The next meeting is Monday."
    assert storage.get(m.audio_key)
    detail = client.get(f"/api/meetings/{id}").data
    assert "audio_url" in detail
    client.delete(f"/api/meetings/{id}")
    from urllib.parse import urlsplit

    assert client.get(urlsplit(detail["audio_url"]).path).status_code == 404
