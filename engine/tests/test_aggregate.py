"""Aggregation/AMS tests (spec B3): rolling maxima, correction, missing data."""

import numpy as np
import pytest

from core_engine.qc.aggregate import (
    DEFAULT_CORRECTION_FACTORS,
    correction_factor,
    extract_ams,
)


def daily_series(year: int, values: list[float | None]):
    ts = [
        str(np.datetime64(f"{year}-01-01") + np.timedelta64(i, "D")) + "T00:00:00"
        for i in range(len(values))
    ]
    return ts, values


class TestCorrectionFactor:
    def test_wmo_single_interval_default(self):
        assert correction_factor(1) == 1.13

    def test_two_and_three_intervals(self):
        assert correction_factor(2) == 1.04
        assert correction_factor(3) == 1.03

    def test_between_keys_uses_nearest_smaller(self):
        assert correction_factor(7) == correction_factor(6)
        assert correction_factor(100) == DEFAULT_CORRECTION_FACTORS[24]

    def test_custom_map_overrides(self):
        assert correction_factor(1, {1: 1.10}) == 1.10


class TestExtractAms:
    def test_daily_1_2_3_day_known_maxima(self):
        # 10 days: the 20+30 pair is the 2-day max (50); 10+20+30 the 3-day max (60).
        vals = [0.0, 5.0, 10.0, 20.0, 30.0, 2.0, 0.0, 8.0, 1.0, 0.0]
        ts, v = daily_series(2000, vals)
        out = extract_ams(ts, v, 24.0, [24.0, 48.0, 72.0], min_year_completeness=0.0)

        d24, d48, d72 = out
        assert d24.ams[0].value_raw == 30.0
        assert d24.ams[0].value == pytest.approx(30.0 * 1.13)
        assert d48.ams[0].value_raw == 50.0
        assert d48.ams[0].value == pytest.approx(50.0 * 1.04)
        assert d72.ams[0].value_raw == 60.0
        assert d72.ams[0].value == pytest.approx(60.0 * 1.03)

    def test_correction_toggle_off(self):
        vals = [1.0, 2.0, 3.0, 4.0, 5.0]
        ts, v = daily_series(2000, vals)
        out = extract_ams(
            ts, v, 24.0, [24.0], apply_correction=False, min_year_completeness=0.0
        )
        assert out[0].correction_applied is False
        assert out[0].correction_factor == 1.0
        assert out[0].ams[0].value == out[0].ams[0].value_raw == 5.0

    def test_window_containing_missing_value_is_invalid(self):
        # Max pair straddles a missing day → that window must not count.
        vals = [10.0, None, 40.0, 5.0, 1.0]
        ts, v = daily_series(2000, vals)
        out = extract_ams(
            ts, v, 24.0, [48.0], apply_correction=False, min_year_completeness=0.0
        )
        # Valid 2-day windows: (40,5)=45, (5,1)=6 — NOT (10,None) or (None,40).
        assert out[0].ams[0].value_raw == 45.0

    def test_incomplete_year_skipped_and_logged(self):
        # Two years: 2000 has full Jan–Dec dailies; 2001 only 20 days (<80%).
        ts1 = [
            str(np.datetime64("2000-01-01") + np.timedelta64(i, "D")) + "T00:00:00"
            for i in range(366)
        ]
        v1 = [1.0] * 366
        ts2 = [
            str(np.datetime64("2001-01-01") + np.timedelta64(i, "D")) + "T00:00:00"
            for i in range(20)
        ]
        v2 = [99.0] * 20
        out = extract_ams(ts1 + ts2, v1 + v2, 24.0, [24.0], apply_correction=False)
        d = out[0]
        assert [p.year for p in d.ams] == [2000]
        assert d.years_skipped and d.years_skipped[0]["year"] == 2001
        assert d.years_skipped[0]["reason"] == "incomplete"

    def test_hourly_durations(self):
        # 48 h of hourly data; a 3-h burst 10+20+15 = 45 is the 6-h max too.
        base = np.datetime64("2000-06-01T00:00:00")
        ts = [str(base + np.timedelta64(i, "h")) for i in range(48)]
        vals = [0.0] * 48
        vals[20], vals[21], vals[22] = 10.0, 20.0, 15.0
        out = extract_ams(
            ts, vals, 1.0, [1.0, 2.0, 6.0], apply_correction=False, min_year_completeness=0.0
        )
        d1, d2, d6 = out
        assert d1.ams[0].value_raw == 20.0
        assert d2.ams[0].value_raw == 35.0  # 20+15
        assert d6.ams[0].value_raw == 45.0

    def test_non_integer_window_rejected(self):
        ts, v = daily_series(2000, [1.0, 2.0])
        with pytest.raises(ValueError, match="whole multiple"):
            extract_ams(ts, v, 24.0, [36.0])
