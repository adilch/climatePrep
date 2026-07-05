"""Design-storm tests (spec §6 M5: hyetographs sum to correct depth, etc.)."""

import numpy as np
import pytest

from core_engine.storms.patterns import (
    SCS_TYPE2,
    alternating_block,
    chicago_storm,
    depth_at_duration,
    fit_idf_abc,
    mass_curve_storm,
    pmp_hyetograph,
)

# A realistic Gumbel-ish IDF (T=100) for a daily-plus-hourly station:
IDF_DURATIONS = [1.0, 2.0, 6.0, 12.0, 24.0]
IDF_INTENSITY = [34.1, 22.5, 14.3, 8.5, 4.8]  # mm/h (KANANASKIS published T100)
IDF_DEPTHS = [i * d for i, d in zip(IDF_INTENSITY, IDF_DURATIONS)]


class TestIdfFit:
    def test_fit_recovers_synthetic_abc(self):
        a, b, c = 60.0, 0.25, 0.85
        t = np.array([0.5, 1, 2, 6, 12, 24])
        i = a / (t + b) ** c
        af, bf, cf, rmse = fit_idf_abc(list(t), list(i))
        assert af == pytest.approx(a, rel=0.01)
        assert bf == pytest.approx(b, abs=0.02)
        assert cf == pytest.approx(c, abs=0.01)
        assert rmse < 1e-4

    def test_depth_interpolation_monotone(self):
        d3 = depth_at_duration(IDF_DURATIONS, IDF_DEPTHS, 3.0)
        assert IDF_DEPTHS[1] < d3 < IDF_DEPTHS[2]


class TestChicago:
    def test_total_depth_matches_fitted_idf(self):
        h = chicago_storm(IDF_DURATIONS, IDF_INTENSITY, 24.0, 0.5, peak_ratio=0.375)
        # Chicago total depth equals the fitted average intensity × duration.
        a, b, c, _ = fit_idf_abc(IDF_DURATIONS, IDF_INTENSITY)
        expected = a / (24.0 + b) ** c * 24.0
        assert h.total_depth_mm == pytest.approx(expected, rel=0.01)

    def test_peak_position(self):
        h = chicago_storm(IDF_DURATIONS, IDF_INTENSITY, 24.0, 0.5, peak_ratio=0.375)
        assert h.peak_index == pytest.approx(0.375 * 48, abs=1.5)

    def test_fit_params_logged(self):
        h = chicago_storm(IDF_DURATIONS, IDF_INTENSITY, 24.0, 1.0)
        for key in ("a", "b", "c", "fitRmseRel", "peakRatio"):
            assert key in h.params


class TestAlternatingBlock:
    def test_sums_exactly_to_depth_duration_value(self):
        h = alternating_block(IDF_DURATIONS, IDF_DEPTHS, 24.0, 1.0)
        expected = depth_at_duration(IDF_DURATIONS, IDF_DEPTHS, 24.0)
        assert h.total_depth_mm == pytest.approx(expected, abs=1e-6)

    def test_nested_property_top_blocks_telescope(self):
        """The m largest blocks sum exactly to the depth of duration m·dt —
        the IDF is embedded for every duration (spec E2 nested storms)."""
        h = alternating_block(IDF_DURATIONS, IDF_DEPTHS, 24.0, 1.0)
        blocks = sorted(h.depths_mm, reverse=True)
        for m in (1, 2, 6, 12, 24):
            expected = depth_at_duration(IDF_DURATIONS, IDF_DEPTHS, m * 1.0)
            assert sum(blocks[:m]) == pytest.approx(expected, abs=1e-6)

    def test_peak_at_requested_position(self):
        h = alternating_block(IDF_DURATIONS, IDF_DEPTHS, 24.0, 1.0, peak_ratio=0.5)
        assert abs(h.peak_index - 11.5) <= 0.5  # centre of 24 blocks
        h2 = alternating_block(IDF_DURATIONS, IDF_DEPTHS, 24.0, 1.0, peak_ratio=0.375)
        assert abs(h2.peak_index - 0.375 * 23) <= 0.6

    def test_duration_beyond_idf_rejected(self):
        with pytest.raises(ValueError, match="exceeds"):
            alternating_block(IDF_DURATIONS, IDF_DEPTHS, 48.0, 1.0)


class TestScsType2:
    def test_mass_curve_monotone_0_to_1(self):
        fracs = [p[1] for p in SCS_TYPE2]
        assert fracs[0] == 0.0
        assert fracs[-1] == 1.0
        assert all(b >= a for a, b in zip(fracs, fracs[1:]))

    def test_half_time_fraction_is_0663(self):
        assert dict(SCS_TYPE2)[12.0] == 0.663  # the famous Type II midpoint

    def test_storm_sums_to_total(self):
        h = mass_curve_storm("scs_type2", 150.0, 0.5)
        assert h.total_depth_mm == pytest.approx(150.0, abs=1e-9)
        assert h.peak_index == pytest.approx(23, abs=1)  # peak just before 12 h

    def test_unknown_curve_rejected(self):
        with pytest.raises(ValueError, match="unknown mass curve"):
            mass_curve_storm("huff_q1", 100.0, 0.5)


class TestPmpHyetograph:
    def test_sums_to_pmp(self):
        h = pmp_hyetograph(505.0, 1.0)
        assert h.total_depth_mm == pytest.approx(505.0, rel=1e-6)

    def test_one_hour_block_is_fig48_fraction(self):
        """Largest block = 1-h depth = 34% of 24-h PMP (WMO-1045 Fig 4.8)."""
        h = pmp_hyetograph(505.0, 1.0)
        assert max(h.depths_mm) == pytest.approx(0.34 * 505.0, rel=1e-6)

    def test_source_logged(self):
        h = pmp_hyetograph(500.0, 1.0)
        assert "Figure 4.8" in h.params["depthDurationSource"]
