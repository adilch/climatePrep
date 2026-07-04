"""PFA endpoints (spec §3.5 /api/engine/pfa). Pure compute — no auth, no DB."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from core_engine import engine_version
from core_engine.pfa.idf import DurationInput, run_pfa
from core_engine.pfa.pds import extract_pds

from .pfa_models import (
    DistFitOut,
    DurationFitOut,
    GofOut,
    IdfCellOut,
    IdfOut,
    LmomentRatiosOut,
    PdsEventOut,
    PdsRequest,
    PdsResponse,
    PfaRequest,
    PfaResponse,
    PlottingPointOut,
    QuantileOut,
)

router = APIRouter(prefix="/api/engine/pfa", tags=["pfa"])


def _fin(x: float) -> float | None:
    """Non-finite statistics (nan/±inf) → null on the wire, never ±inf."""
    import math

    return x if isinstance(x, (int, float)) and math.isfinite(x) else None


@router.post("", response_model=PfaResponse)
def pfa(req: PfaRequest) -> PfaResponse:
    try:
        result = run_pfa(
            durations=[
                DurationInput(
                    duration_hours=d.durationHours,
                    years=[p.year for p in d.series],
                    values=[p.value for p in d.series],
                )
                for d in req.durations
            ],
            distributions=list(req.distributions),
            return_periods=req.returnPeriods,
            estimation_method=req.estimationMethod,
            plotting_position=req.plottingPosition,
            ci_method="bootstrap" if req.bootstrap.n > 0 else "none",
            confidence_level=req.bootstrap.ci,
            bootstrap_samples=req.bootstrap.n,
            seed=req.bootstrap.seed,
            idf_distribution=req.idfDistribution,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    durations_out = []
    for dur in result.durations_hours:
        fit = result.fits[dur]
        durations_out.append(
            DurationFitOut(
                durationHours=dur,
                n=fit.n,
                bestFit=fit.best_fit,
                lmomentRatios=LmomentRatiosOut(
                    l1=fit.lmoment_ratios.l1,
                    l2=fit.lmoment_ratios.l2,
                    t=fit.lmoment_ratios.t,
                    t3=fit.lmoment_ratios.t3,
                    t4=fit.lmoment_ratios.t4,
                ),
                plottingPositions=[
                    PlottingPointOut(
                        year=p.year,
                        value=p.value,
                        exceedanceProb=p.exceedance_prob,
                        returnPeriod=p.return_period,
                    )
                    for p in fit.plotting_positions
                ],
                fits=[
                    DistFitOut(
                        key=d.key,
                        label=d.label,
                        estimationMethod=d.estimation_method,
                        parameters=d.parameters,
                        quantiles=[
                            QuantileOut(
                                returnPeriod=q.return_period,
                                aep=q.aep,
                                value=q.value,
                                ciLower=q.ci_lower,
                                ciUpper=q.ci_upper,
                            )
                            for q in d.quantiles
                        ],
                        curve=[[t, v] for t, v in d.curve],
                        goodnessOfFit=GofOut(
                            ksStat=_fin(d.goodness_of_fit.ks_stat),
                            ksPvalue=_fin(d.goodness_of_fit.ks_pvalue),
                            adStat=_fin(d.goodness_of_fit.ad_stat),
                            ppcc=_fin(d.goodness_of_fit.ppcc),
                            aic=_fin(d.goodness_of_fit.aic),
                            bic=_fin(d.goodness_of_fit.bic),
                            rmse=_fin(d.goodness_of_fit.rmse),
                        )
                        if d.goodness_of_fit
                        else None,
                        fitError=d.fit_error,
                    )
                    for d in fit.distributions
                ],
            )
        )

    idf_out = IdfOut(
        distribution=result.idf_distribution,
        durationsHours=result.durations_hours,
        returnPeriods=result.return_periods,
        cells=[
            [
                IdfCellOut(
                    intensity=c.intensity,
                    depth=c.depth,
                    ciLow=c.ci_low,
                    ciHigh=c.ci_high,
                )
                if c
                else None
                for c in row
            ]
            for row in result.idf
        ],
    )

    return PfaResponse(
        durations=durations_out,
        idf=idf_out,
        seed=req.bootstrap.seed,
        engineVersion=engine_version(),
    )


@router.post("/pds", response_model=PdsResponse)
def pds(req: PdsRequest) -> PdsResponse:
    if len(req.timestamps) != len(req.values):
        raise HTTPException(status_code=422, detail="timestamps/values length mismatch")
    try:
        result = extract_pds(
            timestamps=req.timestamps,
            values=req.values,
            threshold=req.threshold,
            events_per_year=req.eventsPerYear,
            min_separation_intervals=req.minSeparationIntervals,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    return PdsResponse(
        threshold=result.threshold,
        minSeparationIntervals=result.min_separation_intervals,
        events=[PdsEventOut(timestamp=e.timestamp, value=e.value) for e in result.events],
        eventsPerYear=result.events_per_year,
        nYears=result.n_years,
        engineVersion=engine_version(),
    )
