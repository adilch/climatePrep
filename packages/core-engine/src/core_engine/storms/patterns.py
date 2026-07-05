"""Design-storm temporal patterns (spec E1/E2; references in spec §7)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import numpy as np
from scipy.optimize import curve_fit

from core_engine.pmp.hershfield import depth_duration_fraction


@dataclass
class Hyetograph:
    pattern: str
    dt_hours: float
    duration_hours: float
    depths_mm: list[float]              # per time step
    total_depth_mm: float
    peak_index: int
    params: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    @property
    def intensities_mm_hr(self) -> list[float]:
        return [round(d / self.dt_hours, 4) for d in self.depths_mm]

    def cumulative_mm(self) -> list[float]:
        return [round(float(c), 3) for c in np.cumsum(self.depths_mm)]

    def to_dict(self) -> dict:
        return {
            "pattern": self.pattern,
            "dtHours": self.dt_hours,
            "durationHours": self.duration_hours,
            "depthsMm": [round(d, 4) for d in self.depths_mm],
            "intensitiesMmHr": self.intensities_mm_hr,
            "cumulativeMm": self.cumulative_mm(),
            "totalDepthMm": round(self.total_depth_mm, 3),
            "peakIndex": self.peak_index,
            "params": self.params,
            "warnings": self.warnings,
        }


# ---------------------------------------------------------------------------
# IDF interpolation helpers
# ---------------------------------------------------------------------------


def fit_idf_abc(
    durations_hours: list[float], intensities_mm_hr: list[float]
) -> tuple[float, float, float, float]:
    """Fit i = a / (t + b)^c to IDF points (Chicago-storm prerequisite).

    Returns (a, b, c, rmse_rel). Standard practice for the Keifer-Chu storm;
    the fit quality is logged so the engineer can judge adequacy.
    """
    t = np.asarray(durations_hours, dtype=float)
    i = np.asarray(intensities_mm_hr, dtype=float)
    if len(t) < 3:
        raise ValueError("need at least 3 IDF points to fit i = a/(t+b)^c")

    def f(t_, a, b, c):
        return a / np.power(t_ + b, c)

    p0 = (float(i.max() * (t.min() + 0.1)), 0.1, 0.8)
    popt, _ = curve_fit(
        f, t, i, p0=p0,
        bounds=([1e-6, 1e-6, 0.05], [1e6, 24.0, 3.0]),
        maxfev=20_000,
    )
    a, b, c = (float(v) for v in popt)
    rmse_rel = float(np.sqrt(np.mean(((f(t, a, b, c) - i) / i) ** 2)))
    return a, b, c, rmse_rel


def depth_at_duration(
    durations_hours: list[float], depths_mm: list[float], d: float
) -> float:
    """Piecewise-LINEAR interpolation of cumulative depth vs duration.

    Valid IDF depth–duration curves are concave in duration (marginal depth
    per hour decreases), so linear interpolation keeps the increment sequence
    non-increasing — which is what makes the alternating-block telescoping
    exact: the m largest blocks sum to D(m·dt) for every m."""
    t = np.asarray(durations_hours, dtype=float)
    y = np.asarray(depths_mm, dtype=float)
    order = np.argsort(t)
    return float(np.interp(d, t[order], y[order]))


# ---------------------------------------------------------------------------
# Patterns
# ---------------------------------------------------------------------------


def chicago_storm(
    durations_hours: list[float],
    intensities_mm_hr: list[float],
    storm_duration_hours: float,
    dt_hours: float,
    peak_ratio: float = 0.375,
) -> Hyetograph:
    """Keifer & Chu (1957) Chicago storm from an i = a/(t+b)^c IDF fit.

    Instantaneous intensity around the peak (time-to-peak fraction r):
        before peak:  τ = (t_p − t)/r,   after: τ = (t − t_p)/(1 − r)
        i(τ) = a·[(1 − c)·τ + b] / (τ + b)^(1+c)
    Discretized by numerically averaging i over each dt step (200 substeps),
    so the hyetograph integrates the analytic curve faithfully.
    """
    if not (0.05 <= peak_ratio <= 0.95):
        raise ValueError("peak_ratio must be within [0.05, 0.95]")
    a, b, c, rmse_rel = fit_idf_abc(durations_hours, intensities_mm_hr)

    n = int(round(storm_duration_hours / dt_hours))
    if abs(n * dt_hours - storm_duration_hours) > 1e-9 or n < 2:
        raise ValueError("storm duration must be a multiple of dt (≥ 2 steps)")
    tp = peak_ratio * storm_duration_hours

    def inst(t: float) -> float:
        tau = (tp - t) / peak_ratio if t <= tp else (t - tp) / (1 - peak_ratio)
        return a * ((1 - c) * tau + b) / (tau + b) ** (1 + c)

    depths = []
    sub = 200
    for k in range(n):
        ts = np.linspace(k * dt_hours, (k + 1) * dt_hours, sub, endpoint=False)
        depths.append(float(np.mean([inst(float(t)) for t in ts]) * dt_hours))

    warnings = []
    if rmse_rel > 0.10:
        warnings.append(
            f"IDF fit i=a/(t+b)^c relative RMSE {rmse_rel:.1%} — check fit adequacy"
        )

    return Hyetograph(
        pattern="chicago",
        dt_hours=dt_hours,
        duration_hours=storm_duration_hours,
        depths_mm=depths,
        total_depth_mm=float(sum(depths)),
        peak_index=int(np.argmax(depths)),
        params={
            "a": round(a, 4), "b": round(b, 4), "c": round(c, 4),
            "fitRmseRel": round(rmse_rel, 4), "peakRatio": peak_ratio,
        },
        warnings=warnings,
    )


def alternating_block(
    durations_hours: list[float],
    depths_mm: list[float],
    storm_duration_hours: float,
    dt_hours: float,
    peak_ratio: float = 0.5,
) -> Hyetograph:
    """Alternating-block (nested) storm from IDF depths (spec E2).

    Blocks are the increments of the depth–duration curve; sorted descending
    and placed alternately around the peak, so every centred sub-duration
    embeds its full IDF depth — the classic nested-storm property.
    """
    n = int(round(storm_duration_hours / dt_hours))
    if abs(n * dt_hours - storm_duration_hours) > 1e-9 or n < 1:
        raise ValueError("storm duration must be a multiple of dt")
    if storm_duration_hours > max(durations_hours) + 1e-9:
        raise ValueError("storm duration exceeds the IDF duration range")

    cum = [depth_at_duration(durations_hours, depths_mm, (k + 1) * dt_hours) for k in range(n)]
    increments = np.diff([0.0, *cum])
    if np.any(increments < -1e-9):
        raise ValueError("depth–duration curve not monotone — check IDF input")
    increments = np.clip(increments, 0, None)

    warnings: list[str] = []
    if np.any(np.diff(increments) > 1e-9):
        warnings.append(
            "depth–duration increments are not monotonically decreasing — the "
            "input IDF is not concave in duration; nested embedding is "
            "conservative (top-m blocks may exceed D(m·dt))"
        )
    if min(durations_hours) >= storm_duration_hours - 1e-9:
        warnings.append(
            "the IDF has no durations shorter than the storm — the sub-storm "
            "structure is a single block (degenerate). Use a station with "
            "sub-daily data, or the SCS/PMP mass-curve patterns which carry "
            "their own sub-daily shape."
        )

    order = np.argsort(increments)[::-1]  # descending blocks
    peak_idx = int(round(peak_ratio * (n - 1)))
    slots: list[float] = [0.0] * n
    offsets = [0]
    for k in range(1, n):
        offsets.append((k + 1) // 2 * (1 if k % 2 == 1 else -1))
    placed = []
    for off in offsets:
        pos = peak_idx + off
        pos = max(0, min(n - 1, pos))
        while pos in placed:
            pos = (pos + 1) % n
        placed.append(pos)
    for rank, pos in enumerate(placed):
        slots[pos] = float(increments[order[rank]])

    return Hyetograph(
        pattern="alt_block",
        dt_hours=dt_hours,
        duration_hours=storm_duration_hours,
        depths_mm=slots,
        total_depth_mm=float(sum(slots)),
        peak_index=int(np.argmax(slots)),
        params={"peakRatio": peak_ratio},
        warnings=warnings,
    )


# SCS/NRCS Type II 24-hour cumulative mass curve — widely published table
# (USDA TR-55 1986 / NEH Part 630). Fractions of 24-h depth vs hours.
SCS_TYPE2: list[tuple[float, float]] = [
    (0.0, 0.000), (2.0, 0.022), (4.0, 0.048), (6.0, 0.080), (7.0, 0.098),
    (8.0, 0.120), (8.5, 0.133), (9.0, 0.147), (9.5, 0.163), (10.0, 0.181),
    (10.5, 0.204), (11.0, 0.235), (11.5, 0.283), (12.0, 0.663), (12.5, 0.735),
    (13.0, 0.772), (13.5, 0.799), (14.0, 0.820), (16.0, 0.880), (20.0, 0.952),
    (24.0, 1.000),
]

MASS_CURVES: dict[str, list[tuple[float, float]]] = {
    "scs_type2": SCS_TYPE2,
}


def mass_curve_storm(
    curve_key: str,
    total_depth_mm: float,
    dt_hours: float,
    duration_hours: float = 24.0,
) -> Hyetograph:
    """Distribute a total depth by a dimensionless mass curve (SCS types).
    The curve's time base is scaled to the requested duration."""
    if curve_key not in MASS_CURVES:
        raise ValueError(
            f"unknown mass curve '{curve_key}' — available: {sorted(MASS_CURVES)}"
        )
    curve = MASS_CURVES[curve_key]
    base = curve[-1][0]
    n = int(round(duration_hours / dt_hours))
    if abs(n * dt_hours - duration_hours) > 1e-9 or n < 2:
        raise ValueError("duration must be a multiple of dt (≥ 2 steps)")

    xs = [p[0] / base for p in curve]
    ys = [p[1] for p in curve]
    cum = [float(np.interp((k + 1) * dt_hours / duration_hours, xs, ys)) for k in range(n)]
    depths = list(np.diff([0.0, *cum]) * total_depth_mm)

    return Hyetograph(
        pattern=curve_key,
        dt_hours=dt_hours,
        duration_hours=duration_hours,
        depths_mm=depths,
        total_depth_mm=float(sum(depths)),
        peak_index=int(np.argmax(depths)),
        params={"totalDepthMm": total_depth_mm, "curve": curve_key},
    )


def pmp_hyetograph(
    pmp_24h_mm: float,
    dt_hours: float,
    peak_ratio: float = 0.5,
) -> Hyetograph:
    """PMP design hyetograph (spec E2): alternating block on the WMO-1045
    Figure 4.8 maximum depth–duration curve scaled to the 24-h PMP."""
    durations = [1.0, 3.0, 6.0, 12.0, 18.0, 24.0]
    depths = [pmp_24h_mm * depth_duration_fraction(d) for d in durations]
    h = alternating_block(durations, depths, 24.0, dt_hours, peak_ratio)
    h.pattern = "pmp"
    h.params["pmp24hMm"] = pmp_24h_mm
    h.params["depthDurationSource"] = "WMO-1045 Figure 4.8 (Huff 1967)"
    return h
