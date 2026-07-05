"""Contract-parity, engine side (spec §6.1): the shared fixtures under
tests/contract/ must re-validate against the pydantic models. The vitest suite
validates the SAME files against the Zod schemas — if either side drifts, one
of the suites goes red."""

import json
from pathlib import Path

import pytest

from app.pfa_models import (
    PdsRequest,
    PdsResponse,
    PfaRequest,
    PfaResponse,
)
from app.pmp_models import (
    DesignStormRequest,
    DesignStormResponse,
    PmpRequest,
    PmpResponse,
)
from app.wind_models import (
    FetchWaveRequest,
    FetchWaveResponse,
    FreeboardRequest,
    FreeboardResponse,
    WindRequest,
    WindResponse,
)
from app.qc_models import (
    AggregateRequest,
    AggregateResponse,
    InfillRequest,
    InfillResponse,
    TrendRequest,
    TrendResponse,
)

CONTRACT_DIR = Path(__file__).resolve().parents[2] / "tests" / "contract"

CASES = [
    ("qc-trend.json", TrendRequest, TrendResponse),
    ("qc-aggregate.json", AggregateRequest, AggregateResponse),
    ("qc-infill.json", InfillRequest, InfillResponse),
    ("pfa.json", PfaRequest, PfaResponse),
    ("pfa-pds.json", PdsRequest, PdsResponse),
    ("pmp.json", PmpRequest, PmpResponse),
    ("design-storm.json", DesignStormRequest, DesignStormResponse),
    ("wind.json", WindRequest, WindResponse),
    ("fetch-wave.json", FetchWaveRequest, FetchWaveResponse),
    ("freeboard.json", FreeboardRequest, FreeboardResponse),
]


@pytest.mark.parametrize("filename,req_model,res_model", CASES)
def test_fixture_validates(filename, req_model, res_model):
    fixture = json.loads((CONTRACT_DIR / filename).read_text())
    req_model.model_validate(fixture["request"])
    res = res_model.model_validate(fixture["response"])
    assert res.engineVersion
