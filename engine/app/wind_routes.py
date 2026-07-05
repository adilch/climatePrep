"""Wind / fetch-wave / freeboard endpoints (spec §3.5). Pure compute."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from core_engine import engine_version
from core_engine.pfa.ffa import fit_series
from core_engine.waves.fetch import saville_effective_fetch
from core_engine.waves.freeboard import compute_freeboard, directional_scan
from core_engine.waves.prediction import overland_to_overwater, smb_bretschneider, spm84
from core_engine.waves.rose import wind_rose

from .wind_models import (
    FetchWaveRequest,
    FetchWaveResponse,
    FreeboardRequest,
    FreeboardResponse,
    WindQuantileOut,
    WindRequest,
    WindResponse,
)

router = APIRouter(prefix="/api/engine", tags=["wind"])


@router.post("/wind", response_model=WindResponse)
def wind(req: WindRequest) -> WindResponse:
    """Extreme wind: Gumbel/EV1 on annual maxima (spec F1) via the shared
    frequency core (same fitting/bootstrap as PFA — zero drift)."""
    try:
        fit = fit_series(
            values=[p.value for p in req.series],
            years=[p.year for p in req.series],
            distributions=["gumbel"],
            return_periods=req.returnPeriods,
            bootstrap_samples=req.bootstrapN,
            ci_method="bootstrap" if req.bootstrapN > 0 else "none",
            seed=req.seed,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    gum = fit.distributions[0]
    if gum.fit_error:
        raise HTTPException(status_code=422, detail=f"gumbel fit failed: {gum.fit_error}")

    rose = None
    if req.roseSpeedsKmh and req.roseDirectionsDeg:
        try:
            rose = wind_rose(req.roseSpeedsKmh, req.roseDirectionsDeg)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e)) from e

    return WindResponse(
        label=req.label,
        n=fit.n,
        gumbelParams=gum.parameters,
        quantiles=[
            WindQuantileOut(
                returnPeriod=q.return_period,
                speedKmh=q.value,
                speedMs=round(q.value / 3.6, 2),
                ciLowerKmh=q.ci_lower,
                ciUpperKmh=q.ci_upper,
            )
            for q in gum.quantiles
        ],
        rose=rose,
        seed=req.seed,
        engineVersion=engine_version(),
    )


@router.post("/fetch-wave", response_model=FetchWaveResponse)
def fetch_wave(req: FetchWaveRequest) -> FetchWaveResponse:
    """Reservoir polygon + direction + wind → Saville fetch + wave (spec F3/G1)."""
    try:
        poly = [(p[0], p[1]) for p in req.polygonLonLat]
        fetch = saville_effective_fetch(req.siteLat, req.siteLon, poly, req.windTowardDeg)
        u_water, rl = overland_to_overwater(req.uLandMs, req.rlOverride)
        if fetch.effective_fetch_km <= 0:
            raise ValueError(
                "zero effective fetch — the wind direction points away from "
                "the reservoir polygon"
            )
        wave = (
            smb_bretschneider(u_water, fetch.effective_fetch_km, req.avgDepthM)
            if req.waveMethod == "smb"
            else spm84(u_water, fetch.effective_fetch_km)
        )
        scan = (
            directional_scan(
                req.siteLat, req.siteLon, poly, req.uLandMs, req.avgDepthM or 10.0
            )
            if req.directionalScan
            else None
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    return FetchWaveResponse(
        fetch=fetch.to_dict(),
        wave=wave.to_dict(),
        uWaterMs=round(u_water, 3),
        rl=rl,
        scan=scan,
        engineVersion=engine_version(),
    )


@router.post("/freeboard", response_model=FreeboardResponse)
def freeboard(req: FreeboardRequest) -> FreeboardResponse:
    """Runup + setup + allowances → CDA freeboard components (spec G2/G3)."""
    try:
        fb = compute_freeboard(
            u_land_ms=req.uLandMs,
            fetch_km=req.fetchKm,
            avg_depth_m=req.avgDepthM,
            slope_v_per_h=req.slopeVPerH,
            roughness_gamma_f=req.gammaF,
            wave_method=req.waveMethod,
            runup_method=req.runupMethod,
            rl_override=req.rlOverride,
            allowances_m=req.allowancesM,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    d = fb.to_dict()
    return FreeboardResponse(**d, engineVersion=engine_version())
