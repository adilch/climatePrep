"""Pydantic models for /api/engine/pmp and /api/engine/design-storm
(spec §3.5). Wire format camelCase; 1:1 with packages/core-ts/src/pmp.ts
and storms.ts (contract fixtures, spec §6.1)."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


# --------------------------------- PMP --------------------------------------


class PmpRequest(BaseModel):
    series: list[float] = Field(min_length=10, description="AMS (mm) for the duration")
    durationHours: float = Field(gt=0)
    nObsUnits: int = Field(1, ge=1, description="observational units per duration (Fig 4.5)")
    areaKm2: Optional[float] = Field(None, gt=0)
    # Analyst overrides — each figure-derived factor can be supplied directly.
    kmOverride: Optional[float] = Field(None, gt=0)
    fig42Override: Optional[float] = Field(None, gt=0)
    fig43Override: Optional[float] = Field(None, gt=0)
    fig44MeanOverride: Optional[float] = Field(None, gt=0)
    fig44SdOverride: Optional[float] = Field(None, gt=0)
    intervalFactorOverride: Optional[float] = Field(None, gt=0)
    arfOverride: Optional[float] = Field(None, gt=0, le=1)
    applyOutlierAdjustment: bool = True
    applyLengthAdjustment: bool = True
    applyIntervalAdjustment: bool = True
    dadAreasKm2: Optional[list[float]] = Field(
        None, description="areas for the DAD table (uses this duration's point PMP)"
    )


class PmpStepOut(BaseModel):
    key: str
    label: str
    value: float
    source: str
    note: str = ""


class DadRowOut(BaseModel):
    areaKm2: float
    depthsMm: dict[str, float]


class PmpResponse(BaseModel):
    durationHours: float
    n: int
    meanMm: float
    sdMm: float
    meanExclMaxMm: float
    sdExclMaxMm: float
    adjustedMeanMm: float
    adjustedSdMm: float
    km: float
    pmpPointMm: float
    pmpTrueIntervalMm: float
    pmpArealMm: Optional[float]
    areaKm2: Optional[float]
    maxObservedMm: float
    steps: list[PmpStepOut]
    dad: Optional[list[DadRowOut]]
    digitizationNotice: str
    engineVersion: str


# ----------------------------- design storms --------------------------------


class IdfPointsIn(BaseModel):
    durationsHours: list[float] = Field(min_length=2)
    intensitiesMmHr: Optional[list[float]] = None
    depthsMm: Optional[list[float]] = None


class DesignStormRequest(BaseModel):
    pattern: Literal["chicago", "alt_block", "scs_type2", "pmp"]
    dtHours: float = Field(gt=0, le=6)
    durationHours: float = Field(24.0, gt=0, le=96)
    peakRatio: float = Field(0.375, ge=0.05, le=0.95)
    idf: Optional[IdfPointsIn] = None       # chicago / alt_block
    totalDepthMm: Optional[float] = Field(None, gt=0)  # scs_type2
    pmp24hMm: Optional[float] = Field(None, gt=0)      # pmp


class HyetographOut(BaseModel):
    pattern: str
    dtHours: float
    durationHours: float
    depthsMm: list[float]
    intensitiesMmHr: list[float]
    cumulativeMm: list[float]
    totalDepthMm: float
    peakIndex: int
    params: dict
    warnings: list[str]


class DesignStormResponse(BaseModel):
    hyetograph: HyetographOut
    engineVersion: str
