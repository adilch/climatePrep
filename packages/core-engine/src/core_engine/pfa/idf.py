"""Multi-duration PFA orchestration + IDF assembly (spec C1, C4).

Fits every requested duration's AMS with the shared frequency core, then
assembles the IDF surface (intensity mm/h by duration × return period) from
ONE distribution family across durations — mixing families across durations
produces non-monotone IDF curves. Default family is Gumbel/EV1, matching
ECCC's published-IDF methodology, so the site-specific curve is directly
comparable to the published one (spec K5). A single seeded rng is shared
across durations in order: identical requests → identical CIs.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from .ffa import SeriesFitResult, fit_series


@dataclass
class DurationInput:
    duration_hours: float
    years: list[int]
    values: list[float]


@dataclass
class IdfCell:
    intensity: float  # mm/h
    depth: float  # mm
    ci_low: Optional[float]  # intensity mm/h
    ci_high: Optional[float]


@dataclass
class PfaMultiResult:
    fits: dict[float, SeriesFitResult]  # keyed by duration_hours
    idf_distribution: str
    return_periods: list[float]
    durations_hours: list[float]
    # idf[duration_index][return_period_index]
    idf: list[list[Optional[IdfCell]]] = field(default_factory=list)


def run_pfa(
    durations: list[DurationInput],
    distributions: list[str],
    return_periods: list[float],
    estimation_method: str = "lmoments",
    plotting_position: str = "cunnane",
    ci_method: str = "bootstrap",
    confidence_level: float = 0.90,
    bootstrap_samples: int = 2000,
    seed: int = 42,
    idf_distribution: str = "gumbel",
) -> PfaMultiResult:
    if idf_distribution not in distributions:
        distributions = [*distributions, idf_distribution]

    rng = np.random.default_rng(seed)
    fits: dict[float, SeriesFitResult] = {}
    for d in sorted(durations, key=lambda d: d.duration_hours):
        fits[d.duration_hours] = fit_series(
            d.values,
            d.years,
            distributions,
            return_periods,
            estimation_method=estimation_method,
            plotting_position=plotting_position,
            ci_method=ci_method,
            confidence_level=confidence_level,
            bootstrap_samples=bootstrap_samples,
            rng=rng,
        )

    durations_sorted = sorted(fits.keys())
    idf: list[list[Optional[IdfCell]]] = []
    for dur in durations_sorted:
        row: list[Optional[IdfCell]] = []
        fit = fits[dur]
        dist = next(
            (x for x in fit.distributions if x.key == idf_distribution and not x.fit_error),
            None,
        )
        for i, _t in enumerate(return_periods):
            if dist is None:
                row.append(None)
                continue
            q = dist.quantiles[i]
            row.append(
                IdfCell(
                    intensity=round(q.value / dur, 4),
                    depth=q.value,
                    ci_low=round(q.ci_lower / dur, 4) if q.ci_lower is not None else None,
                    ci_high=round(q.ci_upper / dur, 4) if q.ci_upper is not None else None,
                )
            )
        idf.append(row)

    return PfaMultiResult(
        fits=fits,
        idf_distribution=idf_distribution,
        return_periods=return_periods,
        durations_hours=durations_sorted,
        idf=idf,
    )
