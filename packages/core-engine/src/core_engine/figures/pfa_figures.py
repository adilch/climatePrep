"""PFA report figures (frequency plot, IDF, L-moment ratio diagram).

Rendering rules (spec §4):
- Okabe-Ito colorblind-safe palette; meaning never encoded by colour alone
  (line styles differ: site solid, published dashed).
- Title + axis labels with units on every figure.
- Provenance footer: station · period/seed · engine version.
- Deterministic output: fixed figsize/dpi, no timestamps in PNG metadata.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.ticker import LogLocator, NullFormatter, ScalarFormatter  # noqa: E402

OKABE_ITO = ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00", "#56B4E9"]
GREY = "#334155"

DPI = 150
SAVE_KW = dict(format="png", dpi=DPI, bbox_inches="tight", metadata={"Software": "climatePrep engine"})


@dataclass
class FigureMeta:
    station_name: str
    climate_id: str
    seed: int
    engine_version: str
    note: str = ""

    def footer(self) -> str:
        parts = [
            f"{self.station_name} ({self.climate_id})",
            f"seed {self.seed}",
            f"engine {self.engine_version}",
        ]
        if self.note:
            parts.append(self.note)
        return " · ".join(parts)


def _finish(fig, meta: FigureMeta) -> bytes:
    fig.text(
        0.01, 0.005, meta.footer(),
        fontsize=6.5, color="#64748b", family="monospace",
    )
    buf = io.BytesIO()
    fig.savefig(buf, **SAVE_KW)
    plt.close(fig)
    return buf.getvalue()


def frequency_plot_png(
    duration_hours: float,
    fits: list[dict],
    plotting_positions: list[dict],
    ci_distribution: str,
    meta: FigureMeta,
) -> bytes:
    """Quantile curves vs return period (log axis) with CI band + observations.

    `fits`: PfaResponse DurationFitOut["fits"] dicts (camelCase wire shape).
    """
    fig, ax = plt.subplots(figsize=(7.2, 4.6))

    ci_fit = next(
        (f for f in fits if f["key"] == ci_distribution and not f.get("fitError")),
        None,
    )
    if ci_fit:
        qs = [q for q in ci_fit["quantiles"] if q["ciLower"] is not None and q["ciUpper"] is not None]
        if len(qs) > 1:
            ax.fill_between(
                [q["returnPeriod"] for q in qs],
                [q["ciLower"] for q in qs],
                [q["ciUpper"] for q in qs],
                color=OKABE_ITO[0], alpha=0.12, linewidth=0,
                label=f"{ci_distribution.upper()} CI (bootstrap)",
            )

    for i, f in enumerate(f for f in fits if not f.get("fitError")):
        xs = [p[0] for p in f["curve"]]
        ys = [p[1] for p in f["curve"]]
        ax.plot(
            xs, ys,
            color=OKABE_ITO[i % len(OKABE_ITO)],
            linewidth=2.2 if f["key"] == ci_distribution else 1.3,
            label=f["key"].upper(),
        )

    ax.plot(
        [p["returnPeriod"] for p in plotting_positions],
        [p["value"] for p in plotting_positions],
        "o", mfc="none", mec=GREY, mew=1.4, ms=5.5,
        label="Observed (Cunnane)",
    )

    ax.set_xscale("log")
    ax.set_xlim(1.01, 12000)
    ax.set_xlabel("Return period (years)")
    ax.set_ylabel("Precipitation depth (mm)")
    ax.set_title(f"Precipitation frequency — {duration_hours:g} h duration", fontsize=11)
    ax.grid(True, which="both", color="#e2e8f0", linewidth=0.6)
    ax.xaxis.set_major_formatter(ScalarFormatter())
    ax.legend(fontsize=7.5, ncol=3, loc="upper left", framealpha=0.9)
    return _finish(fig, meta)


def idf_plot_png(
    idf: dict,
    published: dict | None,
    meta: FigureMeta,
    show_return_periods: tuple[int, ...] = (2, 10, 100),
) -> bytes:
    """Log-log IDF: site-specific solid + CI band, ECCC published dashed."""
    fig, ax = plt.subplots(figsize=(7.2, 5.0))

    for ti, T in enumerate(show_return_periods):
        color = OKABE_ITO[ti % len(OKABE_ITO)]
        try:
            rp_idx = idf["returnPeriods"].index(T)
        except ValueError:
            continue

        xs, ys, lo, hi = [], [], [], []
        for di, dur in enumerate(idf["durationsHours"]):
            cell = idf["cells"][di][rp_idx]
            if not cell:
                continue
            xs.append(dur)
            ys.append(cell["intensity"])
            if cell["ciLow"] is not None and cell["ciHigh"] is not None:
                lo.append(cell["ciLow"])
                hi.append(cell["ciHigh"])
        if len(lo) == len(xs) and len(xs) > 1:
            ax.fill_between(xs, lo, hi, color=color, alpha=0.12, linewidth=0)
        ax.plot(xs, ys, "-o", color=color, linewidth=2, ms=4.5, label=f"T={T} yr (site)")

        if published:
            try:
                p_idx = published["returnPeriods"].index(T)
            except ValueError:
                continue
            px, py = [], []
            for di, d in enumerate(published["durations"]):
                v = published["intensitiesMmHr"][di][p_idx]
                if v is not None:
                    px.append(d["hours"])
                    py.append(v)
            if px:
                ax.plot(
                    px, py, "--", color=color, linewidth=1.4,
                    label=f"T={T} yr (ECCC {published.get('version', 'published')})",
                )

    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("Duration (h)")
    ax.set_ylabel("Rainfall intensity (mm/h)")
    dist = idf.get("distribution", "gumbel").upper()
    ax.set_title(
        f"IDF — site-specific ({dist}, solid) vs ECCC published (dashed)",
        fontsize=11,
    )
    ax.grid(True, which="both", color="#e2e8f0", linewidth=0.6)
    for axis in (ax.xaxis, ax.yaxis):
        axis.set_major_formatter(ScalarFormatter())
        axis.set_minor_formatter(NullFormatter())
        axis.set_major_locator(LogLocator(base=10, subs=(1.0, 2.0, 5.0)))
    ax.legend(fontsize=7.5, ncol=2, framealpha=0.9)
    return _finish(fig, meta)


# Theoretical tau3–tau4 curves; identical source as the UI constants
# (generated from lmoments3 distribution objects — Hosking & Wallis 1997).
def _theoretical_lmr_curves() -> dict[str, list[tuple[float, float]]]:
    import numpy as np
    from lmoments3 import distr

    def curve(dist, shape_name, values):
        pts = []
        for s in values:
            try:
                l = dist.lmom_ratios(nmom=4, **{shape_name: float(s), "loc": 0.0, "scale": 1.0})
                t3, t4 = float(l[2]), float(l[3])
                if -0.05 <= t3 <= 0.7 and -0.05 <= t4 <= 0.6:
                    pts.append((t3, t4))
            except Exception:
                pass
        return pts

    import numpy as _np

    return {
        "GEV": curve(distr.gev, "c", _np.linspace(-0.45, 0.7, 60)),
        "GLO": curve(distr.glo, "k", _np.linspace(-0.55, 0.4, 60)),
        "PE3": curve(distr.pe3, "skew", _np.linspace(0.0, 6.0, 60)),
    }


def lmr_diagram_png(
    samples: list[dict],  # [{durationHours, t3, t4}]
    meta: FigureMeta,
) -> bytes:
    fig, ax = plt.subplots(figsize=(6.4, 4.8))

    for i, (name, pts) in enumerate(_theoretical_lmr_curves().items()):
        ax.plot(
            [p[0] for p in pts], [p[1] for p in pts],
            color=OKABE_ITO[i], linewidth=1.4, label=name,
        )
    ax.plot(0.1699, 0.1504, "D", color=OKABE_ITO[4], ms=8, label="Gumbel")

    ax.plot(
        [s["t3"] for s in samples],
        [s["t4"] for s in samples],
        "o", mfc="none", mec=GREY, mew=1.8, ms=8, label="Sample",
    )
    for s in samples:
        ax.annotate(
            f"{s['durationHours']:g}h",
            (s["t3"], s["t4"]),
            textcoords="offset points", xytext=(5, 5), fontsize=7.5, color=GREY,
        )

    ax.set_xlim(-0.1, 0.7)
    ax.set_ylim(0.0, 0.5)
    ax.set_xlabel("L-skewness τ₃ (–)")
    ax.set_ylabel("L-kurtosis τ₄ (–)")
    ax.set_title("L-moment ratio diagram", fontsize=11)
    ax.grid(True, color="#e2e8f0", linewidth=0.6)
    ax.legend(fontsize=7.5, framealpha=0.9)
    return _finish(fig, meta)
