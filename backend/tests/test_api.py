"""Routes de l'API, sans modele ni base de recherche : la reponse elle-meme (_query) est simulee."""

import pytest
from fastapi.testclient import TestClient

import api


@pytest.fixture
def client(monkeypatch):
    seen = []

    async def fake_query(req, request, x_client_id, x_session_id, skip_agent=False):
        seen.append(req)
        return api.QueryResponse(
            question=req.question, language=req.language, answered=False, answer=f"reponse ({req.language})",
            citations=[], sources_used=[], model="test", usage=api.Usage(),
        )

    monkeypatch.setattr(api, "_query", fake_query)
    monkeypatch.setattr(api.agent, "AGENT_ENABLED", False)
    monkeypatch.setattr(api.voice, "to_wolof", _async(lambda text: f"[wo] {text}"))
    monkeypatch.setattr(api.voice, "to_french", _async(lambda text, timeout=25: f"[fr] {text}"))
    # Sans lifespan (pas de « with ») : ni modele d'embedding ni base charges.
    test_client = TestClient(api.app)
    test_client.seen = seen
    return test_client


def _async(fn):
    async def wrapper(*args, **kwargs):
        return fn(*args, **kwargs)

    return wrapper


def test_question_language_overrides_interface(client):
    resp = client.post("/api/query", json={"question": "What is the population of Senegal?", "language": "fr"})
    assert resp.status_code == 200
    assert resp.json()["language"] == "en"
    assert client.seen[-1].language == "en"


def test_interface_language_kept_when_unsure(client):
    resp = client.post("/api/query", json={"question": "Dakar", "language": "en"})
    assert resp.json()["language"] == "en"


def test_wolof_question_with_french_interface(client):
    # Wolof : question traduite en francais pour la recherche, reponse traduite en wolof.
    resp = client.post("/api/query", json={"question": "Ñaata nit ñoo nekk ci Senegaal?", "language": "fr"})
    body = resp.json()
    assert body["language"] == "wo"
    assert body["question"] == "Ñaata nit ñoo nekk ci Senegaal?"
    assert body["answer"] == "[wo] reponse (fr)"
    assert client.seen[-1].question.startswith("[fr] ")


def test_stream_uses_question_language(client):
    resp = client.post("/api/query/stream", json={"question": "Quel est le taux de chômage ?", "language": "en"})
    last = resp.text.strip().splitlines()[-1]
    assert '"type": "done"' in last
    assert '"language": "fr"' in last


def test_transcribe_returns_spoken_language(client, monkeypatch):
    monkeypatch.setattr(api.voice, "transcribe", _async(lambda audio, filename, language: ("What about women?", "en")))
    resp = client.post(
        "/api/voice/transcribe", files={"audio": ("r.webm", b"audio", "audio/webm")}, data={"language": "fr"}
    )
    assert resp.json() == {"text": "What about women?", "language": "en"}


def test_invalid_language_rejected(client):
    assert client.post("/api/query", json={"question": "Bonjour", "language": "de"}).status_code == 422




def test_feedback_recorded(client, monkeypatch):
    received = {}
    monkeypatch.setattr(api.analytics, "log_feedback", lambda **kw: received.update(kw))
    resp = client.post(
        "/api/feedback",
        json={"question": "Population ?", "answer": "18 millions", "language": "fr", "rating": "down", "comment": "ancien"},
        headers={"X-Client-Id": "c1"},
    )
    assert resp.status_code == 204
    assert received["rating"] == -1 and received["comment"] == "ancien" and received["client_id"] == "c1"


def test_admin_feedback_requires_token(client, monkeypatch):
    monkeypatch.setattr(api.routes_admin, "ADMIN_TOKEN", "secret")
    assert client.get("/api/admin/feedback").status_code == 401
    monkeypatch.setattr(api.analytics, "recent_feedback", lambda *a, **kw: {"total": 0, "items": []})
    resp = client.get("/api/admin/feedback", headers={"Authorization": "Bearer secret"})
    assert resp.json() == {"total": 0, "items": []}
