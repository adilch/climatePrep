"""climatePrep numerical core.

This package is written to be functionally identical in interface to the WSC
flood-frequency engine (same distributions, L-moment fitting, bootstrap
machinery) so the two can later merge into one shared package with zero
behavioural drift (spec §0). Do not reinvent the distributions here — mirror
the WSC implementation (github.com/adilch/WSCprep, ffa-service/app/ffa.py).

M2 added the QC numerics (trend/homogeneity, aggregation, infilling).
M3 added the frequency-analysis core (WSC mirror), PDS extraction, and IDF.
M5 adds Hershfield statistical PMP (WMO-1045 Ch. 4) and design storms.
"""

__version__ = "0.3.0"


def engine_version() -> str:
    return __version__
