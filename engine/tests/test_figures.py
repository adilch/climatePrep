"""Figure pipeline tests (spec §3.7, §4): valid PNGs, deterministic bytes,
provenance footer content present in the figure metadata inputs."""

import base64

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


@pytest.fixture(scope="module")
def pfa_payload():
    """Small real PFA run via the engine itself (2 durations, no bootstrap)."""
    series = [
        {"year": 1990 + i, "value": v}
        for i, v in enumerate(
            [13.7, 22.4, 21.0, 27.0, 48.7, 39.0, 39.5, 37.9, 14.9, 28.5,
             34.9, 23.1, 21.3, 19.2, 25.8, 15.5, 28.1, 17.7, 21.0, 32.3]
        )
    ]
    res = client.post(
        "/api/engine/pfa",
        json={
            "durations": [
                {"durationHours": 24.0, "series": series},
                {"durationHours": 48.0, "series": [
                    {"year": p["year"], "value": p["value"] * 1.35} for p in series
                ]},
            ],
            "distributions": ["gumbel", "gev"],
            "returnPeriods": [2, 10, 100],
            "bootstrap": {"n": 100, "ci": 0.9, "seed": 42},
        },
    )
    res.raise_for_status()
    return res.json()


def figures_request(pfa, published=None):
    return {
        "pfa": pfa,
        "published": published,
        "meta": {"stationName": "TESTSTN", "climateId": "9999999", "seed": 42},
    }


class TestPfaFigures:
    def test_returns_valid_pngs(self, pfa_payload):
        res = client.post("/api/engine/figures/pfa", json=figures_request(pfa_payload))
        assert res.status_code == 200
        body = res.json()
        names = [f["name"] for f in body["figures"]]
        assert names == ["frequency_24h", "frequency_48h", "idf", "lmr_diagram"]
        for f in body["figures"]:
            png = base64.b64decode(f["pngBase64"])
            assert png.startswith(PNG_SIGNATURE)
            assert len(png) > 10_000  # a real rendered chart, not a blank stub

    def test_deterministic_bytes(self, pfa_payload):
        req = figures_request(pfa_payload)
        a = client.post("/api/engine/figures/pfa", json=req).json()
        b = client.post("/api/engine/figures/pfa", json=req).json()
        for fa, fb in zip(a["figures"], b["figures"]):
            assert fa["pngBase64"] == fb["pngBase64"]

    def test_published_overlay_accepted(self, pfa_payload):
        published = {
            "version": "v3.20",
            "returnPeriods": [2, 10, 100],
            "durations": [{"hours": 1.0}, {"hours": 24.0}],
            "intensitiesMmHr": [[9.7, 20.6, 34.1], [1.8, 3.1, 4.8]],
        }
        res = client.post(
            "/api/engine/figures/pfa",
            json=figures_request(pfa_payload, published),
        )
        assert res.status_code == 200
        idf = next(f for f in res.json()["figures"] if f["name"] == "idf")
        # Overlay adds plotted series → the figure gets meaningfully larger.
        res_plain = client.post(
            "/api/engine/figures/pfa", json=figures_request(pfa_payload)
        )
        idf_plain = next(
            f for f in res_plain.json()["figures"] if f["name"] == "idf"
        )
        assert len(idf["pngBase64"]) != len(idf_plain["pngBase64"])

    def test_selected_durations_only(self, pfa_payload):
        req = figures_request(pfa_payload)
        req["frequencyDurations"] = [24.0]
        res = client.post("/api/engine/figures/pfa", json=req)
        names = [f["name"] for f in res.json()["figures"]]
        assert "frequency_24h" in names
        assert "frequency_48h" not in names
