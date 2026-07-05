"""Wind/wave/freeboard golden tests (spec §6 M6 acceptance):
fetch geometry on analytic polygons, hand-computed formula values for
waves/setup/runup, freeboard table vs a hand calculation, and the
directional critical case.
"""

import math

import numpy as np
import pytest

from core_engine.waves.fetch import saville_effective_fetch
from core_engine.waves.freeboard import compute_freeboard, directional_scan
from core_engine.waves.prediction import (
    G,
    overland_to_overwater,
    smb_bretschneider,
    spm84,
)
from core_engine.waves.runup import (
    ROUGHNESS_PRESETS,
    runup_hunt,
    runup_taw,
    surf_similarity,
    wind_setup_zuider_zee,
)

# ~1° of latitude in metres for polygon construction around a site at lat 51.
LAT0, LON0 = 51.0, -114.75
M_PER_DEG_LAT = math.pi / 180 * 6_371_008.8
M_PER_DEG_LON = M_PER_DEG_LAT * math.cos(math.radians(LAT0))


def circle_polygon(radius_m: float, n: int = 720) -> list[tuple[float, float]]:
    pts = []
    for k in range(n):
        th = 2 * math.pi * k / n
        pts.append(
            (
                LON0 + radius_m * math.sin(th) / M_PER_DEG_LON,
                LAT0 + radius_m * math.cos(th) / M_PER_DEG_LAT,
            )
        )
    return pts


class TestSavilleFetch:
    def test_circle_closed_form(self):
        """Site at circle centre: every radial hits at R, so
        F_eff = R · Σcos²α / Σcosα — computable exactly."""
        R = 5_000.0
        result = saville_effective_fetch(LAT0, LON0, circle_polygon(R), 90.0)
        angles = np.arange(-42, 42 + 1e-9, 6.0)
        expected = R * np.sum(np.cos(np.radians(angles)) ** 2) / np.sum(
            np.cos(np.radians(angles))
        )
        assert result.effective_fetch_km == pytest.approx(expected / 1000, rel=0.002)
        assert result.central_fetch_km == pytest.approx(R / 1000, rel=0.002)
        # circle: direction must not matter
        r2 = saville_effective_fetch(LAT0, LON0, circle_polygon(R), 217.0)
        assert r2.effective_fetch_km == pytest.approx(result.effective_fetch_km, rel=0.005)

    def test_rectangle_hand_calc(self):
        """10 km × 2 km rectangle east of the site, wind due east: each
        radial exits either the far end (x = 10/cosα) or the side walls
        (x = 1/sinα) — hand-computable minimum per radial."""
        L, W = 10_000.0, 2_000.0
        poly = [
            (LON0, LAT0 + (W / 2) / M_PER_DEG_LAT),
            (LON0 + L / M_PER_DEG_LON, LAT0 + (W / 2) / M_PER_DEG_LAT),
            (LON0 + L / M_PER_DEG_LON, LAT0 - (W / 2) / M_PER_DEG_LAT),
            (LON0, LAT0 - (W / 2) / M_PER_DEG_LAT),
        ]
        result = saville_effective_fetch(LAT0, LON0, poly, 90.0)
        num = den = 0.0
        for a in np.arange(-42, 42 + 1e-9, 6.0):
            ar = math.radians(abs(a))
            x = min(L / math.cos(ar), (W / 2) / math.sin(ar)) if a != 0 else L
            ca = math.cos(math.radians(a))
            num += x * ca * ca
            den += ca
        assert result.effective_fetch_km == pytest.approx(num / den / 1000, rel=0.01)
        # long narrow reservoir: effective fetch well below central fetch
        # (hand calc: 4.07 km vs 10 km central → ratio 0.41)
        assert result.effective_fetch_km < 0.5 * result.central_fetch_km

    def test_ray_missing_polygon_gives_zero(self):
        """Wind blowing away from the reservoir → zero fetch."""
        L, W = 10_000.0, 2_000.0
        poly = [
            (LON0, LAT0 + (W / 2) / M_PER_DEG_LAT),
            (LON0 + L / M_PER_DEG_LON, LAT0 + (W / 2) / M_PER_DEG_LAT),
            (LON0 + L / M_PER_DEG_LON, LAT0 - (W / 2) / M_PER_DEG_LAT),
            (LON0, LAT0 - (W / 2) / M_PER_DEG_LAT),
        ]
        result = saville_effective_fetch(LAT0, LON0, poly, 270.0)
        assert result.effective_fetch_km == 0.0


class TestWavePrediction:
    def test_smb_hand_computed(self):
        """U = 20 m/s, F = 10 km, deep water — direct formula evaluation."""
        u, F = 20.0, 10_000.0
        gF_U2 = G * F / u**2
        hs = 0.283 * u**2 / G * math.tanh(0.0125 * gF_U2**0.42)
        ts = 7.54 * u / G * math.tanh(0.077 * gF_U2**0.25)
        r = smb_bretschneider(20.0, 10.0)
        assert r.hs_m == pytest.approx(hs, abs=2e-3)
        assert r.t_s == pytest.approx(ts, abs=2e-3)
        # sanity: a 20 m/s wind over 10 km gives waves near a metre
        assert 0.5 < r.hs_m < 1.5

    def test_smb_depth_limited_reduces_waves(self):
        deep = smb_bretschneider(20.0, 10.0)
        shallow = smb_bretschneider(20.0, 10.0, depth_m=3.0)
        assert shallow.hs_m < deep.hs_m
        assert shallow.t_s < deep.t_s

    def test_spm84_hand_computed(self):
        """U = 20 m/s, F = 10 km — SPM-84 with UA = 0.71·U^1.23."""
        u, F = 20.0, 10_000.0
        ua = 0.71 * u**1.23
        gF_UA2 = G * F / ua**2
        hs = 1.6e-3 * math.sqrt(gF_UA2) * ua**2 / G
        tp = 2.857e-1 * gF_UA2 ** (1 / 3) * ua / G
        r = spm84(20.0, 10.0)
        assert r.hs_m == pytest.approx(hs, abs=2e-3)
        assert r.t_s == pytest.approx(tp, abs=2e-3)
        assert r.min_duration_hr is not None and r.min_duration_hr > 0

    def test_monotone_in_wind_and_fetch(self):
        assert smb_bretschneider(25, 10).hs_m > smb_bretschneider(15, 10).hs_m
        assert smb_bretschneider(20, 20).hs_m > smb_bretschneider(20, 5).hs_m

    def test_overland_overwater_anchor(self):
        _, rl = overland_to_overwater(18.5)
        assert rl == pytest.approx(1.0, abs=0.01)
        u_w, rl_low = overland_to_overwater(5.0)
        assert rl_low > 1.1
        assert u_w == pytest.approx(5.0 * rl_low, abs=1e-6)


class TestSetupAndRunup:
    def test_zuider_zee_hand_computed(self):
        """U = 80 km/h, F = 5 km, D = 10 m → S = 80²·5/(63 200·10)."""
        s = wind_setup_zuider_zee(80.0, 5.0, 10.0)
        assert s == pytest.approx(80.0**2 * 5.0 / (63_200.0 * 10.0), abs=1e-9)
        assert s == pytest.approx(0.0506, abs=1e-4)

    def test_surf_similarity_hand_computed(self):
        """Hs = 1 m, T = 4 s, slope 1V:3H → ξ = (1/3)/√(1/L0), L0 = gT²/2π."""
        l0 = G * 16 / (2 * math.pi)
        xi = (1 / 3) / math.sqrt(1.0 / l0)
        assert surf_similarity(1.0, 4.0, 1 / 3) == pytest.approx(xi, abs=1e-9)

    def test_hunt_breaking_and_cap(self):
        r = runup_hunt(1.0, 4.0, 1 / 3, gamma_f=1.0)
        assert r.breaking is True
        assert r.runup_m == pytest.approx(r.xi * 1.0, abs=1e-9)
        # steep slope → non-breaking cap 2.2·γf·Hs
        r2 = runup_hunt(0.5, 6.0, 1.0, gamma_f=1.0)
        assert r2.breaking is False
        assert r2.runup_m == pytest.approx(2.2 * 0.5, abs=1e-9)

    def test_taw_hand_computed_breaking(self):
        """ξ small → breaking branch: Ru2% = 1.65·γf·ξ·Hs."""
        r = runup_taw(1.0, 4.0, 1 / 4, gamma_f=0.55)
        expected = 1.65 * 0.55 * r.xi * 1.0
        r_max = 0.55 * (4.0 - 1.5 / math.sqrt(r.xi))
        assert r.runup_m == pytest.approx(min(expected, r_max), abs=1e-9)

    def test_riprap_reduces_runup(self):
        smooth = runup_taw(1.0, 4.0, 1 / 3, gamma_f=ROUGHNESS_PRESETS["smooth"])
        riprap = runup_taw(1.0, 4.0, 1 / 3, gamma_f=ROUGHNESS_PRESETS["riprap"])
        assert riprap.runup_m < smooth.runup_m
        assert ROUGHNESS_PRESETS["riprap"] == 0.55


class TestFreeboard:
    def test_matches_hand_calculation(self):
        """Full-chain hand calc (spec acceptance: table matches hand calc).
        U_land 20 m/s, F 5 km, D 10 m, slope 1V:3H, riprap, SMB + TAW."""
        u_water, rl = overland_to_overwater(20.0)
        wave = smb_bretschneider(u_water, 5.0, 10.0)
        runup = runup_taw(wave.hs_m, wave.t_s, 1 / 3, gamma_f=0.55)
        setup = wind_setup_zuider_zee(u_water * 3.6, 5.0, 10.0)
        allowances = {"settlement": 0.3, "seiche": 0.15}
        expected_total = runup.runup_m + setup + 0.45

        fb = compute_freeboard(
            u_land_ms=20.0,
            fetch_km=5.0,
            avg_depth_m=10.0,
            slope_v_per_h=1 / 3,
            roughness_gamma_f=0.55,
            wave_method="smb",
            runup_method="taw2002",
            allowances_m=allowances,
        )
        assert fb.hs_m == pytest.approx(wave.hs_m, abs=1e-9)
        assert fb.runup_m == pytest.approx(runup.runup_m, abs=1e-9)
        assert fb.setup_m == pytest.approx(setup, abs=1e-9)
        assert fb.total_freeboard_m == pytest.approx(expected_total, abs=1e-6)
        assert fb.inputs["rl"] == rl
        assert fb.inputs["gammaF"] == 0.55

    def test_directional_critical_case(self):
        """Long east-west rectangle: the governing direction must be the one
        with the long fetch (east or west), not the short cross-axis."""
        L, W = 10_000.0, 2_000.0
        poly = [
            (LON0, LAT0 + (W / 2) / M_PER_DEG_LAT),
            (LON0 + L / M_PER_DEG_LON, LAT0 + (W / 2) / M_PER_DEG_LAT),
            (LON0 + L / M_PER_DEG_LON, LAT0 - (W / 2) / M_PER_DEG_LAT),
            (LON0, LAT0 - (W / 2) / M_PER_DEG_LAT),
        ]
        scan = directional_scan(LAT0, LON0, poly, u_land_ms=20.0, avg_depth_m=8.0)
        assert scan["critical"]["directionDeg"] == 90.0
        east = next(r for r in scan["rows"] if r["directionDeg"] == 90.0)
        north = next(r for r in scan["rows"] if r["directionDeg"] == 0.0)
        assert east["hsM"] > north["hsM"]
