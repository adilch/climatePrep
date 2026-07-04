"""Pydantic models for the QC endpoints (spec §3.5).

Wire format is camelCase JSON; these models MUST stay 1:1 with the Zod
schemas in packages/core-ts/src/qc.ts (contract-parity test, spec §6.1).
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


# --------------------------- trend/homogeneity -----------------------------


class TrendRequest(BaseModel):
    series: list[float] = Field(min_length=10)
    alpha: float = Field(0.05, gt=0, lt=1)
    mcSamples: int = Field(5000, ge=500, le=100_000)
    seed: int = 42


class MannKendallOut(BaseModel):
    trend: Literal["increasing", "decreasing", "no_trend"]
    significant: bool
    pValue: float
    z: float
    s: float
    varS: float
    tau: float
    senSlope: float
    senIntercept: float


class ChangePointOut(BaseModel):
    homogeneous: bool
    changePointIndex: int
    pValue: float
    statistic: float  # Pettitt K or SNHT T0
    meanBefore: float
    meanAfter: float


class TrendResponse(BaseModel):
    n: int
    alpha: float
    mannKendall: MannKendallOut
    pettitt: ChangePointOut
    snht: ChangePointOut
    seed: int
    engineVersion: str


# ------------------------------ aggregation --------------------------------


class AggregateRequest(BaseModel):
    timestamps: list[str] = Field(min_length=1)
    values: list[Optional[float]]
    intervalHours: float = Field(gt=0)
    durationsHours: list[float] = Field(min_length=1)
    applyCorrection: bool = True
    correctionFactors: Optional[dict[int, float]] = None
    minYearCompleteness: float = Field(0.8, ge=0, le=1)


class AmsPointOut(BaseModel):
    year: int
    valueRaw: float
    value: float
    windowEnd: str
    completeness: float


class DurationSeriesOut(BaseModel):
    durationHours: float
    kIntervals: int
    correctionApplied: bool
    correctionFactor: float
    ams: list[AmsPointOut]
    yearsSkipped: list[dict]


class AggregateResponse(BaseModel):
    durations: list[DurationSeriesOut]
    engineVersion: str


# -------------------------------- infilling --------------------------------


class NeighbourIn(BaseModel):
    id: str
    name: str
    distanceKm: float = Field(gt=0)
    values: list[Optional[float]]


class InfillRequest(BaseModel):
    dates: list[str] = Field(min_length=1)
    target: list[Optional[float]]
    neighbours: list[NeighbourIn] = Field(min_length=1)
    method: Literal["normal_ratio", "idw", "regression"]
    power: float = Field(2.0, gt=0)  # idw only
    minOverlap: int = Field(30, ge=3)  # regression only


class FilledPointOut(BaseModel):
    index: int
    date: str
    value: float
    method: str
    neighbours: list[dict]
    params: dict


class InfillResponse(BaseModel):
    filledValues: list[Optional[float]]
    filledPoints: list[FilledPointOut]
    unfillable: list[dict]
    method: str
    stats: dict
    engineVersion: str
