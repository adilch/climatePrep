"""Missing-data infilling (spec B1).

Methods:
- normal_ratio: Paulhus & Kohler (1952) — target estimate is the mean of
  neighbour values scaled by the ratio of station normals:
      P̂_t = (1/m) · Σ_i (N_t / N_i) · P_i
- idw: inverse-distance weighting, P̂_t = Σ w_i P_i / Σ w_i with w_i = d_i^−b
  (default b = 2).
- regression: OLS against the single best-correlated neighbour (highest
  Pearson r over paired complete observations, minimum overlap enforced).

Every filled point is flagged and logged with the method, the neighbours
used, and their weights/parameters (spec B1: "method and neighbours logged").
Points no method can fill remain missing and are reported.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class Neighbour:
    id: str
    name: str
    distance_km: float
    values: list[float | None]  # aligned to the target's dates


@dataclass
class FilledPoint:
    index: int
    date: str
    value: float
    method: str
    neighbours: list[dict]  # [{id, name, value, weight?|ratio?}]
    params: dict

    def to_dict(self) -> dict:
        return {
            "index": self.index,
            "date": self.date,
            "value": self.value,
            "method": self.method,
            "neighbours": self.neighbours,
            "params": self.params,
        }


@dataclass
class InfillResult:
    filled_values: list[float | None]
    filled_points: list[FilledPoint]
    unfillable: list[dict] = field(default_factory=list)
    method: str = ""
    stats: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "filledValues": self.filled_values,
            "filledPoints": [p.to_dict() for p in self.filled_points],
            "unfillable": self.unfillable,
            "method": self.method,
            "stats": self.stats,
        }


def _to_array(values: list[float | None]) -> np.ndarray:
    return np.array([np.nan if v is None else float(v) for v in values], dtype=float)


def _out(values: np.ndarray) -> list[float | None]:
    return [None if np.isnan(v) else round(float(v), 3) for v in values]


def infill_normal_ratio(
    dates: list[str],
    target: list[float | None],
    neighbours: list[Neighbour],
) -> InfillResult:
    x = _to_array(target)
    n_target = float(np.nanmean(x))
    arrays = {nb.id: _to_array(nb.values) for nb in neighbours}
    normals = {nb.id: float(np.nanmean(arrays[nb.id])) for nb in neighbours}

    filled: list[FilledPoint] = []
    unfillable: list[dict] = []
    out = x.copy()
    for i in np.flatnonzero(np.isnan(x)):
        contributions = []
        for nb in neighbours:
            v = arrays[nb.id][i]
            if not np.isnan(v) and normals[nb.id] > 0:
                ratio = n_target / normals[nb.id]
                contributions.append((nb, float(v), ratio))
        if not contributions:
            unfillable.append({"index": int(i), "date": dates[i], "reason": "no_neighbour_data"})
            continue
        est = float(np.mean([v * r for _, v, r in contributions]))
        out[i] = est
        filled.append(
            FilledPoint(
                index=int(i),
                date=dates[i],
                value=round(est, 3),
                method="normal_ratio",
                neighbours=[
                    {"id": nb.id, "name": nb.name, "value": v, "ratio": round(r, 6)}
                    for nb, v, r in contributions
                ],
                params={"targetNormal": round(n_target, 4)},
            )
        )

    return InfillResult(
        filled_values=_out(out),
        filled_points=filled,
        unfillable=unfillable,
        method="normal_ratio",
        stats={"nMissing": int(np.isnan(x).sum()), "nFilled": len(filled)},
    )


def infill_idw(
    dates: list[str],
    target: list[float | None],
    neighbours: list[Neighbour],
    power: float = 2.0,
) -> InfillResult:
    x = _to_array(target)
    arrays = {nb.id: _to_array(nb.values) for nb in neighbours}

    filled: list[FilledPoint] = []
    unfillable: list[dict] = []
    out = x.copy()
    for i in np.flatnonzero(np.isnan(x)):
        contributions = []
        for nb in neighbours:
            v = arrays[nb.id][i]
            if not np.isnan(v) and nb.distance_km > 0:
                w = nb.distance_km**-power
                contributions.append((nb, float(v), w))
        if not contributions:
            unfillable.append({"index": int(i), "date": dates[i], "reason": "no_neighbour_data"})
            continue
        wsum = sum(w for _, _, w in contributions)
        est = float(sum(v * w for _, v, w in contributions) / wsum)
        out[i] = est
        filled.append(
            FilledPoint(
                index=int(i),
                date=dates[i],
                value=round(est, 3),
                method="idw",
                neighbours=[
                    {"id": nb.id, "name": nb.name, "value": v, "weight": round(w / wsum, 6)}
                    for nb, v, w in contributions
                ],
                params={"power": power},
            )
        )

    return InfillResult(
        filled_values=_out(out),
        filled_points=filled,
        unfillable=unfillable,
        method="idw",
        stats={"nMissing": int(np.isnan(x).sum()), "nFilled": len(filled)},
    )


def infill_regression(
    dates: list[str],
    target: list[float | None],
    neighbours: list[Neighbour],
    min_overlap: int = 30,
) -> InfillResult:
    x = _to_array(target)

    # Choose the best-correlated neighbour over paired complete observations.
    best: tuple[Neighbour, np.ndarray, float, int] | None = None
    for nb in neighbours:
        y = _to_array(nb.values)
        mask = ~np.isnan(x) & ~np.isnan(y)
        n_pair = int(mask.sum())
        if n_pair < min_overlap:
            continue
        r = float(np.corrcoef(x[mask], y[mask])[0, 1])
        if best is None or abs(r) > abs(best[2]):
            best = (nb, y, r, n_pair)

    if best is None:
        return InfillResult(
            filled_values=_out(x),
            filled_points=[],
            unfillable=[
                {"index": int(i), "date": dates[i], "reason": "no_neighbour_with_min_overlap"}
                for i in np.flatnonzero(np.isnan(x))
            ],
            method="regression",
            stats={"nMissing": int(np.isnan(x).sum()), "nFilled": 0},
        )

    nb, y, r, n_pair = best
    mask = ~np.isnan(x) & ~np.isnan(y)
    slope, intercept = np.polyfit(y[mask], x[mask], 1)

    filled: list[FilledPoint] = []
    unfillable: list[dict] = []
    out = x.copy()
    for i in np.flatnonzero(np.isnan(x)):
        if np.isnan(y[i]):
            unfillable.append({"index": int(i), "date": dates[i], "reason": "neighbour_missing_too"})
            continue
        est = float(intercept + slope * y[i])
        est = max(0.0, est)  # precipitation cannot be negative
        out[i] = est
        filled.append(
            FilledPoint(
                index=int(i),
                date=dates[i],
                value=round(est, 3),
                method="regression",
                neighbours=[{"id": nb.id, "name": nb.name, "value": float(y[i])}],
                params={
                    "slope": round(float(slope), 6),
                    "intercept": round(float(intercept), 6),
                    "r": round(r, 4),
                    "nOverlap": n_pair,
                },
            )
        )

    return InfillResult(
        filled_values=_out(out),
        filled_points=filled,
        unfillable=unfillable,
        method="regression",
        stats={
            "nMissing": int(np.isnan(x).sum()),
            "nFilled": len(filled),
            "neighbourUsed": nb.id,
            "r": round(r, 4),
        },
    )


INFILL_METHODS = {
    "normal_ratio": infill_normal_ratio,
    "idw": infill_idw,
    "regression": infill_regression,
}
