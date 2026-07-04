"""PDS/POT extraction tests (spec C1)."""

import numpy as np
import pytest

from core_engine.pfa.pds import extract_pds


def daily(year0: int, values: list[float | None]):
    return [
        str(np.datetime64(f"{year0}-01-01") + np.timedelta64(i, "D")) + "T00:00:00"
        for i in range(len(values))
    ]


class TestExtractPds:
    def test_declustering_keeps_cluster_maximum(self):
        # Two exceedances 3 days apart (same event, sep=7) → keep the larger.
        vals = [0.0] * 30
        vals[10], vals[13] = 25.0, 40.0
        vals[25] = 30.0  # independent second event
        ts = daily(2000, vals)
        r = extract_pds(ts, vals, threshold=20.0, min_separation_intervals=7)
        assert [e.value for e in r.events] == [40.0, 30.0]

    def test_independent_events_both_kept(self):
        vals = [0.0] * 30
        vals[5], vals[20] = 25.0, 22.0  # 15 days apart > 7
        ts = daily(2000, vals)
        r = extract_pds(ts, vals, threshold=20.0)
        assert [e.value for e in r.events] == [25.0, 22.0]

    def test_events_per_year_targeting(self):
        # 3 years of daily data with 9 well-separated spikes → λ=3 target
        # must choose a threshold catching ~9 events.
        n = 3 * 365
        vals = [1.0] * n
        spikes = [30, 120, 250, 400, 500, 640, 760, 900, 1000]
        for i, day in enumerate(spikes):
            vals[day] = 50.0 + i
        ts = daily(2000, vals)
        r = extract_pds(ts, vals, events_per_year=3.0)
        assert len(r.events) == 9
        assert r.events_per_year == pytest.approx(3.0, abs=0.15)

    def test_nan_values_ignored(self):
        vals = [0.0, None, 50.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 45.0] + [0.0] * 20
        ts = daily(2000, vals)
        r = extract_pds(ts, vals, threshold=40.0, min_separation_intervals=3)
        assert [e.value for e in r.events] == [50.0, 45.0]

    def test_requires_exactly_one_selector(self):
        ts = daily(2000, [1.0, 2.0])
        with pytest.raises(ValueError):
            extract_pds(ts, [1.0, 2.0])
        with pytest.raises(ValueError):
            extract_pds(ts, [1.0, 2.0], threshold=1.0, events_per_year=2.0)
