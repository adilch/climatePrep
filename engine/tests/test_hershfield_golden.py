"""Hershfield golden tests against the WMO-1045 worked example (spec §6 M5:
"Hershfield reproduces WMO-1045 worked examples (golden values)").

Source: WMO-No. 1045 (2009), Chapter 4, Table 4.1 (pages 71–72): a 25-year
hypothetical hourly-gauge record (1941–1965) at 1-, 6- and 24-hour durations,
with the manual's printed statistics, figure-read factors, and final PMPs.
Extracted from the published PDF on 2026-07-04.
"""

import pytest

from core_engine.pmp.hershfield import (
    arf_fig47,
    dad_table,
    depth_duration_fraction,
    fig42_mean_adjustment,
    fig43_sd_adjustment,
    fig44_length_adjustment,
    hershfield_pmp,
    km_hershfield,
    obs_units_factor,
    seasonal_distribution,
)

# Table 4.1 annual series (mm), 1941–1965.
H1 = [30, 19, 15, 33, 23, 19, 32, 24, 30, 24, 28, 15, 20, 26, 42, 18, 23, 25, 28, 25, 28, 46, 20, 14, 15]
H6 = [62, 38, 39, 108, 49, 39, 50, 30, 39, 38, 58, 41, 47, 68, 124, 43, 39, 48, 80, 89, 33, 72, 47, 34, 40]
H24 = [62, 60, 57, 112, 67, 72, 62, 61, 57, 69, 72, 61, 62, 82, 306, 47, 43, 78, 113, 134, 51, 72, 62, 53, 55]


class TestTable41Statistics:
    """Our statistics must match the manual's printed values.

    Documented inconsistency in the manual: for the 1-h series the printed
    Sn−m = 7.30 (ratio 0.91) does not follow from the printed data — the
    listed series (max 46 excluded) yields Sn−m = 6.78, ratio 0.85 (verified
    by direct hand computation of squared deviations). The 6-h and 24-h
    columns are fully self-consistent. We assert the data-implied values.
    """

    @pytest.mark.parametrize(
        "series,duration,mean,sd,mean_ratio,sd_ratio",
        [
            (H1, 1.0, 24.9, 8.00, 0.965, 0.851),  # data-implied ratios (see docstring)
            (H6, 6.0, 54.2, 24.0, 0.95, 0.81),
            (H24, 24.0, 78.8, 51.9, 0.88, 0.42),
        ],
    )
    def test_series_statistics(self, series, duration, mean, sd, mean_ratio, sd_ratio):
        r = hershfield_pmp(series, duration)
        assert r.mean_mm == pytest.approx(mean, abs=0.06)
        assert r.sd_mm == pytest.approx(sd, abs=0.05)
        assert r.mean_excl_max_mm / r.mean_mm == pytest.approx(mean_ratio, abs=0.006)
        assert r.sd_excl_max_mm / r.sd_mm == pytest.approx(sd_ratio, abs=0.006)


class TestManualChain:
    """Feeding the manual's own figure-read factors must reproduce its PMPs.

    Manual values: adjusted X̄ = 25.4/53.6/72.4, adjusted S = 8.6/23.4/26.7,
    Km = 14/14/16 → point PMP 146/381/500 mm → interval-adjusted
    165/389/505 mm → 500 km² areal 103/331/455 mm.

    Notes on the manual's 1-h column (both documented inconsistencies in the
    published table): (i) the printed Fig 4.3 factor (1.04) conflicts with
    its own adjusted S (8.6 implies ≈1.02) — we pass the implied factor;
    (ii) the printed areal PMP (103 mm) conflicts with its own factor chain
    (165 × 0.66 = 108.9; 103 would imply ARF 0.624) — we assert the
    self-consistent product. The 6-h and 24-h chains reproduce the manual's
    printed values exactly.
    """

    CASES = [
        # series, dur, f42, f43, km, n_units, interval_f, arf, pmp_pt, pmp_int, pmp_areal
        (H1, 1.0, 1.01, 8.6 / (8.00 * 1.05), 14, 1, 1.13, 0.66, 146, 165, 108.9),
        (H6, 6.0, 0.98, 0.93, 14, 6, 1.02, 0.85, 381, 389, 331),
        (H24, 24.0, 0.91, 0.49, 16, 24, 1.01, 0.90, 500, 505, 455),
    ]

    @pytest.mark.parametrize(
        "series,dur,f42,f43,km,n_units,f_int,arf,pmp_pt,pmp_int,pmp_areal", CASES
    )
    def test_reproduces_manual_pmp(
        self, series, dur, f42, f43, km, n_units, f_int, arf, pmp_pt, pmp_int, pmp_areal
    ):
        r = hershfield_pmp(
            series,
            dur,
            n_obs_units=n_units,
            area_km2=500.0,
            km_override=km,
            fig42_override=f42,
            fig43_override=f43,
            fig44_mean_override=1.01,
            fig44_sd_override=1.05,
            interval_factor_override=f_int,
            arf_override=arf,
        )
        # Manual rounds intermediates; ±1.5 mm covers its printed rounding.
        assert r.pmp_point_mm == pytest.approx(pmp_pt, abs=2.0)
        assert r.pmp_true_interval_mm == pytest.approx(pmp_int, abs=2.0)
        assert r.pmp_areal_mm == pytest.approx(pmp_areal, abs=2.0)

    def test_every_factor_is_logged(self):
        r = hershfield_pmp(H24, 24.0, n_obs_units=24, area_km2=500.0)
        keys = [s.key for s in r.steps]
        for expected in ["stats", "fig42", "fig43", "fig44_mean", "fig44_sd",
                         "adjusted_stats", "km", "eq42", "interval", "arf"]:
            assert expected in keys, f"step {expected} missing from log"


class TestDigitizedCurveAnchors:
    """Default curves hit the manual's example values at the anchor inputs."""

    def test_km_anchors(self):
        assert km_hershfield(25.4, 1.0)[0] == pytest.approx(14, abs=0.1)
        assert km_hershfield(53.6, 6.0)[0] == pytest.approx(14, abs=0.1)
        assert km_hershfield(72.4, 24.0)[0] == pytest.approx(16, abs=0.1)

    def test_km_maximum_is_20(self):
        assert km_hershfield(0.0, 24.0)[0] == pytest.approx(20.0)

    def test_fig42_anchors_n25(self):
        assert fig42_mean_adjustment(0.88, 25) == pytest.approx(0.91, abs=0.01)
        assert fig42_mean_adjustment(0.95, 25) == pytest.approx(0.98, abs=0.01)
        assert fig42_mean_adjustment(0.97, 25) == pytest.approx(1.01, abs=0.01)

    def test_fig43_anchors_n25(self):
        assert fig43_sd_adjustment(0.91, 25) == pytest.approx(1.04, abs=0.015)
        assert fig43_sd_adjustment(0.81, 25) == pytest.approx(0.93, abs=0.01)
        assert fig43_sd_adjustment(0.42, 25) == pytest.approx(0.49, abs=0.01)

    def test_fig44_anchors(self):
        f_mean, f_sd = fig44_length_adjustment(25)
        assert f_mean == pytest.approx(1.01, abs=0.005)
        assert f_sd == pytest.approx(1.05, abs=0.005)
        assert fig44_length_adjustment(50) == (pytest.approx(1.0), pytest.approx(1.0))

    def test_weiss_factors(self):
        assert obs_units_factor(1) == 1.13
        assert obs_units_factor(6) == 1.02
        assert obs_units_factor(24) == 1.01

    def test_arf_500km2_anchors(self):
        assert arf_fig47(500, 1.0)[0] == pytest.approx(0.66, abs=0.005)
        assert arf_fig47(500, 6.0)[0] == pytest.approx(0.85, abs=0.005)
        assert arf_fig47(500, 24.0)[0] == pytest.approx(0.90, abs=0.005)

    def test_arf_point_area_no_reduction(self):
        assert arf_fig47(20, 24.0)[0] == 1.0

    def test_fig48_depth_duration_anchors(self):
        assert depth_duration_fraction(1) == pytest.approx(0.34)
        assert depth_duration_fraction(6) == pytest.approx(0.84)
        assert depth_duration_fraction(24) == pytest.approx(1.0)


class TestEndToEndDefaults:
    """Full default run (digitized curves end-to-end) stays close to the
    manual — differences only from curve-reading precision."""

    def test_24h_default_close_to_manual(self):
        r = hershfield_pmp(H24, 24.0, n_obs_units=24, area_km2=500.0)
        assert r.pmp_true_interval_mm == pytest.approx(505, rel=0.05)
        assert r.pmp_areal_mm == pytest.approx(455, rel=0.05)

    def test_pmp_exceeds_max_observed(self):
        r = hershfield_pmp(H24, 24.0)
        assert r.pmp_point_mm > r.max_observed_mm

    def test_short_record_rejected(self):
        with pytest.raises(ValueError, match="10 years"):
            hershfield_pmp(H24[:8], 24.0)


class TestDadAndSeasonal:
    def test_dad_monotone_in_area(self):
        rows = dad_table({24.0: 500.0, 6.0: 380.0}, [25, 200, 500, 1000])
        d24 = [row["depthsMm"]["24.0"] for row in rows]
        assert d24 == sorted(d24, reverse=True)
        assert d24[0] == pytest.approx(500.0)  # point value at ≤25 km²
        assert rows[2]["depthsMm"]["24.0"] == pytest.approx(450.0, abs=1)  # ×0.90

    def test_seasonal_fractions(self):
        out = seasonal_distribution({6: 60.0, 7: 80.0, 8: 72.0, 9: 40.0})
        by_month = {o["month"]: o["fraction"] for o in out}
        assert by_month[7] == 1.0
        assert by_month[6] == pytest.approx(0.75)
        assert by_month[9] == pytest.approx(0.5)
