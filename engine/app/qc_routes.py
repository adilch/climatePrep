"""QC endpoints (spec §3.5 /api/engine/qc). Pure compute — no auth, no DB."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from core_engine import engine_version
from core_engine.qc.aggregate import extract_ams
from core_engine.qc.infill import INFILL_METHODS, Neighbour
from core_engine.qc.trend import mann_kendall, pettitt, snht

from .qc_models import (
    AggregateRequest,
    AggregateResponse,
    AmsPointOut,
    ChangePointOut,
    DurationSeriesOut,
    FilledPointOut,
    InfillRequest,
    InfillResponse,
    MannKendallOut,
    TrendRequest,
    TrendResponse,
)

router = APIRouter(prefix="/api/engine/qc", tags=["qc"])


@router.post("/trend", response_model=TrendResponse)
def qc_trend(req: TrendRequest) -> TrendResponse:
    try:
        mk = mann_kendall(req.series, alpha=req.alpha)
        pt = pettitt(req.series, alpha=req.alpha)
        sn = snht(req.series, alpha=req.alpha, mc_samples=req.mcSamples, seed=req.seed)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    return TrendResponse(
        n=mk.n,
        alpha=req.alpha,
        mannKendall=MannKendallOut(
            trend=mk.trend,
            significant=mk.significant,
            pValue=mk.p_value,
            z=mk.z,
            s=mk.s,
            varS=mk.var_s,
            tau=mk.tau,
            senSlope=mk.sen_slope,
            senIntercept=mk.sen_intercept,
        ),
        pettitt=ChangePointOut(
            homogeneous=pt.homogeneous,
            changePointIndex=pt.change_point_index,
            pValue=pt.p_value,
            statistic=pt.k,
            meanBefore=pt.mean_before,
            meanAfter=pt.mean_after,
        ),
        snht=ChangePointOut(
            homogeneous=sn.homogeneous,
            changePointIndex=sn.change_point_index,
            pValue=sn.p_value,
            statistic=sn.t0,
            meanBefore=sn.mean_before,
            meanAfter=sn.mean_after,
        ),
        seed=req.seed,
        engineVersion=engine_version(),
    )


@router.post("/aggregate", response_model=AggregateResponse)
def qc_aggregate(req: AggregateRequest) -> AggregateResponse:
    if len(req.timestamps) != len(req.values):
        raise HTTPException(status_code=422, detail="timestamps/values length mismatch")
    try:
        series = extract_ams(
            timestamps=req.timestamps,
            values=req.values,
            interval_hours=req.intervalHours,
            durations_hours=req.durationsHours,
            apply_correction=req.applyCorrection,
            correction_factors=req.correctionFactors,
            min_year_completeness=req.minYearCompleteness,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    return AggregateResponse(
        durations=[
            DurationSeriesOut(
                durationHours=d.duration_hours,
                kIntervals=d.k_intervals,
                correctionApplied=d.correction_applied,
                correctionFactor=d.correction_factor,
                ams=[
                    AmsPointOut(
                        year=p.year,
                        valueRaw=p.value_raw,
                        value=p.value,
                        windowEnd=p.window_end,
                        completeness=p.completeness,
                    )
                    for p in d.ams
                ],
                yearsSkipped=d.years_skipped,
            )
            for d in series
        ],
        engineVersion=engine_version(),
    )


@router.post("/infill", response_model=InfillResponse)
def qc_infill(req: InfillRequest) -> InfillResponse:
    for nb in req.neighbours:
        if len(nb.values) != len(req.target):
            raise HTTPException(
                status_code=422,
                detail=f"neighbour {nb.id} values not aligned to target length",
            )
    if len(req.dates) != len(req.target):
        raise HTTPException(status_code=422, detail="dates/target length mismatch")

    neighbours = [
        Neighbour(id=nb.id, name=nb.name, distance_km=nb.distanceKm, values=nb.values)
        for nb in req.neighbours
    ]
    fn = INFILL_METHODS[req.method]
    kwargs = {}
    if req.method == "idw":
        kwargs["power"] = req.power
    if req.method == "regression":
        kwargs["min_overlap"] = req.minOverlap
    result = fn(req.dates, req.target, neighbours, **kwargs)

    return InfillResponse(
        filledValues=result.filled_values,
        filledPoints=[FilledPointOut(**p.to_dict()) for p in result.filled_points],
        unfillable=result.unfillable,
        method=result.method,
        stats=result.stats,
        engineVersion=engine_version(),
    )
