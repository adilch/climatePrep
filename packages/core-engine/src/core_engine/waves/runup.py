"""Wave runup and wind setup (spec G2).

Wind setup — Zuider Zee equation (USBR/SPM lineage):
    S (m) = U² · F / (63 200 · D)     with U in km/h, F in km, D in m
(the widely published SI form; the 63 200 constant is the unit conversion of
the classic S = U²F/(1400·D) US-unit relation).

Runup:
- Hunt (1959):  R/H = ξ · γf   for breaking waves (ξ ≤ ~2.5), capped for
  non-breaking at R/H = 2.2·γf (SPM practice for smooth slopes ~2.2–3.0);
  ξ = tanα / √(H/L0), L0 = g·T²/2π.
- TAW (2002) 2%-runup:  Ru2%/Hm0 = 1.65 · γb · γf · γβ · ξm
  with maximum  γf · γβ · (4.0 − 1.5/√(γb·ξm)).

Roughness factors γf (TAW Table): smooth concrete/asphalt 1.0, one rock
layer on impermeable core 0.60, two+ rock layers (riprap) 0.55, grass 1.0.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

G = 9.80665

ROUGHNESS_PRESETS: dict[str, float] = {
    "smooth": 1.0,
    "grass": 1.0,
    "rock_one_layer": 0.60,
    "riprap": 0.55,
}


def wind_setup_zuider_zee(u_kmh: float, fetch_km: float, avg_depth_m: float) -> float:
    """Wind setup S (m)."""
    if avg_depth_m <= 0:
        raise ValueError("average depth must be positive")
    return u_kmh**2 * fetch_km / (63_200.0 * avg_depth_m)


def surf_similarity(hs_m: float, t_s: float, slope_v_per_h: float) -> float:
    """Iribarren/surf-similarity ξ = tanα / √(Hs/L0) with L0 = gT²/2π."""
    if hs_m <= 0 or t_s <= 0 or slope_v_per_h <= 0:
        raise ValueError("Hs, T and slope must be positive")
    l0 = G * t_s**2 / (2 * np.pi)
    return slope_v_per_h / np.sqrt(hs_m / l0)


@dataclass
class RunupResult:
    method: str
    xi: float
    gamma_f: float
    runup_m: float
    breaking: bool

    def to_dict(self) -> dict:
        return {
            "method": self.method,
            "xi": round(self.xi, 3),
            "gammaF": self.gamma_f,
            "runupM": round(self.runup_m, 3),
            "breaking": self.breaking,
        }


def runup_hunt(
    hs_m: float, t_s: float, slope_v_per_h: float, gamma_f: float = 1.0
) -> RunupResult:
    xi = float(surf_similarity(hs_m, t_s, slope_v_per_h))
    breaking = bool(xi <= 2.5)
    ratio = xi if breaking else 2.2
    return RunupResult(
        method="hunt", xi=xi, gamma_f=gamma_f,
        runup_m=float(ratio * hs_m * gamma_f), breaking=breaking,
    )


def runup_taw(
    hs_m: float,
    t_s: float,
    slope_v_per_h: float,
    gamma_f: float = 1.0,
    gamma_b: float = 1.0,
    gamma_beta: float = 1.0,
) -> RunupResult:
    xi = float(surf_similarity(hs_m, t_s, slope_v_per_h))
    r_breaking = 1.65 * gamma_b * gamma_f * gamma_beta * xi
    r_max = gamma_f * gamma_beta * (4.0 - 1.5 / np.sqrt(max(gamma_b * xi, 1e-9)))
    ratio = min(r_breaking, r_max)
    return RunupResult(
        method="taw2002", xi=xi, gamma_f=gamma_f,
        runup_m=float(ratio * hs_m), breaking=bool(r_breaking <= r_max),
    )
