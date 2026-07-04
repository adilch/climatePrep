"""Regenerate golden values from the REFERENCE implementations.

Run:  .venv/Scripts/python scripts/generate_goldens.py   (needs requirements-dev)

Prints reference results for the canonical datasets from:
- pymannkendall 1.4.3  (original_test, sens_slope)
- pyhomogeneity 1.1    (pettitt_test, snht_test)

The printed values are hand-copied into tests/test_trend_golden.py with
documented tolerances. Monte-Carlo p-values (SNHT/Pettitt sim) vary run to
run in the reference package (unseeded) — goldens for those use wide
tolerances; deterministic statistics (S, Z, tau, slope, K, T0, cp) are exact.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tests"))

import pymannkendall as pmk
import pyhomogeneity as ph
from canonical import CANONICAL_PRECIP, CANONICAL_STABLE

for name, data in [("PRECIP", CANONICAL_PRECIP), ("STABLE", CANONICAL_STABLE)]:
    print(f"\n=== {name} (n={len(data)}) ===")
    mk = pmk.original_test(data)
    print(f"MK: trend={mk.trend} h={mk.h} p={mk.p!r} z={mk.z!r}")
    print(f"    s={mk.s!r} var_s={mk.var_s!r} tau={mk.Tau!r}")
    print(f"    slope={mk.slope!r} intercept={mk.intercept!r}")

    pt = ph.pettitt_test(data, alpha=0.05, sim=20000)
    print(f"Pettitt: h={pt.h} cp(1-based U index)={pt.cp!r} p={pt.p!r} U={pt.U!r}")
    print(f"    avg={pt.avg!r}")

    sn = ph.snht_test(data, alpha=0.05, sim=20000)
    print(f"SNHT: h={sn.h} cp={sn.cp!r} p={sn.p!r} T={sn.T!r}")
    print(f"    avg={sn.avg!r}")
