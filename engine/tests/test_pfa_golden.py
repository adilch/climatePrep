"""Golden-value tests for the PFA core (spec §6 M3 acceptance).

Three layers of protection:
1. CLOSED-FORM goldens — Gumbel L-moment fit and quantiles have textbook
   closed forms (Hosking & Wallis 1997): alpha = l2/ln 2, xi = l1 − gamma·alpha,
   x_T = xi − alpha·ln(−ln(1−1/T)). Computed independently in the test.
2. INDEPENDENT sample L-moments via direct probability-weighted moments.
3. REGRESSION pins — full fit results on a frozen canonical AMS, generated
   2026-07-04 (scratch gen_pfa_goldens.py). These pin the WSC-mirrored
   behaviour; any numerical drift (library upgrade, refactor) goes red.

Canonical AMS: 30 values drawn once from Gumbel(25, 12) (seed 314), frozen.
"""

import math

import numpy as np
import pytest

from core_engine.pfa.ffa import (
    fit_series,
    plotting_positions,
    sample_lmoment_ratios,
)

CANONICAL_AMS = [
    13.7, 22.4, 21.0, 27.0, 48.7, 39.0, 39.5, 37.9, 14.9, 28.5,
    34.9, 23.1, 21.3, 19.2, 25.8, 15.5, 28.1, 17.7, 21.0, 32.3,
    51.7, 30.0, 18.8, 27.4, 27.1, 53.8, 26.4, 36.6, 25.5, 37.0,
]
YEARS = list(range(1990, 2020))
ALL_DISTS = ["gumbel", "gev", "glo", "pe3", "lp3"]
EULER_GAMMA = 0.5772156649015329


def run(bootstrap=500, seed=42, method="lmoments"):
    return fit_series(
        CANONICAL_AMS, YEARS, ALL_DISTS, [2, 10, 100, 1000, 10000],
        estimation_method=method, bootstrap_samples=bootstrap, seed=seed,
    )


class TestSampleLmoments:
    def test_direct_pwm_computation(self):
        """l1/l2 recomputed from unbiased probability-weighted moments."""
        x = np.sort(np.asarray(CANONICAL_AMS))
        n = len(x)
        b0 = float(np.mean(x))
        b1 = float(np.sum((np.arange(1, n + 1) - 1) / (n - 1) * x) / n)
        lmr = sample_lmoment_ratios(np.asarray(CANONICAL_AMS))
        assert lmr.l1 == pytest.approx(b0, abs=1e-9)
        assert lmr.l2 == pytest.approx(2 * b1 - b0, abs=1e-9)

    def test_pinned_ratios(self):
        lmr = sample_lmoment_ratios(np.asarray(CANONICAL_AMS))
        assert lmr.l1 == pytest.approx(28.860000000000003, abs=1e-9)
        assert lmr.l2 == pytest.approx(5.92735632183908, abs=1e-9)
        assert lmr.t3 == pytest.approx(0.1768704844643412, abs=1e-9)
        assert lmr.t4 == pytest.approx(0.13139193002674232, abs=1e-9)


class TestGumbelClosedForm:
    """Hosking & Wallis (1997): EV1 L-moment estimators have closed form."""

    def test_parameters_match_closed_form(self):
        lmr = sample_lmoment_ratios(np.asarray(CANONICAL_AMS))
        alpha = lmr.l2 / math.log(2)
        xi = lmr.l1 - EULER_GAMMA * alpha
        g = next(d for d in run(bootstrap=0).distributions if d.key == "gumbel")
        assert g.parameters["scale"] == pytest.approx(alpha, abs=1e-5)
        assert g.parameters["loc"] == pytest.approx(xi, abs=1e-5)

    def test_quantiles_match_closed_form(self):
        lmr = sample_lmoment_ratios(np.asarray(CANONICAL_AMS))
        alpha = lmr.l2 / math.log(2)
        xi = lmr.l1 - EULER_GAMMA * alpha
        g = next(d for d in run(bootstrap=0).distributions if d.key == "gumbel")
        for q in g.quantiles:
            expected = xi - alpha * math.log(-math.log(1 - 1 / q.return_period))
            assert q.value == pytest.approx(expected, abs=2e-3)


class TestRegressionPins:
    """Frozen full-fit results — guards the WSC-mirrored behaviour."""

    def test_pinned_parameters(self):
        r = run(bootstrap=0)
        p = {d.key: d.parameters for d in r.distributions}
        assert p["gumbel"] == pytest.approx(
            {"loc": 23.924017, "scale": 8.551368}, abs=1e-5
        )
        assert p["gev"] == pytest.approx(
            {"c": -0.010779, "loc": 23.882248, "scale": 8.46581}, abs=1e-5
        )
        assert p["glo"] == pytest.approx(
            {"k": -0.17687, "loc": 27.161921, "scale": 5.627016}, abs=1e-5
        )
        assert p["pe3"] == pytest.approx(
            {"skew": 1.072719, "loc": 28.86, "scale": 10.889318}, abs=1e-5
        )
        assert p["lp3"] == pytest.approx(
            {"skew": 0.074214, "loc": 1.433223, "scale": 0.15988}, abs=1e-5
        )

    def test_pinned_q100(self):
        r = run(bootstrap=0)
        q100 = {
            d.key: next(q.value for q in d.quantiles if q.return_period == 100)
            for d in r.distributions
        }
        assert q100 == pytest.approx(
            {"gumbel": 63.262, "gev": 63.808, "glo": 67.06, "pe3": 62.282, "lp3": 65.142},
            abs=2e-3,
        )

    def test_pinned_gof_and_best_fit(self):
        r = run(bootstrap=0)
        g = next(d for d in r.distributions if d.key == "gumbel").goodness_of_fit
        assert g.aic == pytest.approx(225.064, abs=1e-2)
        assert g.ks_stat == pytest.approx(0.076562, abs=1e-5)
        assert g.ad_stat == pytest.approx(0.174925, abs=1e-5)
        assert g.ppcc == pytest.approx(0.990161, abs=1e-5)
        # Data drawn from a Gumbel parent — AIC must recover it.
        assert r.best_fit == "gumbel"

    def test_pinned_bootstrap_ci(self):
        r = run(bootstrap=500, seed=42)
        g = next(d for d in r.distributions if d.key == "gumbel")
        q100 = next(q for q in g.quantiles if q.return_period == 100)
        assert q100.ci_lower == pytest.approx(51.603, abs=1e-3)
        assert q100.ci_upper == pytest.approx(72.305, abs=1e-3)


class TestReproducibility:
    def test_same_seed_identical_cis(self):
        a, b = run(bootstrap=300, seed=7), run(bootstrap=300, seed=7)
        for d1, d2 in zip(a.distributions, b.distributions):
            for q1, q2 in zip(d1.quantiles, d2.quantiles):
                assert q1.ci_lower == q2.ci_lower
                assert q1.ci_upper == q2.ci_upper

    def test_different_seed_differs(self):
        a, b = run(bootstrap=300, seed=7), run(bootstrap=300, seed=8)
        g1 = next(d for d in a.distributions if d.key == "gumbel")
        g2 = next(d for d in b.distributions if d.key == "gumbel")
        assert any(
            q1.ci_lower != q2.ci_lower
            for q1, q2 in zip(g1.quantiles, g2.quantiles)
        )


class TestPlottingPositions:
    def test_cunnane_hand_calc(self):
        vals = np.array([10.0, 30.0, 20.0, 50.0, 40.0])
        pp = plotting_positions(vals, [1, 2, 3, 4, 5], "cunnane")
        # rank 1 (largest=50): (1−0.4)/(5+1−0.8) = 0.6/5.2
        assert pp[0].value == 50.0
        assert pp[0].exceedance_prob == pytest.approx(0.6 / 5.2, abs=1e-12)
        # rank 5 (smallest=10): (5−0.4)/5.2
        assert pp[-1].value == 10.0
        assert pp[-1].exceedance_prob == pytest.approx(4.6 / 5.2, abs=1e-12)


class TestMle:
    def test_mle_close_to_lmoments_on_clean_data(self):
        """Sanity: for a well-behaved Gumbel sample, MLE and L-moments agree
        within a few percent on the 100-yr quantile."""
        rl = run(bootstrap=0, method="lmoments")
        rm = run(bootstrap=0, method="mle")
        ql = next(q.value for d in rl.distributions if d.key == "gumbel"
                  for q in d.quantiles if q.return_period == 100)
        qm = next(q.value for d in rm.distributions if d.key == "gumbel"
                  for q in d.quantiles if q.return_period == 100)
        assert qm == pytest.approx(ql, rel=0.10)
