"""Pydantic models for /api/engine/wind, /fetch-wave, /freeboard (spec §3.5).
1:1 with packages/core-ts/src/wind.ts (contract fixtures, spec §6.1)."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------- wind ------------------------------------


class WindSeriesPoint(BaseModel):
    year: int
    value: float  # km/h


class WindRequest(BaseModel):
    """Annual-max wind AMS → Gumbel quantiles (+ optional rose sample)."""

    series: list[WindSeriesPoint] = Field(min_length=5)
    label: str = "annual max hourly wind"
    returnPeriods: list[float] = [2, 10, 25, 50, 100, 200, 1000]
    bootstrapN: int = Field(1000, ge=0, le=10_000)
    seed: int = 42
    roseSpeedsKmh: Optional[list[Optional[float]]] = None
    roseDirectionsDeg: Optional[list[Optional[float]]] = None


class WindQuantileOut(BaseModel):
    returnPeriod: float
    speedKmh: float
    speedMs: float
    ciLowerKmh: Optional[float]
    ciUpperKmh: Optional[float]


class WindResponse(BaseModel):
    label: str
    n: int
    gumbelParams: dict[str, float]
    quantiles: list[WindQuantileOut]
    rose: Optional[dict]
    seed: int
    engineVersion: str


# ------------------------------- fetch-wave ---------------------------------


class FetchWaveRequest(BaseModel):
    siteLat: float
    siteLon: float
    polygonLonLat: list[list[float]] = Field(min_length=3)  # [[lon,lat],...]
    windTowardDeg: float = Field(ge=0, lt=360)
    uLandMs: float = Field(gt=0)
    avgDepthM: Optional[float] = Field(None, gt=0)
    waveMethod: Literal["smb", "spm84"] = "smb"
    rlOverride: Optional[float] = Field(None, gt=0)
    directionalScan: bool = False


class FetchWaveResponse(BaseModel):
    fetch: dict          # FetchResult.to_dict()
    wave: dict           # WaveResult.to_dict()
    uWaterMs: float
    rl: float
    scan: Optional[dict]  # directional_scan output
    engineVersion: str


# -------------------------------- freeboard ---------------------------------


class FreeboardRequest(BaseModel):
    uLandMs: float = Field(gt=0)
    fetchKm: float = Field(gt=0)
    avgDepthM: float = Field(gt=0)
    slopeVPerH: float = Field(gt=0, le=2, description="tan α, e.g. 1/3 for 1V:3H")
    gammaF: float = Field(0.55, gt=0, le=1)
    waveMethod: Literal["smb", "spm84"] = "smb"
    runupMethod: Literal["taw2002", "hunt"] = "taw2002"
    rlOverride: Optional[float] = Field(None, gt=0)
    allowancesM: dict[str, float] = {}


class FreeboardResponse(BaseModel):
    hsM: float
    tS: float
    runupM: float
    setupM: float
    allowancesM: dict[str, float]
    totalFreeboardM: float
    inputs: dict
    engineVersion: str
