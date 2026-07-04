"""Sub-daily/multi-day aggregation and AMS extraction (spec B3).

Clock-interval (fixed-window) precipitation maxima systematically underestimate
true sliding-window maxima. The fixed→true interval correction is therefore
MANDATORY for frequency analysis and must be visible and toggleable (spec B3).

Default factors follow WMO-No. 1045 (2009) / Weiss (1964): a maximum observed
in k consecutive fixed intervals is multiplied by:

    k = 1 → 1.13   (the classic single-interval factor)
    k = 2 → 1.04
    k = 3 → 1.03
    k = 4 → 1.02
    k ≥ 5 → decaying to 1.00

The k=1 and k=2 values are well-established; larger-k values approach unity
and are provided as defaults only — the full map is caller-configurable and
every factor actually applied is logged in the output for the provenance
appendix. The reviewing engineer owns the final choice (spec §1.4).
"""

from __future__ import annotations

from dataclasses import dataclass, asdict, field

import numpy as np

# Default fixed→true factors keyed by k (number of fixed intervals in the window).
DEFAULT_CORRECTION_FACTORS: dict[int, float] = {
    1: 1.13,
    2: 1.04,
    3: 1.03,
    4: 1.02,
    5: 1.02,
    6: 1.02,
    8: 1.01,
    12: 1.01,
    24: 1.01,
}


def correction_factor(k: int, factors: dict[int, float] | None = None) -> float:
    """Factor for a window of k fixed intervals: exact key, else nearest
    smaller key, else 1.0 beyond the table."""
    table = factors if factors is not None else DEFAULT_CORRECTION_FACTORS
    if k in table:
        return table[k]
    smaller = [key for key in table if key < k]
    if smaller:
        return table[max(smaller)]
    return 1.0


@dataclass
class AmsPoint:
    year: int
    value_raw: float
    value: float  # corrected if correction applied, else == value_raw
    window_end: str  # ISO date/datetime of the window's last interval
    completeness: float  # fraction of non-missing base intervals in the year

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class DurationSeries:
    duration_hours: float
    k_intervals: int
    correction_applied: bool
    correction_factor: float
    ams: list[AmsPoint] = field(default_factory=list)
    years_skipped: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "durationHours": self.duration_hours,
            "kIntervals": self.k_intervals,
            "correctionApplied": self.correction_applied,
            "correctionFactor": self.correction_factor,
            "ams": [p.to_dict() for p in self.ams],
            "yearsSkipped": self.years_skipped,
        }


def extract_ams(
    timestamps: list[str],
    values: list[float | None],
    interval_hours: float,
    durations_hours: list[float],
    apply_correction: bool = True,
    correction_factors: dict[int, float] | None = None,
    min_year_completeness: float = 0.8,
) -> list[DurationSeries]:
    """Annual-maximum series for each duration from a fixed-interval record.

    - The record is placed on a regular grid from first to last timestamp;
      absent intervals are missing (NaN).
    - A rolling window of k = duration/interval steps is summed; any window
      containing a missing interval is invalid (conservative — no silent
      underestimation of maxima).
    - A year's maximum is reported only if the year's base-interval
      completeness ≥ min_year_completeness; skipped years are logged.
    - Windows are assigned to the year of their END interval.
    """
    if not timestamps:
        raise ValueError("empty series")

    step = np.timedelta64(int(round(interval_hours * 3600)), "s")
    ts = np.array(timestamps, dtype="datetime64[s]")
    order = np.argsort(ts)
    ts = ts[order]
    raw = np.array(
        [np.nan if v is None else float(v) for v in values], dtype=float
    )[order]

    # Regular grid.
    n_grid = int((ts[-1] - ts[0]) / step) + 1
    grid = np.full(n_grid, np.nan)
    idx = ((ts - ts[0]) / step).astype(int)
    grid[idx] = raw
    grid_times = ts[0] + np.arange(n_grid) * step

    years_all = grid_times.astype("datetime64[Y]").astype(int) + 1970
    unique_years = np.unique(years_all)

    # Per-year completeness measured against the FULL calendar year (a record
    # covering only January must not count as complete for that year).
    completeness: dict[int, float] = {}
    for y in unique_years:
        y = int(y)
        mask = years_all == y
        present = int(np.sum(~np.isnan(grid[mask])))
        year_start = np.datetime64(f"{y}-01-01", "s")
        year_end = np.datetime64(f"{y + 1}-01-01", "s")
        expected = int((year_end - year_start) / step)
        completeness[y] = float(present / expected) if expected > 0 else 0.0

    results: list[DurationSeries] = []
    for dur in durations_hours:
        k = int(round(dur / interval_hours))
        if k < 1 or abs(k * interval_hours - dur) > 1e-9:
            raise ValueError(
                f"duration {dur} h is not a whole multiple of the {interval_hours} h interval"
            )
        factor = correction_factor(k, correction_factors) if apply_correction else 1.0

        # Rolling k-sum; windows containing NaN are invalid.
        if k == 1:
            windows = grid.copy()
        else:
            csum = np.nancumsum(np.where(np.isnan(grid), 0.0, grid))
            windows = np.full(n_grid, np.nan)
            valid_counts = np.convolve(~np.isnan(grid), np.ones(k, dtype=int), "full")[
                k - 1 : n_grid
            ]
            sums = csum.copy()
            sums[k:] = csum[k:] - csum[:-k]
            windows[k - 1 :] = sums[k - 1 :]
            windows[k - 1 :][valid_counts < k] = np.nan
        window_years = years_all  # window assigned to year of its END interval

        series = DurationSeries(
            duration_hours=float(dur),
            k_intervals=k,
            correction_applied=apply_correction,
            correction_factor=factor,
        )
        for y in unique_years:
            y = int(y)
            comp = completeness[y]
            if comp < min_year_completeness:
                series.years_skipped.append(
                    {"year": y, "completeness": round(comp, 3), "reason": "incomplete"}
                )
                continue
            mask = (window_years == y) & ~np.isnan(windows)
            if not mask.any():
                series.years_skipped.append(
                    {"year": y, "completeness": round(comp, 3), "reason": "no_valid_window"}
                )
                continue
            i_max = int(np.argmax(np.where(mask, windows, -np.inf)))
            raw_max = float(windows[i_max])
            series.ams.append(
                AmsPoint(
                    year=y,
                    value_raw=round(raw_max, 3),
                    value=round(raw_max * factor, 3),
                    window_end=str(grid_times[i_max]),
                    completeness=round(comp, 3),
                )
            )
        results.append(series)

    return results
