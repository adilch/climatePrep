"""Hershfield statistical PMP (WMO-1045 Chapter 4; Hershfield 1961a/b, 1965).

Procedure (manual section 4.3):
  (a) adjust mean and SD for the maximum observed event (Figures 4.2, 4.3)
      and for record length (Figure 4.4);
  (b) Km from Figure 4.1 using the ADJUSTED mean and the duration;
  (c) point PMP = adjusted_mean + Km × adjusted_SD          (Equation 4.2);
  (d) fixed→true interval factor (1.13 single interval; 1.02 / 1.01 for
      6 / 24 hourly observational units — Figure 4.5, Weiss 1964);
  (e) point→area reduction (Figure 4.7 — the manual's IDEALIZED example
      curves for the western United States; site-specific curves are
      recommended by the manual itself).

Digitization anchors (exact, from the manual's Table 4.1 worked example,
n = 25): Fig 4.2 → (ratio 0.88 → 0.91), (0.95 → 0.98), (0.97 → 1.01);
Fig 4.3 ≈ 1.15 × ratio (matches printed 1.04/0.93/0.49 within ±0.01);
Fig 4.4(25) = (mean 1.01, SD 1.05); Km(1 h, 25.4) = 14, Km(6 h, 53.6) = 14,
Km(24 h, 72.4) = 16; ARF(500 km²) = 0.66 / 0.85 / 0.90 for 1 / 6 / 24 h.
Values between anchors are approximate — verify against the figures.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import numpy as np

# ---------------------------------------------------------------------------
# Digitized default curves (see module docstring for provenance + anchors)
# ---------------------------------------------------------------------------

# Figure 4.1 — Km vs mean of annual series (mm), per duration (hours).
# Each curve: (mean_mm, Km) points, monotone non-increasing; max Km = 20.
KM_CURVES: dict[float, list[tuple[float, float]]] = {
    24.0: [(0, 20.0), (72.4, 16.0), (200, 14.5), (400, 13.5), (600, 13.0)],
    6.0: [(0, 20.0), (53.6, 14.0), (200, 12.0), (400, 10.5), (600, 10.0)],
    1.0: [(0, 20.0), (25.4, 14.0), (100, 11.0), (300, 8.0), (600, 6.0)],
    5.0 / 60.0: [(0, 20.0), (10, 15.0), (20, 12.0), (30, 10.0), (600, 10.0)],
}

# Figure 4.4 — record-length adjustment (percent → factor), anchored at
# n=25 → (1.01, 1.05); approaches 1.0 by n=50 (manual text).
FIG44_MEAN: list[tuple[float, float]] = [
    (10, 1.06), (15, 1.035), (20, 1.02), (25, 1.01), (30, 1.006), (50, 1.0), (100, 1.0),
]
FIG44_SD: list[tuple[float, float]] = [
    (10, 1.25), (15, 1.16), (20, 1.09), (25, 1.05), (30, 1.03), (50, 1.0), (100, 1.0),
]

# Figure 4.5 (Weiss 1964) — same defaults as core_engine.qc.aggregate.
OBS_UNITS_FACTORS: dict[int, float] = {
    1: 1.13, 2: 1.04, 3: 1.03, 4: 1.02, 5: 1.02, 6: 1.02, 8: 1.01, 12: 1.01, 24: 1.01,
}

# Figure 4.7 — area-reduction (% of point value) per duration; anchored at
# 500 km² from the worked example. Point values apply up to 25 km².
ARF_CURVES: dict[float, list[tuple[float, float]]] = {
    24.0: [(25, 1.00), (200, 0.95), (500, 0.90), (1000, 0.88)],
    12.0: [(25, 1.00), (200, 0.93), (500, 0.88), (1000, 0.85)],
    6.0: [(25, 1.00), (200, 0.90), (500, 0.85), (1000, 0.81)],
    3.0: [(25, 1.00), (200, 0.85), (500, 0.76), (1000, 0.70)],
    1.0: [(25, 1.00), (200, 0.80), (500, 0.66), (1000, 0.60)],
}

# Figure 4.8 (Huff 1967) — maximum depth–duration curve, % of 24-hour PMP.
# Anchors from manual text: 1 h → 34%, 6 h → 84%.
FIG48_DEPTH_DURATION: list[tuple[float, float]] = [
    (0, 0.0), (1, 0.34), (3, 0.62), (6, 0.84), (12, 0.94), (18, 0.98), (24, 1.0),
]


def _interp(points: list[tuple[float, float]], x: float) -> float:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return float(np.interp(x, xs, ys))


def _nearest_duration_curve(curves: dict[float, list], duration_hours: float):
    key = min(curves.keys(), key=lambda d: abs(np.log(d) - np.log(max(duration_hours, 1e-6))))
    return key, curves[key]


def km_hershfield(adjusted_mean_mm: float, duration_hours: float) -> tuple[float, float]:
    """Km from the digitized Figure 4.1; returns (Km, curve_duration_used)."""
    key, curve = _nearest_duration_curve(KM_CURVES, duration_hours)
    return _interp(curve, adjusted_mean_mm), key


def fig42_mean_adjustment(ratio_mean: float, n: int) -> float:
    """Figure 4.2 — adjustment of mean for maximum observed event.

    Anchored EXACTLY at n=25 to the worked example: (0.88→0.91),
    (0.95→0.98), (0.97→1.01). Other record lengths shift the curve:
    shorter records adjust more (approximate; verify against the figure).
    """
    base = _interp([(0.7, 0.74), (0.88, 0.91), (0.95, 0.98), (0.97, 1.01), (1.0, 1.01)], ratio_mean)
    # Record-length spread: n=10 lowers the factor ~4 points at low ratios.
    n_shift = _interp([(10, -0.04), (15, -0.025), (20, -0.01), (25, 0.0), (50, 0.005)], n)
    return round(base + n_shift * (1.0 - ratio_mean) / 0.3, 4)


def fig43_sd_adjustment(ratio_sd: float, n: int) -> float:
    """Figure 4.3 — adjustment of SD for maximum observed event.

    n=25 anchored as factor ≈ 1.15 × ratio (matches the printed example
    factors within ±0.01). Shorter records use a larger multiplier
    (approximate; verify against the figure).
    """
    mult = _interp([(10, 1.30), (15, 1.25), (30, 1.13), (50, 1.05)], n) if n != 25 else 1.15
    if n == 25:
        mult = 1.15
    return round(min(ratio_sd * mult, 1.3), 4)


def fig44_length_adjustment(n: int) -> tuple[float, float]:
    """Figure 4.4 — sample-size adjustment (mean_factor, sd_factor)."""
    return _interp(FIG44_MEAN, n), _interp(FIG44_SD, n)


def obs_units_factor(n_units: int) -> float:
    """Figure 4.5 (Weiss 1964) fixed→true interval factor."""
    if n_units in OBS_UNITS_FACTORS:
        return OBS_UNITS_FACTORS[n_units]
    smaller = [k for k in OBS_UNITS_FACTORS if k < n_units]
    return OBS_UNITS_FACTORS[max(smaller)] if smaller else 1.13


def arf_fig47(area_km2: float, duration_hours: float) -> tuple[float, float]:
    """Figure 4.7 area-reduction factor; returns (arf, curve_duration_used).
    Point values apply without reduction up to 25 km² (manual §4.2.5)."""
    if area_km2 <= 25:
        return 1.0, duration_hours
    key, curve = _nearest_duration_curve(ARF_CURVES, duration_hours)
    return _interp(curve, min(area_km2, 1000.0)), key


def depth_duration_fraction(duration_hours: float) -> float:
    """Figure 4.8 maximum depth–duration curve (fraction of 24-h PMP)."""
    return _interp(FIG48_DEPTH_DURATION, duration_hours)


# ---------------------------------------------------------------------------
# The Hershfield computation with full step logging
# ---------------------------------------------------------------------------


@dataclass
class PmpStep:
    key: str
    label: str
    value: float
    source: str
    note: str = ""

    def to_dict(self) -> dict:
        return {
            "key": self.key,
            "label": self.label,
            "value": self.value,
            "source": self.source,
            "note": self.note,
        }


@dataclass
class HershfieldResult:
    duration_hours: float
    n: int
    mean_mm: float
    sd_mm: float
    mean_excl_max_mm: float
    sd_excl_max_mm: float
    adjusted_mean_mm: float
    adjusted_sd_mm: float
    km: float
    pmp_point_mm: float          # Eq 4.2 result, before interval adjustment
    pmp_true_interval_mm: float  # after fixed→true interval factor
    pmp_areal_mm: Optional[float]  # after ARF (None when area not given)
    area_km2: Optional[float]
    max_observed_mm: float
    steps: list[PmpStep] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "durationHours": self.duration_hours,
            "n": self.n,
            "meanMm": self.mean_mm,
            "sdMm": self.sd_mm,
            "meanExclMaxMm": self.mean_excl_max_mm,
            "sdExclMaxMm": self.sd_excl_max_mm,
            "adjustedMeanMm": self.adjusted_mean_mm,
            "adjustedSdMm": self.adjusted_sd_mm,
            "km": self.km,
            "pmpPointMm": self.pmp_point_mm,
            "pmpTrueIntervalMm": self.pmp_true_interval_mm,
            "pmpArealMm": self.pmp_areal_mm,
            "areaKm2": self.area_km2,
            "maxObservedMm": self.max_observed_mm,
            "steps": [s.to_dict() for s in self.steps],
        }


def hershfield_pmp(
    values: list[float],
    duration_hours: float,
    n_obs_units: int = 1,
    area_km2: Optional[float] = None,
    km_override: Optional[float] = None,
    fig42_override: Optional[float] = None,
    fig43_override: Optional[float] = None,
    fig44_mean_override: Optional[float] = None,
    fig44_sd_override: Optional[float] = None,
    interval_factor_override: Optional[float] = None,
    arf_override: Optional[float] = None,
    apply_outlier_adjustment: bool = True,
    apply_length_adjustment: bool = True,
    apply_interval_adjustment: bool = True,
) -> HershfieldResult:
    """WMO-1045 §4.3 procedure with every factor logged (spec M5 acceptance).

    Overrides exist for every figure-derived factor so the engineer can use
    values read directly from the manual (or regional studies) — the override
    is then logged as the source.
    """
    x = np.asarray(values, dtype=float)
    x = x[~np.isnan(x)]
    n = len(x)
    if n < 10:
        raise ValueError(
            f"only {n} years — WMO-1045 §4.5: records of less than 10 years "
            "should not be used at all (≥20 recommended)"
        )

    steps: list[PmpStep] = []

    mean = float(np.mean(x))
    sd = float(np.std(x, ddof=1))
    i_max = int(np.argmax(x))
    x_excl = np.delete(x, i_max)
    mean_excl = float(np.mean(x_excl))
    sd_excl = float(np.std(x_excl, ddof=1))
    max_obs = float(x[i_max])

    steps.append(PmpStep("stats", f"X̄n / Sn from {n}-year series", round(mean, 2), "computed",
                         f"Sn = {sd:.2f} mm; max observed = {max_obs:.1f} mm"))

    # (a1) outlier adjustment — Figures 4.2 / 4.3
    if apply_outlier_adjustment:
        r_mean = mean_excl / mean
        r_sd = sd_excl / sd
        f42 = fig42_override if fig42_override is not None else fig42_mean_adjustment(r_mean, n)
        f43 = fig43_override if fig43_override is not None else fig43_sd_adjustment(r_sd, n)
        steps.append(PmpStep("fig42", "Mean adjustment for max observed (Fig 4.2)", f42,
                             "override" if fig42_override is not None else "digitized Fig 4.2",
                             f"X̄n−m/X̄n = {r_mean:.3f}"))
        steps.append(PmpStep("fig43", "SD adjustment for max observed (Fig 4.3)", f43,
                             "override" if fig43_override is not None else "digitized Fig 4.3",
                             f"Sn−m/Sn = {r_sd:.3f}"))
    else:
        f42 = f43 = 1.0
        steps.append(PmpStep("fig42", "Outlier adjustment", 1.0, "disabled by analyst"))

    # (a2) record-length adjustment — Figure 4.4
    if apply_length_adjustment:
        d44_mean, d44_sd = fig44_length_adjustment(n)
        f44_mean = fig44_mean_override if fig44_mean_override is not None else d44_mean
        f44_sd = fig44_sd_override if fig44_sd_override is not None else d44_sd
        steps.append(PmpStep("fig44_mean", "Mean adjustment for record length (Fig 4.4)",
                             round(f44_mean, 4),
                             "override" if fig44_mean_override is not None else "digitized Fig 4.4",
                             f"n = {n}"))
        steps.append(PmpStep("fig44_sd", "SD adjustment for record length (Fig 4.4)",
                             round(f44_sd, 4),
                             "override" if fig44_sd_override is not None else "digitized Fig 4.4",
                             f"n = {n}"))
    else:
        f44_mean = f44_sd = 1.0
        steps.append(PmpStep("fig44_mean", "Record-length adjustment", 1.0, "disabled by analyst"))

    adj_mean = mean * f42 * f44_mean
    adj_sd = sd * f43 * f44_sd
    steps.append(PmpStep("adjusted_stats", "Adjusted X̄n / Sn", round(adj_mean, 2), "computed",
                         f"adjusted Sn = {adj_sd:.2f} mm"))

    # (b) Km — Figure 4.1
    if km_override is not None:
        km = km_override
        steps.append(PmpStep("km", "Km frequency factor", km, "override (analyst)",
                             "verify against WMO-1045 Figure 4.1"))
    else:
        km, curve_used = km_hershfield(adj_mean, duration_hours)
        km = round(km, 2)
        steps.append(PmpStep("km", "Km frequency factor (Fig 4.1)", km, "digitized Fig 4.1",
                             f"adjusted mean {adj_mean:.1f} mm on the {curve_used:g}-h curve"))

    # (c) Equation 4.2
    pmp_point = adj_mean + km * adj_sd
    steps.append(PmpStep("eq42", "Point PMP = X̄a + Km·Sa (Eq 4.2)", round(pmp_point, 1), "computed"))

    # (d) fixed→true interval — Figure 4.5
    if apply_interval_adjustment:
        f_int = (interval_factor_override if interval_factor_override is not None
                 else obs_units_factor(n_obs_units))
        steps.append(PmpStep("interval", "Fixed→true interval factor (Fig 4.5, Weiss 1964)", f_int,
                             "override" if interval_factor_override is not None else "Weiss table",
                             f"{n_obs_units} observational unit(s) per duration"))
    else:
        f_int = 1.0
        steps.append(PmpStep("interval", "Interval adjustment", 1.0, "disabled by analyst",
                             "only valid if the series is already true-interval"))
    pmp_true = pmp_point * f_int

    # (e) point→area — Figure 4.7
    pmp_areal: Optional[float] = None
    if area_km2 is not None:
        if arf_override is not None:
            arf = arf_override
            steps.append(PmpStep("arf", "Area-reduction factor", arf, "override (analyst)",
                                 f"area {area_km2:g} km²"))
        else:
            arf, curve_used = arf_fig47(area_km2, duration_hours)
            arf = round(arf, 3)
            steps.append(PmpStep("arf", "Area-reduction factor (Fig 4.7)", arf,
                                 "digitized Fig 4.7 — idealized western-US curves; "
                                 "develop site-specific curves per WMO-1045 §4.5",
                                 f"area {area_km2:g} km² on the {curve_used:g}-h curve"))
        pmp_areal = pmp_true * arf

    return HershfieldResult(
        duration_hours=duration_hours,
        n=n,
        mean_mm=round(mean, 2),
        sd_mm=round(sd, 2),
        mean_excl_max_mm=round(mean_excl, 2),
        sd_excl_max_mm=round(sd_excl, 2),
        adjusted_mean_mm=round(adj_mean, 2),
        adjusted_sd_mm=round(adj_sd, 2),
        km=km,
        pmp_point_mm=round(pmp_point, 1),
        pmp_true_interval_mm=round(pmp_true, 1),
        pmp_areal_mm=round(pmp_areal, 1) if pmp_areal is not None else None,
        area_km2=area_km2,
        max_observed_mm=max_obs,
        steps=steps,
    )


def dad_table(
    pmp_point_by_duration: dict[float, float],
    areas_km2: list[float],
) -> list[dict]:
    """Depth–area–duration table (spec D2) from the digitized Figure 4.7
    curves: rows = areas, values = areal PMP per duration."""
    rows = []
    for area in areas_km2:
        row: dict = {"areaKm2": area, "depthsMm": {}}
        for dur, pmp in sorted(pmp_point_by_duration.items()):
            arf, _ = arf_fig47(area, dur)
            row["depthsMm"][str(dur)] = round(pmp * arf, 1)
        rows.append(row)
    return rows


def seasonal_distribution(monthly_max_means: dict[int, float]) -> list[dict]:
    """Seasonal distribution of PMP (spec D2): monthly fractions of the
    all-season value from the ratios of monthly mean annual maxima
    (month → mean of that month's annual maxima)."""
    peak = max(monthly_max_means.values())
    if peak <= 0:
        raise ValueError("monthly means must be positive")
    return [
        {"month": m, "fraction": round(v / peak, 3)}
        for m, v in sorted(monthly_max_means.items())
    ]


def moisture_maximization_stub() -> None:
    """Deterministic PMP hooks (spec D3) land in Phase 3: dewpoint /
    precipitable-water moisture maximization and storm transposition."""
    raise NotImplementedError(
        "Moisture maximization / storm transposition is Phase 3 (spec D3)."
    )
