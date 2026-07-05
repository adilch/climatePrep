"""PMP + design-storm endpoints (spec §3.5). Pure compute — no auth, no DB."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from core_engine import engine_version
from core_engine.pmp.hershfield import dad_table, hershfield_pmp
from core_engine.storms.patterns import (
    alternating_block,
    chicago_storm,
    mass_curve_storm,
    pmp_hyetograph,
)

from .pmp_models import (
    DadRowOut,
    DesignStormRequest,
    DesignStormResponse,
    HyetographOut,
    PmpRequest,
    PmpResponse,
    PmpStepOut,
)

router = APIRouter(prefix="/api/engine", tags=["pmp"])

DIGITIZATION_NOTICE = (
    "Km, outlier/sample-size adjustments and ARF use digitized WMO-1045 "
    "figures anchored to the manual's Table 4.1 worked example; values "
    "between anchors are approximate. Verify figure readings for production "
    "use, or supply overrides — every factor applied is listed in `steps`."
)


@router.post("/pmp", response_model=PmpResponse)
def pmp(req: PmpRequest) -> PmpResponse:
    try:
        r = hershfield_pmp(
            values=req.series,
            duration_hours=req.durationHours,
            n_obs_units=req.nObsUnits,
            area_km2=req.areaKm2,
            km_override=req.kmOverride,
            fig42_override=req.fig42Override,
            fig43_override=req.fig43Override,
            fig44_mean_override=req.fig44MeanOverride,
            fig44_sd_override=req.fig44SdOverride,
            interval_factor_override=req.intervalFactorOverride,
            arf_override=req.arfOverride,
            apply_outlier_adjustment=req.applyOutlierAdjustment,
            apply_length_adjustment=req.applyLengthAdjustment,
            apply_interval_adjustment=req.applyIntervalAdjustment,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    dad = None
    if req.dadAreasKm2:
        dad = [
            DadRowOut(**row)
            for row in dad_table(
                {req.durationHours: r.pmp_true_interval_mm}, req.dadAreasKm2
            )
        ]

    d = r.to_dict()
    return PmpResponse(
        **{k: v for k, v in d.items() if k != "steps"},
        steps=[PmpStepOut(**s) for s in d["steps"]],
        dad=dad,
        digitizationNotice=DIGITIZATION_NOTICE,
        engineVersion=engine_version(),
    )


@router.post("/design-storm", response_model=DesignStormResponse)
def design_storm(req: DesignStormRequest) -> DesignStormResponse:
    try:
        if req.pattern == "chicago":
            if not req.idf or not req.idf.intensitiesMmHr:
                raise ValueError("chicago requires idf.durationsHours + intensitiesMmHr")
            h = chicago_storm(
                req.idf.durationsHours,
                req.idf.intensitiesMmHr,
                req.durationHours,
                req.dtHours,
                peak_ratio=req.peakRatio,
            )
        elif req.pattern == "alt_block":
            if not req.idf:
                raise ValueError("alt_block requires idf points")
            depths = req.idf.depthsMm
            if depths is None:
                if req.idf.intensitiesMmHr is None:
                    raise ValueError("alt_block requires depthsMm or intensitiesMmHr")
                depths = [
                    i * d
                    for i, d in zip(req.idf.intensitiesMmHr, req.idf.durationsHours)
                ]
            h = alternating_block(
                req.idf.durationsHours,
                depths,
                req.durationHours,
                req.dtHours,
                peak_ratio=req.peakRatio,
            )
        elif req.pattern == "scs_type2":
            if req.totalDepthMm is None:
                raise ValueError("scs_type2 requires totalDepthMm")
            h = mass_curve_storm(
                "scs_type2", req.totalDepthMm, req.dtHours, req.durationHours
            )
        else:  # pmp
            if req.pmp24hMm is None:
                raise ValueError("pmp pattern requires pmp24hMm")
            h = pmp_hyetograph(req.pmp24hMm, req.dtHours, peak_ratio=req.peakRatio)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    return DesignStormResponse(
        hyetograph=HyetographOut(**h.to_dict()),
        engineVersion=engine_version(),
    )
