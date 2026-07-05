"""Wind rose / directional statistics (spec F2).

Bins hourly wind observations into 16 compass sectors × speed classes and
reports per-sector frequency, mean and max speed. Directions are
meteorological ("blowing FROM", degrees clockwise from north).
"""

from __future__ import annotations

import numpy as np

SECTORS = 16
SECTOR_DEG = 360.0 / SECTORS
SECTOR_NAMES = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
]
DEFAULT_SPEED_BINS = [0.0, 10.0, 20.0, 30.0, 40.0, 60.0]  # km/h class edges


def wind_rose(
    speeds_kmh: list[float | None],
    directions_deg: list[float | None],
    speed_bins: list[float] | None = None,
) -> dict:
    """Returns sector stats + a frequency matrix [sector][speed_class] (%)."""
    if len(speeds_kmh) != len(directions_deg):
        raise ValueError("speeds/directions length mismatch")
    bins = speed_bins or DEFAULT_SPEED_BINS

    spd = np.array([np.nan if v is None else float(v) for v in speeds_kmh])
    dirn = np.array([np.nan if v is None else float(v) for v in directions_deg])
    mask = ~np.isnan(spd) & ~np.isnan(dirn) & (spd > 0)
    spd, dirn = spd[mask], dirn[mask] % 360.0
    n = len(spd)
    if n == 0:
        raise ValueError("no valid speed/direction pairs")

    # Sector 0 (N) spans [-11.25°, +11.25°).
    sector_idx = np.floor(((dirn + SECTOR_DEG / 2) % 360.0) / SECTOR_DEG).astype(int)
    class_idx = np.clip(np.digitize(spd, bins) - 1, 0, len(bins) - 1)

    matrix = np.zeros((SECTORS, len(bins)))
    for s, c in zip(sector_idx, class_idx):
        matrix[s, c] += 1

    sectors = []
    for s in range(SECTORS):
        in_sector = sector_idx == s
        count = int(in_sector.sum())
        sectors.append(
            {
                "sector": SECTOR_NAMES[s],
                "centerDeg": round(s * SECTOR_DEG, 2),
                "frequencyPct": round(100.0 * count / n, 2),
                "meanKmh": round(float(spd[in_sector].mean()), 1) if count else 0.0,
                "maxKmh": round(float(spd[in_sector].max()), 1) if count else 0.0,
            }
        )

    prevailing = max(sectors, key=lambda x: x["frequencyPct"])
    strongest = max(sectors, key=lambda x: x["maxKmh"])
    return {
        "nObservations": n,
        "calmPct": round(100.0 * (1 - n / max(len(speeds_kmh), 1)), 2),
        "speedBinsKmh": bins,
        "sectors": sectors,
        "frequencyMatrixPct": (100.0 * matrix / n).round(3).tolist(),
        "prevailingSector": prevailing["sector"],
        "strongestSector": strongest["sector"],
    }
