"""Wave hindcasting for reservoirs (spec G1).

Two published methods, both closed-form:

SMB / Bretschneider (deep + depth-limited tanh forms; SPM 1977 lineage,
still the standard for reservoir freeboard in Canadian dam practice):
    deep water:
        g·Hs/U² = 0.283 · tanh[0.0125 · (g·F/U²)^0.42]
        g·Ts/U  = 7.54  · tanh[0.077  · (g·F/U²)^0.25]
    depth-limited (Bretschneider 1970): the same growth terms modulated by
        tanh[0.530·(g·d/U²)^0.75]  (height) and tanh[0.833·(g·d/U²)^0.375]
        (period), per the SPM shallow-water forecasting equations.

SPM 1984 (wind-stress factor):
        UA = 0.71 · U^1.23                       (U in m/s)
        g·Hs/UA² = 1.6e-3 · (g·F/UA²)^(1/2)      capped at 0.243 (fully dev.)
        g·Tp/UA  = 2.857e-1 · (g·F/UA²)^(1/3)    capped at 8.134
        t_min: g·t/UA = 68.8 · (g·F/UA²)^(2/3)   (duration needed)

Overland→overwater (spec F2): SPM Fig. 3-14 ratio R_L digitized —
    R_L ≈ 1.2 below ~10 m/s declining through 1.0 near ~18.5 m/s to 0.9
    at high speeds; overridable, and logged.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

G = 9.80665

# SPM Figure 3-14 digitization (U_land m/s → R_L). Overridable by caller.
RL_CURVE: list[tuple[float, float]] = [
    (0.0, 1.30), (5.0, 1.22), (10.0, 1.13), (15.0, 1.04),
    (18.5, 1.00), (25.0, 0.93), (35.0, 0.88), (60.0, 0.85),
]


def overland_to_overwater(u_land_ms: float, rl_override: float | None = None) -> tuple[float, float]:
    """Returns (U_water, R_L used)."""
    rl = rl_override if rl_override is not None else float(
        np.interp(u_land_ms, [p[0] for p in RL_CURVE], [p[1] for p in RL_CURVE])
    )
    return u_land_ms * rl, round(rl, 3)


@dataclass
class WaveResult:
    method: str
    u_ms: float
    fetch_km: float
    depth_m: float | None
    hs_m: float
    t_s: float               # SMB: significant period Ts; SPM-84: peak Tp
    fully_developed: bool
    min_duration_hr: float | None
    wavelength_deep_m: float

    def to_dict(self) -> dict:
        return {
            "method": self.method,
            "uMs": self.u_ms,
            "fetchKm": self.fetch_km,
            "depthM": self.depth_m,
            "hsM": self.hs_m,
            "tS": self.t_s,
            "fullyDeveloped": self.fully_developed,
            "minDurationHr": self.min_duration_hr,
            "wavelengthDeepM": self.wavelength_deep_m,
        }


def smb_bretschneider(
    u_ms: float, fetch_km: float, depth_m: float | None = None
) -> WaveResult:
    """SMB/Bretschneider hindcast; depth-limited when depth_m is given."""
    if u_ms <= 0 or fetch_km <= 0:
        raise ValueError("wind speed and fetch must be positive")
    F = fetch_km * 1000.0
    gF_U2 = G * F / u_ms**2

    h_growth = 0.0125 * gF_U2**0.42
    t_growth = 0.077 * gF_U2**0.25

    if depth_m is not None and depth_m > 0:
        gd_U2 = G * depth_m / u_ms**2
        dh = np.tanh(0.530 * gd_U2**0.75)
        dt = np.tanh(0.833 * gd_U2**0.375)
        hs = 0.283 * u_ms**2 / G * dh * np.tanh(h_growth / dh)
        ts = 7.54 * u_ms / G * dt * np.tanh(t_growth / dt)
    else:
        hs = 0.283 * u_ms**2 / G * np.tanh(h_growth)
        ts = 7.54 * u_ms / G * np.tanh(t_growth)

    fully = bool(np.tanh(h_growth) > 0.999)
    return WaveResult(
        method="smb",
        u_ms=round(u_ms, 3),
        fetch_km=fetch_km,
        depth_m=depth_m,
        hs_m=round(float(hs), 3),
        t_s=round(float(ts), 3),
        fully_developed=fully,
        min_duration_hr=None,
        wavelength_deep_m=round(float(G * ts**2 / (2 * np.pi)), 2),
    )


def spm84(u_ms: float, fetch_km: float) -> WaveResult:
    """SPM (1984) deep-water hindcast with the wind-stress factor UA."""
    if u_ms <= 0 or fetch_km <= 0:
        raise ValueError("wind speed and fetch must be positive")
    F = fetch_km * 1000.0
    ua = 0.71 * u_ms**1.23
    gF_UA2 = G * F / ua**2

    h_nd = min(1.6e-3 * gF_UA2**0.5, 0.243)
    t_nd = min(2.857e-1 * gF_UA2 ** (1.0 / 3.0), 8.134)
    fully = h_nd >= 0.243 - 1e-9

    hs = h_nd * ua**2 / G
    tp = t_nd * ua / G
    t_min_s = 68.8 * gF_UA2 ** (2.0 / 3.0) * ua / G

    return WaveResult(
        method="spm84",
        u_ms=round(u_ms, 3),
        fetch_km=fetch_km,
        depth_m=None,
        hs_m=round(float(hs), 3),
        t_s=round(float(tp), 3),
        fully_developed=fully,
        min_duration_hr=round(float(t_min_s / 3600.0), 2),
        wavelength_deep_m=round(float(G * tp**2 / (2 * np.pi)), 2),
    )
