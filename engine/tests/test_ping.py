from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_ping():
    r = client.get("/api/engine/ping")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["service"] == "climateprep-engine"
    assert "engineVersion" in body
    assert body["python"].startswith("3.12")
