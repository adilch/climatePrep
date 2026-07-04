"""Partial-duration series (peaks-over-threshold) extraction (spec C1).

Extracts independent exceedances above a threshold with declustering: values
within `min_separation` intervals of a larger peak belong to the same event
and only the cluster maximum is kept. Threshold may be given directly or
implied by a target mean number of events per year (lambda), the common
DSR/PFA convention.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class PdsEvent:
    timestamp: str
    value: float


@dataclass
class PdsResult:
    threshold: float
    min_separation_intervals: int
    events: list[PdsEvent] = field(default_factory=list)
    events_per_year: float = 0.0
    n_years: float = 0.0

    def to_dict(self) -> dict:
        return {
            "threshold": self.threshold,
            "minSeparationIntervals": self.min_separation_intervals,
            "events": [{"timestamp": e.timestamp, "value": e.value} for e in self.events],
            "eventsPerYear": self.events_per_year,
            "nYears": self.n_years,
        }


def extract_pds(
    timestamps: list[str],
    values: list[float | None],
    threshold: float | None = None,
    events_per_year: float | None = None,
    min_separation_intervals: int = 7,
) -> PdsResult:
    """POT extraction with declustering.

    Exactly one of `threshold` / `events_per_year` must be given. With
    `events_per_year`, the threshold is set so the declustered series yields
    approximately that many events per year (found by scanning candidate
    thresholds from high to low).
    """
    if (threshold is None) == (events_per_year is None):
        raise ValueError("provide exactly one of threshold / events_per_year")

    ts = np.array(timestamps, dtype="datetime64[s]")
    order = np.argsort(ts)
    ts = ts[order]
    x = np.array([np.nan if v is None else float(v) for v in values], dtype=float)[order]

    span_years = float((ts[-1] - ts[0]) / np.timedelta64(1, "D")) / 365.25
    if span_years <= 0:
        raise ValueError("series too short")

    def decluster(thr: float) -> list[int]:
        exceed = np.flatnonzero(~np.isnan(x) & (x > thr))
        if len(exceed) == 0:
            return []
        # Greedy by magnitude: keep the largest peak, suppress neighbours
        # within min_separation, repeat (standard POT declustering).
        kept: list[int] = []
        suppressed = np.zeros(len(x), dtype=bool)
        for i in exceed[np.argsort(x[exceed])[::-1]]:
            if suppressed[i]:
                continue
            kept.append(int(i))
            lo = max(0, i - min_separation_intervals)
            hi = min(len(x), i + min_separation_intervals + 1)
            suppressed[lo:hi] = True
        return sorted(kept)

    if threshold is None:
        # Scan candidate thresholds (unique values, descending) until the
        # target event rate is met.
        target = events_per_year * span_years
        candidates = np.unique(x[~np.isnan(x)])[::-1]
        chosen = float(candidates[0])
        for thr in candidates:
            if len(decluster(float(thr))) >= target:
                chosen = float(thr)
                break
        threshold = chosen

    kept = decluster(threshold)
    events = [PdsEvent(timestamp=str(ts[i]), value=float(x[i])) for i in kept]
    return PdsResult(
        threshold=float(threshold),
        min_separation_intervals=min_separation_intervals,
        events=events,
        events_per_year=round(len(events) / span_years, 4),
        n_years=round(span_years, 3),
    )
