"""Freeboard assembly + directional scan (spec G3, F3).

The CDA-aligned freeboard summary lists each component explicitly:
wave runup + wind setup + analyst allowances (settlement, seiche, safety),
with every input echoed so the table stands alone in a report.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .fetch import saville_effective_fetch
from .prediction import overland_to_overwater, smb_bretschneider, spm84
from .runup import runup_hunt, runup_taw, wind_setup_zuider_zee


@dataclass
class FreeboardComponents:
    hs_m: float
    t_s: float
    runup_m: float
    setup_m: float
    allowances_m: dict[str, float]
    total_freeboard_m: float
    inputs: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "hsM": self.hs_m,
            "tS": self.t_s,
            "runupM": round(self.runup_m, 3),
            "setupM": round(self.setup_m, 4),
            "allowancesM": self.allowances_m,
            "totalFreeboardM": round(self.total_freeboard_m, 3),
            "inputs": self.inputs,
        }


def compute_freeboard(
    u_land_ms: float,
    fetch_km: float,
    avg_depth_m: float,
    slope_v_per_h: float,
    roughness_gamma_f: float,
    wave_method: str = "smb",
    runup_method: str = "taw2002",
    rl_override: float | None = None,
    allowances_m: dict[str, float] | None = None,
) -> FreeboardComponents:
    """Full chain: overland→overwater → waves → runup + setup → freeboard."""
    u_water, rl = overland_to_overwater(u_land_ms, rl_override)

    wave = (
        smb_bretschneider(u_water, fetch_km, avg_depth_m)
        if wave_method == "smb"
        else spm84(u_water, fetch_km)
    )

    runup = (
        runup_taw(wave.hs_m, wave.t_s, slope_v_per_h, gamma_f=roughness_gamma_f)
        if runup_method == "taw2002"
        else runup_hunt(wave.hs_m, wave.t_s, slope_v_per_h, gamma_f=roughness_gamma_f)
    )

    setup = wind_setup_zuider_zee(u_water * 3.6, fetch_km, avg_depth_m)
    allow = allowances_m or {}
    total = runup.runup_m + setup + sum(allow.values())

    return FreeboardComponents(
        hs_m=wave.hs_m,
        t_s=wave.t_s,
        runup_m=runup.runup_m,
        setup_m=setup,
        allowances_m=allow,
        total_freeboard_m=total,
        inputs={
            "uLandMs": u_land_ms,
            "uWaterMs": round(u_water, 3),
            "rl": rl,
            "fetchKm": fetch_km,
            "avgDepthM": avg_depth_m,
            "slopeVPerH": slope_v_per_h,
            "gammaF": roughness_gamma_f,
            "waveMethod": wave.method,
            "runupMethod": runup.method,
            "xi": round(runup.xi, 3),
            "fullyDeveloped": wave.fully_developed,
        },
    )


def directional_scan(
    site_lat: float,
    site_lon: float,
    polygon_lonlat: list[tuple[float, float]],
    u_land_ms: float,
    avg_depth_m: float,
    directions_deg: list[float] | None = None,
) -> dict:
    """Critical-direction selection (spec acceptance): effective fetch and
    SMB wave for each direction; the governing case maximizes Hs."""
    dirs = directions_deg or [d * 22.5 for d in range(16)]
    u_water, _ = overland_to_overwater(u_land_ms)
    rows = []
    for d in dirs:
        f = saville_effective_fetch(site_lat, site_lon, polygon_lonlat, d)
        if f.effective_fetch_km <= 0:
            rows.append({"directionDeg": d, "effectiveFetchKm": 0.0, "hsM": 0.0, "tS": 0.0})
            continue
        w = smb_bretschneider(u_water, f.effective_fetch_km, avg_depth_m)
        rows.append(
            {
                "directionDeg": d,
                "effectiveFetchKm": f.effective_fetch_km,
                "hsM": w.hs_m,
                "tS": w.t_s,
            }
        )
    critical = max(rows, key=lambda r: r["hsM"])
    return {"rows": rows, "critical": critical}
