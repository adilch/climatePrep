"""Figure-rendering endpoints (spec §3.7 server-side matplotlib pipeline)."""

from __future__ import annotations

import base64
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core_engine import engine_version
from core_engine.figures.pfa_figures import (
    FigureMeta,
    frequency_plot_png,
    idf_plot_png,
    lmr_diagram_png,
)

router = APIRouter(prefix="/api/engine/figures", tags=["figures"])


class FigureMetaIn(BaseModel):
    stationName: str
    climateId: str
    seed: int = 42
    note: str = ""


class PfaFiguresRequest(BaseModel):
    """`pfa` is the PfaResponse payload (validated upstream when produced);
    `published` is the parsed ECCC published IDF or null."""

    pfa: dict
    published: Optional[dict] = None
    meta: FigureMetaIn
    frequencyDurations: Optional[list[float]] = Field(
        None, description="durations to render frequency plots for (default: all)"
    )


class FigureOut(BaseModel):
    name: str
    pngBase64: str


class PfaFiguresResponse(BaseModel):
    figures: list[FigureOut]
    engineVersion: str


@router.post("/pfa", response_model=PfaFiguresResponse)
def pfa_figures(req: PfaFiguresRequest) -> PfaFiguresResponse:
    meta = FigureMeta(
        station_name=req.meta.stationName,
        climate_id=req.meta.climateId,
        seed=req.meta.seed,
        engine_version=engine_version(),
        note=req.meta.note,
    )

    durations = req.pfa.get("durations")
    idf = req.pfa.get("idf")
    if not durations or not idf:
        raise HTTPException(status_code=422, detail="pfa payload missing durations/idf")

    wanted = req.frequencyDurations
    figures: list[FigureOut] = []

    for dur in durations:
        dh = dur["durationHours"]
        if wanted is not None and dh not in wanted:
            continue
        png = frequency_plot_png(
            duration_hours=dh,
            fits=dur["fits"],
            plotting_positions=dur["plottingPositions"],
            ci_distribution=idf.get("distribution", "gumbel"),
            meta=meta,
        )
        figures.append(
            FigureOut(
                name=f"frequency_{dh:g}h",
                pngBase64=base64.b64encode(png).decode(),
            )
        )

    figures.append(
        FigureOut(
            name="idf",
            pngBase64=base64.b64encode(
                idf_plot_png(idf, req.published, meta)
            ).decode(),
        )
    )

    samples = [
        {
            "durationHours": d["durationHours"],
            "t3": d["lmomentRatios"]["t3"],
            "t4": d["lmomentRatios"]["t4"],
        }
        for d in durations
    ]
    figures.append(
        FigureOut(
            name="lmr_diagram",
            pngBase64=base64.b64encode(lmr_diagram_png(samples, meta)).decode(),
        )
    )

    return PfaFiguresResponse(figures=figures, engineVersion=engine_version())
