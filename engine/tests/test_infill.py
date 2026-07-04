"""Infilling tests (spec B1): hand-calculated goldens + logging guarantees."""

import pytest

from core_engine.qc.infill import (
    Neighbour,
    infill_idw,
    infill_normal_ratio,
    infill_regression,
)

DATES = [f"2000-01-{d:02d}" for d in range(1, 11)]


class TestNormalRatio:
    def test_hand_calculated_golden(self):
        # Target normal: mean of [10,20,30,40] = 25 (gap at index 4).
        target = [10.0, 20.0, 30.0, 40.0, None, 25.0, 25.0, 25.0, 25.0, 25.0]
        # (recompute: mean of the 9 known = (10+20+30+40+25*5)/9 = 225/9 = 25)
        # Neighbour A normal = 50, value at gap = 60 → contribution 60·(25/50) = 30
        # Neighbour B normal = 12.5, value at gap = 10 → contribution 10·(25/12.5) = 20
        # Estimate = mean(30, 20) = 25.
        a = Neighbour("A", "Alpha", 10.0, [50.0] * 4 + [60.0] + [50.0] * 5)
        # B: values [12.5]*4, gap value 10, then 12.5*5 → normal = (12.5*9+10)/10 = 12.25
        # To make B's normal exactly 12.5, use 12.5 everywhere except the gap value 10:
        # normal = (12.5*9 + 10)/10 = 12.25 — not clean. Give B a clean normal by
        # balancing: values sum to 125 over 10 → e.g. [12.5]*4 + [10] + [13,12,13,12,15]
        b_vals = [12.5, 12.5, 12.5, 12.5, 10.0, 13.0, 12.0, 13.0, 12.0, 15.0]
        assert sum(b_vals) / len(b_vals) == 12.5
        b = Neighbour("B", "Bravo", 20.0, b_vals)

        # A's normal: (50*9 + 60)/10 = 51 — adjust A the same way for a clean 50:
        a_vals = [50.0, 50.0, 50.0, 50.0, 60.0, 50.0, 50.0, 40.0, 50.0, 50.0]
        assert sum(a_vals) / len(a_vals) == 50.0
        a = Neighbour("A", "Alpha", 10.0, a_vals)

        r = infill_normal_ratio(DATES, target, [a, b])
        p = r.filled_points[0]
        assert p.index == 4
        assert p.method == "normal_ratio"
        # target normal = 25, A: 60·(25/50)=30, B: 10·(25/12.5)=20 → mean 25
        assert p.value == pytest.approx(25.0)
        assert {n["id"] for n in p.neighbours} == {"A", "B"}
        assert r.filled_values[4] == pytest.approx(25.0)

    def test_unfillable_when_no_neighbour_data(self):
        target = [1.0, None, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0]
        nb = Neighbour("A", "Alpha", 5.0, [1.0, None, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0])
        r = infill_normal_ratio(DATES, target, [nb])
        assert r.filled_points == []
        assert r.unfillable[0]["index"] == 1
        assert r.filled_values[1] is None


class TestIdw:
    def test_inverse_square_weights(self):
        target = [5.0, 5.0, None, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0]
        # d=10 → w=0.01; d=20 → w=0.0025; weights 0.8/0.2
        a = Neighbour("A", "Alpha", 10.0, [0.0] * 2 + [8.0] + [0.0] * 7)
        b = Neighbour("B", "Bravo", 20.0, [0.0] * 2 + [4.0] + [0.0] * 7)
        r = infill_idw(DATES, target, [a, b])
        p = r.filled_points[0]
        assert p.value == pytest.approx(0.8 * 8.0 + 0.2 * 4.0)
        wa = next(n["weight"] for n in p.neighbours if n["id"] == "A")
        assert wa == pytest.approx(0.8)

    def test_power_parameter(self):
        target = [None] + [1.0] * 9
        a = Neighbour("A", "Alpha", 10.0, [10.0] * 10)
        b = Neighbour("B", "Bravo", 20.0, [20.0] * 10)
        # b=1: weights 1/10 vs 1/20 → 2/3, 1/3 → estimate 10·2/3 + 20/3 = 40/3
        r = infill_idw(DATES, target, [a, b], power=1.0)
        assert r.filled_points[0].value == pytest.approx(40.0 / 3.0, abs=1e-3)


class TestRegression:
    def test_recovers_linear_relation(self):
        # Target = 2·neighbour + 1 exactly; gap at index 5 with neighbour = 7 → 15.
        nb_vals = [float(i) for i in range(1, 11)]
        target = [2 * v + 1 for v in nb_vals]
        target[5] = None
        nb = Neighbour("A", "Alpha", 12.0, nb_vals)
        r = infill_regression(DATES, target, [nb], min_overlap=5)
        p = r.filled_points[0]
        assert p.value == pytest.approx(2 * 6.0 + 1, abs=1e-6)  # nb_vals[5] = 6
        assert p.params["slope"] == pytest.approx(2.0, abs=1e-6)
        assert p.params["intercept"] == pytest.approx(1.0, abs=1e-6)
        assert p.params["r"] == pytest.approx(1.0, abs=1e-4)

    def test_min_overlap_enforced(self):
        target = [1.0, 2.0, None] + [None] * 7
        nb = Neighbour("A", "Alpha", 5.0, [1.0] * 10)
        r = infill_regression(DATES, target, [nb], min_overlap=30)
        assert r.filled_points == []
        assert all(u["reason"] == "no_neighbour_with_min_overlap" for u in r.unfillable)

    def test_negative_estimates_clamped_to_zero(self):
        # Strong positive relation but a tiny neighbour value drives estimate < 0.
        nb_vals = [10.0, 20.0, 30.0, 40.0, 50.0, 0.1, 60.0, 70.0, 80.0, 90.0]
        target = [v * 2 - 15 for v in nb_vals]
        target[5] = None  # est = 0.2 - 15 < 0 → clamp
        nb = Neighbour("A", "Alpha", 5.0, nb_vals)
        r = infill_regression(DATES, target, [nb], min_overlap=5)
        assert r.filled_points[0].value == 0.0
