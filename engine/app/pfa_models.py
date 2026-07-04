"""Pydantic models for POST /api/engine/pfa (spec §3.5).

Wire format camelCase; MUST stay 1:1 with packages/core-ts/src/pfa.ts
(contract-parity fixtures, spec §6.1).
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class SeriesPoint(BaseModel):
    year: int
    value: float


class DurationSeriesIn(BaseModel):
    durationHours: float = Field(gt=0)
    series: list[SeriesPoint] = Field(min_length=5)


class BootstrapConfig(BaseModel):
    n: int = Field(2000, ge=0, le=10_000)
    ci: float = Field(0.90, gt=0, lt=1)
    seed: int = 42


class PfaRequest(BaseModel):
    durations: list[DurationSeriesIn] = Field(min_length=1)
    distributions: list[Literal["gumbel", "gev", "glo", "pe3", "lp3"]] = [
        "gumbel", "gev", "glo", "pe3", "lp3",
    ]
    estimationMethod: Literal["lmoments", "mom", "mle"] = "lmoments"
    plottingPosition: Literal["cunnane", "weibull", "gringorten"] = "cunnane"
    returnPeriods: list[float] = [2, 5, 10, 25, 50, 100, 200, 500, 1000, 10000]
    bootstrap: BootstrapConfig = BootstrapConfig()
    idfDistribution: Literal["gumbel", "gev", "glo", "pe3", "lp3"] = "gumbel"


class QuantileOut(BaseModel):
    returnPeriod: float
    aep: float
    value: float
    ciLower: Optional[float]
    ciUpper: Optional[float]


class GofOut(BaseModel):
    """All fields nullable: a fit can be valid while a statistic is undefined
    (e.g. PE3 log-likelihood −inf when the density is 0 at an observation —
    AIC/BIC are then meaningless and serialized as null, not ±inf)."""

    ksStat: Optional[float]
    ksPvalue: Optional[float]
    adStat: Optional[float]
    ppcc: Optional[float]
    aic: Optional[float]
    bic: Optional[float]
    rmse: Optional[float]


class DistFitOut(BaseModel):
    key: str
    label: str
    estimationMethod: str
    parameters: dict[str, float]
    quantiles: list[QuantileOut]
    curve: list[list[float]]  # [returnPeriod, value] pairs
    goodnessOfFit: Optional[GofOut]
    fitError: Optional[str]


class PlottingPointOut(BaseModel):
    year: int
    value: float
    exceedanceProb: float
    returnPeriod: float


class LmomentRatiosOut(BaseModel):
    l1: float
    l2: float
    t: float
    t3: float
    t4: float


class DurationFitOut(BaseModel):
    durationHours: float
    n: int
    bestFit: Optional[str]
    lmomentRatios: LmomentRatiosOut
    plottingPositions: list[PlottingPointOut]
    fits: list[DistFitOut]


class IdfCellOut(BaseModel):
    intensity: float
    depth: float
    ciLow: Optional[float]
    ciHigh: Optional[float]


class IdfOut(BaseModel):
    distribution: str
    durationsHours: list[float]
    returnPeriods: list[float]
    # cells[durationIdx][returnPeriodIdx]; null when the distribution failed
    cells: list[list[Optional[IdfCellOut]]]


class PfaResponse(BaseModel):
    durations: list[DurationFitOut]
    idf: IdfOut
    seed: int
    engineVersion: str


# ------------------------------- PDS ---------------------------------------


class PdsRequest(BaseModel):
    timestamps: list[str] = Field(min_length=2)
    values: list[Optional[float]]
    threshold: Optional[float] = None
    eventsPerYear: Optional[float] = Field(None, gt=0, le=20)
    minSeparationIntervals: int = Field(7, ge=1)


class PdsEventOut(BaseModel):
    timestamp: str
    value: float


class PdsResponse(BaseModel):
    threshold: float
    minSeparationIntervals: int
    events: list[PdsEventOut]
    eventsPerYear: float
    nYears: float
    engineVersion: str
