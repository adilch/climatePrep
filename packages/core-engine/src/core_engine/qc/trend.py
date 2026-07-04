"""Trend and homogeneity tests (spec B2, §7).

References:
- Mann (1945), Kendall (1975); tie-corrected variance per Kendall.
- Sen (1968) slope estimator; intercept per Helsel & Hirsch convention.
- Pettitt (1979) rank-based change-point test; approximate p-value
  p ≈ 2·exp(−6·K² / (n³ + n²)).
- Alexandersson (1986) Standard Normal Homogeneity Test (SNHT); p-value by
  seeded Monte Carlo simulation.

Golden-value tests (tests/test_trend_golden.py) pin these against the
reference implementations pymannkendall 1.4.3 and pyhomogeneity 1.1.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict

import numpy as np
from scipy import stats as sps


# --------------------------------------------------------------------------
# Mann-Kendall + Sen's slope
# --------------------------------------------------------------------------


@dataclass
class MannKendallResult:
    trend: str  # 'increasing' | 'decreasing' | 'no_trend'
    significant: bool
    p_value: float
    z: float
    s: float
    var_s: float
    tau: float
    sen_slope: float
    sen_intercept: float
    n: int
    alpha: float

    def to_dict(self) -> dict:
        return asdict(self)


def mann_kendall(values: list[float] | np.ndarray, alpha: float = 0.05) -> MannKendallResult:
    x = np.asarray(values, dtype=float)
    x = x[~np.isnan(x)]
    n = len(x)
    if n < 4:
        raise ValueError("Mann-Kendall requires at least 4 values")

    # S statistic
    s = 0.0
    for i in range(n - 1):
        s += float(np.sum(np.sign(x[i + 1 :] - x[i])))

    # Tie-corrected variance
    _, tie_counts = np.unique(x, return_counts=True)
    tie_term = float(np.sum(tie_counts * (tie_counts - 1) * (2 * tie_counts + 5)))
    var_s = (n * (n - 1) * (2 * n + 5) - tie_term) / 18.0

    if s > 0:
        z = (s - 1) / np.sqrt(var_s)
    elif s < 0:
        z = (s + 1) / np.sqrt(var_s)
    else:
        z = 0.0

    p = float(2 * (1 - sps.norm.cdf(abs(z))))
    significant = p < alpha
    trend = (
        "increasing" if (significant and z > 0) else "decreasing" if (significant and z < 0) else "no_trend"
    )
    tau = s / (0.5 * n * (n - 1))

    # Sen's slope: median of all pairwise slopes; intercept per pymannkendall
    # convention (median(x) − slope·median(time index)).
    idx = np.arange(n, dtype=float)
    slopes = [
        (x[j] - x[i]) / (idx[j] - idx[i]) for i in range(n - 1) for j in range(i + 1, n)
    ]
    sen = float(np.median(slopes))
    intercept = float(np.median(x) - sen * np.median(idx))

    return MannKendallResult(
        trend=trend,
        significant=significant,
        p_value=p,
        z=float(z),
        s=float(s),
        var_s=float(var_s),
        tau=float(tau),
        sen_slope=sen,
        sen_intercept=intercept,
        n=n,
        alpha=alpha,
    )


# --------------------------------------------------------------------------
# Pettitt change-point test
# --------------------------------------------------------------------------


@dataclass
class PettittResult:
    homogeneous: bool
    change_point_index: int  # 0-based index of the last point BEFORE the shift
    p_value: float
    k: float  # max |U_t|
    mean_before: float
    mean_after: float
    n: int
    alpha: float

    def to_dict(self) -> dict:
        return asdict(self)


def pettitt(values: list[float] | np.ndarray, alpha: float = 0.05) -> PettittResult:
    x = np.asarray(values, dtype=float)
    x = x[~np.isnan(x)]
    n = len(x)
    if n < 8:
        raise ValueError("Pettitt requires at least 8 values")

    ranks = sps.rankdata(x)
    cumsum = np.cumsum(ranks)
    t = np.arange(1, n + 1)
    # U_t = 2·Σ_{i≤t} r_i − t·(n+1); evaluated for t = 1..n−1
    u = 2 * cumsum[:-1] - t[:-1] * (n + 1)
    k_idx = int(np.argmax(np.abs(u)))
    k = float(np.abs(u[k_idx]))

    p = float(min(1.0, 2.0 * np.exp((-6.0 * k**2) / (n**3 + n**2))))
    cp = k_idx  # last index of the first segment (0-based)

    return PettittResult(
        homogeneous=p >= alpha,
        change_point_index=cp,
        p_value=p,
        k=k,
        mean_before=float(np.mean(x[: cp + 1])),
        mean_after=float(np.mean(x[cp + 1 :])),
        n=n,
        alpha=alpha,
    )


# --------------------------------------------------------------------------
# SNHT (Alexandersson 1986)
# --------------------------------------------------------------------------


@dataclass
class SnhtResult:
    homogeneous: bool
    change_point_index: int  # 0-based index of the last point BEFORE the shift
    p_value: float
    t0: float  # max T_k
    mean_before: float
    mean_after: float
    n: int
    alpha: float
    mc_samples: int
    seed: int

    def to_dict(self) -> dict:
        return asdict(self)


def _snht_statistic(x: np.ndarray) -> tuple[float, int]:
    n = len(x)
    z = (x - np.mean(x)) / np.std(x, ddof=1)
    ks = np.arange(1, n)
    csum = np.cumsum(z)[:-1]
    z1 = csum / ks
    z2 = (np.sum(z) - csum) / (n - ks)
    tk = ks * z1**2 + (n - ks) * z2**2
    k_idx = int(np.argmax(tk))
    return float(tk[k_idx]), k_idx


def snht(
    values: list[float] | np.ndarray,
    alpha: float = 0.05,
    mc_samples: int = 20_000,
    seed: int = 42,
) -> SnhtResult:
    x = np.asarray(values, dtype=float)
    x = x[~np.isnan(x)]
    n = len(x)
    if n < 10:
        raise ValueError("SNHT requires at least 10 values")

    t0, k_idx = _snht_statistic(x)

    # Seeded Monte Carlo p-value: fraction of standard-normal series of the
    # same length whose T0 exceeds the observed one (deterministic given seed).
    rng = np.random.default_rng(seed)
    exceed = 0
    for _ in range(mc_samples):
        sim = rng.standard_normal(n)
        t0_sim, _ = _snht_statistic(sim)
        if t0_sim > t0:
            exceed += 1
    p = float(exceed / mc_samples)

    cp = k_idx  # T_k is maximized at the last index of the first segment
    return SnhtResult(
        homogeneous=p >= alpha,
        change_point_index=cp,
        p_value=p,
        t0=t0,
        mean_before=float(np.mean(x[: cp + 1])),
        mean_after=float(np.mean(x[cp + 1 :])),
        n=n,
        alpha=alpha,
        mc_samples=mc_samples,
        seed=seed,
    )
