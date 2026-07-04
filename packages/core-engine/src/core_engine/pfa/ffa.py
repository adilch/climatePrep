"""Frequency-analysis core — port of the WSC engine (see package docstring).

Shared-with-WSC parts (keep byte-for-byte semantics):
    plotting_positions, LMOM_DIST, _is_log, _quantile_from_params, _loglik,
    _fit_lmoments, _fit_mom_lp3, _quantile, _ad_statistic, _ks_ad, _n_params,
    fit_distribution (lmoments/mom paths, bootstrap, AIC/BIC/RMSE).

M3 additions: estimation_method="mle", PPCC, sample L-moment ratios.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

import lmoments3
import numpy as np
import scipy.stats as stats
from lmoments3 import distr

logger = logging.getLogger(__name__)

DIST_LABELS = {
    "gev": "Generalized Extreme Value (GEV)",
    "glo": "Generalized Logistic (GLO)",
    "gumbel": "Gumbel (EV1)",
    "lp3": "Log-Pearson III (LP3)",
    "pe3": "Pearson III (PE3)",
}

PLOTTING_A = {"cunnane": 0.4, "weibull": 0.0, "gringorten": 0.44}

# lmoments3 distribution objects are scipy rv_continuous subclasses; fitted
# parameter dicts pass to .ppf/.cdf/.logpdf via **params — no hardcoded
# parameter names or sign conventions (identical to WSC). LP3 is PE3 fit in
# log10 space, back-transformed in _quantile.
LMOM_DIST = {
    "gev": distr.gev,
    "glo": distr.glo,
    "gumbel": distr.gum,
    "pe3": distr.pe3,
    "lp3": distr.pe3,
}


@dataclass
class PlottingPoint:
    year: int
    value: float
    exceedance_prob: float
    return_period: float


@dataclass
class Quantile:
    return_period: float
    aep: float
    value: float
    ci_lower: Optional[float]
    ci_upper: Optional[float]


@dataclass
class GoodnessOfFit:
    ks_stat: float
    ks_pvalue: float
    ad_stat: float
    ppcc: float
    aic: float
    bic: float
    rmse: float


@dataclass
class DistributionResult:
    key: str
    label: str
    estimation_method: str
    parameters: dict[str, float]
    quantiles: list[Quantile]
    curve: list[tuple[float, float]]  # (return_period, value)
    goodness_of_fit: Optional[GoodnessOfFit]
    fit_error: Optional[str]


@dataclass
class LmomentRatios:
    l1: float
    l2: float
    t: float  # L-CV = l2/l1
    t3: float  # L-skewness
    t4: float  # L-kurtosis


@dataclass
class SeriesFitResult:
    n: int
    years_used: list[int]
    plotting_positions: list[PlottingPoint]
    lmoment_ratios: LmomentRatios
    distributions: list[DistributionResult] = field(default_factory=list)
    best_fit: Optional[str] = None
    best_fit_metric: str = "aic"


def plotting_positions(
    values: np.ndarray, years: list[int], method: str
) -> list[PlottingPoint]:
    n = len(values)
    a = PLOTTING_A[method]
    sorted_idx = np.argsort(values)[::-1]  # descending (rank 1 = largest)
    result = []
    for rank, idx in enumerate(sorted_idx, start=1):
        ep = (rank - a) / (n + 1 - 2 * a)
        ep = max(1e-6, min(1 - 1e-6, ep))
        result.append(
            PlottingPoint(
                year=years[idx],
                value=float(values[idx]),
                exceedance_prob=ep,
                return_period=1.0 / ep,
            )
        )
    return result


def _is_log(dist_key: str) -> bool:
    return dist_key == "lp3"


def _quantile_from_params(dist_key: str, params: dict, p_nonexceed: float) -> float:
    return float(LMOM_DIST[dist_key].ppf(p_nonexceed, **params))


def _loglik(dist_key: str, params: dict, data: np.ndarray) -> float:
    try:
        return float(np.sum(LMOM_DIST[dist_key].logpdf(data, **params)))
    except Exception:
        return float("-inf")


def _fit_lmoments(dist_key: str, data: np.ndarray) -> dict:
    fit_data = np.log10(data) if _is_log(dist_key) else data
    return dict(LMOM_DIST[dist_key].lmom_fit(fit_data))


def _fit_mom_lp3(data: np.ndarray) -> dict:
    """Method-of-moments LP3: product moments of log10(Q) map to PE3 params."""
    log_q = np.log10(data)
    mu, sigma, skew = (
        float(np.mean(log_q)),
        float(np.std(log_q, ddof=1)),
        float(stats.skew(log_q)),
    )
    return {"skew": skew, "loc": mu, "scale": sigma}


def _fit_mle(dist_key: str, data: np.ndarray) -> dict:
    """MLE via rv_continuous.fit (M3 extension; spec C2)."""
    obj = LMOM_DIST[dist_key]
    fit_data = np.log10(data) if _is_log(dist_key) else data
    shapes = [s.strip() for s in obj.shapes.split(",")] if obj.shapes else []
    fitted = obj.fit(fit_data)
    return {k: float(v) for k, v in zip([*shapes, "loc", "scale"], fitted)}


def _fit(dist_key: str, data: np.ndarray, estimation_method: str) -> dict:
    if estimation_method == "mle":
        return _fit_mle(dist_key, data)
    if estimation_method == "mom" and dist_key == "lp3":
        return _fit_mom_lp3(data)
    return _fit_lmoments(dist_key, data)


def _quantile(dist_key: str, params: dict, return_period: float) -> float:
    p = 1.0 - 1.0 / return_period
    q = _quantile_from_params(dist_key, params, p)
    return 10**q if _is_log(dist_key) else q


def _ad_statistic(dist_key: str, params: dict, fit_data: np.ndarray) -> float:
    obj = LMOM_DIST[dist_key]
    x = np.sort(fit_data)
    n = len(x)
    F = np.clip(obj.cdf(x, **params), 1e-12, 1 - 1e-12)
    i = np.arange(1, n + 1)
    s = np.sum((2 * i - 1) * (np.log(F) + np.log(1 - F[::-1])))
    return float(-n - s / n)


def _ks_ad(dist_key: str, params: dict, data: np.ndarray):
    try:
        obj = LMOM_DIST[dist_key]
        fit_data = np.log10(data) if _is_log(dist_key) else data
        ks = stats.kstest(fit_data, lambda x: obj.cdf(x, **params))
        ad_stat = _ad_statistic(dist_key, params, fit_data)
        return float(ks.statistic), float(ks.pvalue), ad_stat
    except Exception:
        return float("nan"), float("nan"), float("nan")


def _ppcc(dist_key: str, params: dict, data: np.ndarray, pp: list[PlottingPoint]) -> float:
    """Filliben probability-plot correlation coefficient in fit space
    (M3 extension; spec C2). Correlates sorted observations with fitted
    quantiles at the plotting-position non-exceedance probabilities."""
    try:
        obj = LMOM_DIST[dist_key]
        fit_vals = np.log10([p.value for p in pp]) if _is_log(dist_key) else np.array(
            [p.value for p in pp]
        )
        probs = np.array([1.0 - p.exceedance_prob for p in pp])
        theoretical = obj.ppf(probs, **params)
        if np.any(~np.isfinite(theoretical)):
            return float("nan")
        return float(np.corrcoef(fit_vals, theoretical)[0, 1])
    except Exception:
        return float("nan")


def _n_params(dist_key: str) -> int:
    return 2 if dist_key == "gumbel" else 3


def sample_lmoment_ratios(data: np.ndarray) -> LmomentRatios:
    l1, l2, t3, t4 = lmoments3.lmom_ratios(data, nmom=4)
    return LmomentRatios(
        l1=float(l1),
        l2=float(l2),
        t=float(l2 / l1) if l1 != 0 else float("nan"),
        t3=float(t3),
        t4=float(t4),
    )


def fit_distribution(
    dist_key: str,
    data: np.ndarray,
    return_periods: list[float],
    estimation_method: str,
    plotting_pts: list[PlottingPoint],
    ci_method: str,
    confidence_level: float,
    bootstrap_samples: int,
    rng: np.random.Generator,
) -> DistributionResult:
    label = DIST_LABELS.get(dist_key, dist_key)

    try:
        params = _fit(dist_key, data, estimation_method)

        k = _n_params(dist_key)
        fit_data = np.log10(data) if dist_key == "lp3" else data
        ll = _loglik(dist_key, params, fit_data)
        n = len(data)
        # LP3 is fit in log10 space: change-of-variables (Jacobian) correction
        # keeps its AIC/BIC comparable to Q-space fits (identical to WSC).
        if dist_key == "lp3":
            ll = ll - float(np.sum(np.log(data))) - n * float(np.log(np.log(10.0)))
        aic = 2 * k - 2 * ll
        bic = k * np.log(n) - 2 * ll

        quantile_vals = [_quantile(dist_key, params, t) for t in return_periods]

        emp_q = np.array(
            [_quantile(dist_key, params, pp.return_period) for pp in plotting_pts]
        )
        obs_q = np.array([pp.value for pp in plotting_pts])
        rmse = float(np.sqrt(np.mean((emp_q - obs_q) ** 2)))

        ks_stat, ks_pval, ad_stat = _ks_ad(dist_key, params, data)
        ppcc = _ppcc(dist_key, params, data, plotting_pts)

        # Seeded bootstrap CIs (percentile method — identical to WSC).
        ci_lower: list[Optional[float]] = [None] * len(return_periods)
        ci_upper: list[Optional[float]] = [None] * len(return_periods)
        if ci_method == "bootstrap" and n >= 5:
            boot_quantiles = np.zeros((bootstrap_samples, len(return_periods)))
            alpha = (1 - confidence_level) / 2
            for b in range(bootstrap_samples):
                sample = rng.choice(data, size=n, replace=True)
                try:
                    bp = _fit(dist_key, sample, estimation_method)
                    boot_quantiles[b] = [
                        _quantile(dist_key, bp, t) for t in return_periods
                    ]
                except Exception:
                    boot_quantiles[b] = np.nan
            for i in range(len(return_periods)):
                col = boot_quantiles[:, i]
                valid = col[~np.isnan(col)]
                if len(valid) > 10:
                    ci_lower[i] = float(np.percentile(valid, alpha * 100))
                    ci_upper[i] = float(np.percentile(valid, (1 - alpha) * 100))

        quantiles = [
            Quantile(
                return_period=t,
                aep=round(1.0 / t, 6),
                value=round(q, 3),
                ci_lower=round(lo, 3) if lo is not None else None,
                ci_upper=round(hi, 3) if hi is not None else None,
            )
            for t, q, lo, hi in zip(return_periods, quantile_vals, ci_lower, ci_upper)
        ]

        # Dense curve for smooth plotting (extended past 10,000 yr).
        curve_rps = np.unique(
            np.concatenate(
                [np.logspace(np.log10(1.01), np.log10(12000), 300), return_periods]
            )
        )
        curve = [
            (float(t), round(_quantile(dist_key, params, t), 3)) for t in curve_rps
        ]

        params_out = {k2: round(float(v), 6) for k2, v in params.items()}

        return DistributionResult(
            key=dist_key,
            label=label,
            estimation_method=estimation_method,
            parameters=params_out,
            quantiles=quantiles,
            curve=curve,
            goodness_of_fit=GoodnessOfFit(
                ks_stat=round(ks_stat, 6),
                ks_pvalue=round(ks_pval, 6),
                ad_stat=round(ad_stat, 6),
                ppcc=round(ppcc, 6),
                aic=round(aic, 3),
                bic=round(bic, 3),
                rmse=round(rmse, 3),
            ),
            fit_error=None,
        )

    except Exception as e:
        logger.warning("Distribution %s failed: %s", dist_key, e)
        return DistributionResult(
            key=dist_key,
            label=label,
            estimation_method=estimation_method,
            parameters={},
            quantiles=[],
            curve=[],
            goodness_of_fit=None,
            fit_error=str(e),
        )


def fit_series(
    values: list[float],
    years: list[int],
    distributions: list[str],
    return_periods: list[float],
    estimation_method: str = "lmoments",
    plotting_position: str = "cunnane",
    ci_method: str = "bootstrap",
    confidence_level: float = 0.90,
    bootstrap_samples: int = 2000,
    rng: Optional[np.random.Generator] = None,
    seed: int = 42,
) -> SeriesFitResult:
    """Fit one AMS (single duration) with all requested distributions.

    The rng is shared across distributions in request order — the same
    structure as WSC's run_ffa, so identical inputs give identical CIs.
    """
    if rng is None:
        rng = np.random.default_rng(seed)
    data = np.asarray(values, dtype=float)
    n = len(data)
    if n < 5:
        raise ValueError(f"only {n} values — minimum 5 required")

    pp = plotting_positions(data, years, plotting_position)
    lmr = sample_lmoment_ratios(data)

    results = []
    for dk in distributions:
        fit_data = data.copy()
        if dk == "lp3" and np.any(fit_data <= 0):
            fit_data = fit_data[fit_data > 0]
        results.append(
            fit_distribution(
                dk, fit_data, return_periods, estimation_method, pp,
                ci_method, confidence_level, bootstrap_samples, rng,
            )
        )

    best_fit = None
    best_aic = float("inf")
    for r in results:
        if r.fit_error is None and r.goodness_of_fit and r.goodness_of_fit.aic < best_aic:
            best_aic = r.goodness_of_fit.aic
            best_fit = r.key

    return SeriesFitResult(
        n=n,
        years_used=years,
        plotting_positions=pp,
        lmoment_ratios=lmr,
        distributions=results,
        best_fit=best_fit,
    )
