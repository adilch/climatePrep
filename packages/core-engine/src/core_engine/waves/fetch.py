"""Saville effective fetch from reservoir geometry (spec F3; Saville 1954,
as standardized in the Shore Protection Manual and USBR/CDA practice).

Method: from the dam location, cast the central radial along the wind
direction and radials at 6° increments to ±42° (15 radials: the central
ray plus seven each side — the standard Saville/SPM construction). Each radial's
fetch x_i is the distance to the FARTHEST reservoir boundary crossing
(water continuing from the site). Effective fetch:

    F_eff = Σ (x_i · cos²α_i) / Σ cos α_i

Geometry is evaluated on a local equirectangular plane centred at the site
(adequate at reservoir scale, < ~50 km).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

EARTH_RADIUS_M = 6_371_008.8


@dataclass
class FetchResult:
    direction_deg: float          # meteorological "from" converted to "toward" handled by caller
    effective_fetch_km: float
    central_fetch_km: float
    radials: list[dict] = field(default_factory=list)  # [{angleDeg, fetchKm, weight}]

    def to_dict(self) -> dict:
        return {
            "directionDeg": self.direction_deg,
            "effectiveFetchKm": self.effective_fetch_km,
            "centralFetchKm": self.central_fetch_km,
            "radials": self.radials,
        }


def _to_local_xy(
    lat0: float, lon0: float, coords: list[tuple[float, float]]
) -> np.ndarray:
    """Equirectangular projection to metres around (lat0, lon0).
    Input coords are (lon, lat) pairs (GeoJSON order)."""
    k = np.pi / 180.0 * EARTH_RADIUS_M
    out = np.empty((len(coords), 2))
    cos0 = np.cos(np.radians(lat0))
    for i, (lon, lat) in enumerate(coords):
        out[i, 0] = (lon - lon0) * k * cos0
        out[i, 1] = (lat - lat0) * k
    return out


def _ray_polygon_max_distance(
    origin: np.ndarray, direction: np.ndarray, poly: np.ndarray
) -> float:
    """Farthest intersection distance (m) of ray origin+t·direction (t>0)
    with the polygon boundary; 0.0 when the ray never crosses."""
    t_max = 0.0
    n = len(poly)
    ox, oy = origin
    dx, dy = direction
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        ex, ey = x2 - x1, y2 - y1
        denom = dx * ey - dy * ex
        if abs(denom) < 1e-12:
            continue  # parallel
        # Solve origin + t·d = p1 + s·e
        t = ((x1 - ox) * ey - (y1 - oy) * ex) / denom
        s = ((x1 - ox) * dy - (y1 - oy) * dx) / denom
        if t > 1e-9 and -1e-9 <= s <= 1 + 1e-9:
            t_max = max(t_max, t)
    return t_max


def saville_effective_fetch(
    site_lat: float,
    site_lon: float,
    polygon_lonlat: list[tuple[float, float]],
    wind_toward_deg: float,
    half_angle_deg: float = 42.0,
    step_deg: float = 6.0,
) -> FetchResult:
    """Saville effective fetch along `wind_toward_deg` (degrees clockwise
    from north — the direction the wind BLOWS TOWARD, i.e. the wave travel
    direction from the dam into the reservoir).
    """
    if len(polygon_lonlat) < 3:
        raise ValueError("reservoir polygon needs at least 3 vertices")
    poly = _to_local_xy(site_lat, site_lon, polygon_lonlat)
    origin = np.array([0.0, 0.0])

    angles = np.arange(-half_angle_deg, half_angle_deg + 1e-9, step_deg)
    radials = []
    num = 0.0
    den = 0.0
    central = 0.0
    for a in angles:
        bearing = np.radians(wind_toward_deg + a)
        direction = np.array([np.sin(bearing), np.cos(bearing)])  # N=+y, E=+x
        dist_m = _ray_polygon_max_distance(origin, direction, poly)
        cos_a = np.cos(np.radians(a))
        num += dist_m * cos_a * cos_a
        den += cos_a
        if abs(a) < 1e-9:
            central = dist_m
        radials.append(
            {
                "angleDeg": round(float(a), 1),
                "fetchKm": round(dist_m / 1000.0, 4),
                "weight": round(float(cos_a * cos_a), 4),
            }
        )

    return FetchResult(
        direction_deg=wind_toward_deg,
        effective_fetch_km=round(num / den / 1000.0, 4),
        central_fetch_km=round(central / 1000.0, 4),
        radials=radials,
    )
