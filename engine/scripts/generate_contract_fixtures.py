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
