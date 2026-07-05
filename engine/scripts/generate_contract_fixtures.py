"""Generate shared contract fixtures (spec §6.1 Zod↔pydantic parity).

Runs the QC endpoints in-process (TestClient) on small deterministic inputs
and writes the JSON responses to tests/contract/ at the repo root. Both test
suites then validate the SAME bytes: pytest re-parses them with the pydantic
models; vitest parses them with the Zod schemas. Regenerate whenever the
contract changes:  .venv/Scripts/python scripts/generate_contract_fixtures.py
"""

import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "engine"))
OUT_DIR = REPO_ROOT / "tests" / "contract"

from app.main import app  # noqa: E402

client = TestClient(app)

SERIES = [
    432.4, 495.6, 368.6, 567.3, 523.1, 468.5, 468.5, 506.6, 473.5, 477.2,
    535.2, 524.1, 490.6, 490.5, 506.5, 461.2, 475.0, 533.3, 493.8, 420.3,
]

FIXTURES = {
    "qc-trend": (
        "/api/engine/qc/trend",
        {"series": SERIES, "alpha": 0.05, "mcSamples": 1000, "seed": 42},
    ),
    "qc-aggregate": (
        "/api/engine/qc/aggregate",
        {
            "timestamps": [f"2000-01-{d:02d}T00:00:00" for d in range(1, 11)],
            "values": [0.0, 5.0, 10.0, 20.0, 30.0, None, 0.0, 8.0, 1.0, 0.0],
            "intervalHours": 24.0,
            "durationsHours": [24.0, 48.0],
            "applyCorrection": True,
            "minYearCompleteness": 0.0,
        },
    ),
    "qc-infill": (
        "/api/engine/qc/infill",
        {
            "dates": [f"2000-01-{d:02d}" for d in range(1, 11)],
            "target": [10.0, 20.0, 30.0, 40.0, None, 25.0, 25.0, 25.0, 25.0, 25.0],
            "neighbours": [
                {
                    "id": "A",
                    "name": "Alpha",
                    "distanceKm": 10.0,
                    "values": [50.0, 50.0, 50.0, 50.0, 60.0, 50.0, 50.0, 40.0, 50.0, 50.0],
                }
            ],
            "method": "normal_ratio",
        },
    ),
    "pfa": (
        "/api/engine/pfa",
        {
            "durations": [
                {
                    "durationHours": 24.0,
                    "series": [
                        {"year": 1990 + i, "value": v}
                        for i, v in enumerate(
                            [13.7, 22.4, 21.0, 27.0, 48.7, 39.0, 39.5, 37.9, 14.9, 28.5,
                             34.9, 23.1, 21.3, 19.2, 25.8, 15.5, 28.1, 17.7, 21.0, 32.3]
                        )
                    ],
                },
                {
                    "durationHours": 48.0,
                    "series": [
                        {"year": 1990 + i, "value": v * 1.35}
                        for i, v in enumerate(
                            [13.7, 22.4, 21.0, 27.0, 48.7, 39.0, 39.5, 37.9, 14.9, 28.5,
                             34.9, 23.1, 21.3, 19.2, 25.8, 15.5, 28.1, 17.7, 21.0, 32.3]
                        )
                    ],
                },
            ],
            "distributions": ["gumbel", "gev"],
            "returnPeriods": [2, 10, 100, 1000],
            "bootstrap": {"n": 200, "ci": 0.9, "seed": 42},
            "idfDistribution": "gumbel",
        },
    ),
    "pfa-pds": (
        "/api/engine/pfa/pds",
        {
            "timestamps": [f"2000-01-{d:02d}T00:00:00" for d in range(1, 31)],
            "values": [0.0] * 10 + [25.0] + [0.0] * 9 + [30.0] + [0.0] * 9,
            "threshold": 20.0,
            "minSeparationIntervals": 7,
        },
    ),
    # WMO-1045 Table 4.1 24-hour series (the golden worked example).
    "pmp": (
        "/api/engine/pmp",
        {
            "series": [62, 60, 57, 112, 67, 72, 62, 61, 57, 69, 72, 61, 62,
                       82, 306, 47, 43, 78, 113, 134, 51, 72, 62, 53, 55],
            "durationHours": 24.0,
            "nObsUnits": 24,
            "areaKm2": 500.0,
            "dadAreasKm2": [25, 200, 500, 1000],
        },
    ),
    "design-storm": (
        "/api/engine/design-storm",
        {
            "pattern": "alt_block",
            "dtHours": 1.0,
            "durationHours": 24.0,
            "peakRatio": 0.375,
            "idf": {
                "durationsHours": [1, 2, 6, 12, 24],
                "intensitiesMmHr": [34.1, 22.5, 14.3, 8.5, 4.8],
            },
        },
    ),
    "wind": (
        "/api/engine/wind",
        {
            "series": [
                {"year": 1990 + i, "value": v}
                for i, v in enumerate(
                    [72, 65, 81, 70, 90, 62, 77, 85, 68, 74, 79, 88, 66, 71, 83,
                     69, 76, 92, 64, 78]
                )
            ],
            "label": "annual max hourly wind (fixture)",
            "returnPeriods": [2, 10, 100, 1000],
            "bootstrapN": 200,
            "seed": 42,
            "roseSpeedsKmh": [10, 25, 40, 15, 30, None, 22, 18],
            "roseDirectionsDeg": [270, 265, 280, 90, 275, 180, 300, 45],
        },
    ),
    "fetch-wave": (
        "/api/engine/fetch-wave",
        {
            "siteLat": 51.0,
            "siteLon": -114.75,
            # ~10 km × 4 km reservoir east of the site
            "polygonLonLat": [
                [-114.75, 51.018], [-114.607, 51.018],
                [-114.607, 50.982], [-114.75, 50.982],
            ],
            "windTowardDeg": 90.0,
            "uLandMs": 20.0,
            "avgDepthM": 10.0,
            "waveMethod": "smb",
            "directionalScan": True,
        },
    ),
    "freeboard": (
        "/api/engine/freeboard",
        {
            "uLandMs": 20.0,
            "fetchKm": 5.0,
            "avgDepthM": 10.0,
            "slopeVPerH": 0.333333,
            "gammaF": 0.55,
            "waveMethod": "smb",
            "runupMethod": "taw2002",
            "allowancesM": {"settlement": 0.3, "seiche": 0.15},
        },
    ),
}


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, (path, payload) in FIXTURES.items():
        res = client.post(path, json=payload)
        res.raise_for_status()
        body = res.json()
        target = OUT_DIR / f"{name}.json"
        target.write_text(
            json.dumps({"request": payload, "response": body}, indent=2) + "\n"
        )
        print(f"wrote {target.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
