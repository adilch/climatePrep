"""climatePrep numerical core.

This package is written to be functionally identical in interface to the WSC
flood-frequency engine (same distributions, L-moment fitting, bootstrap
machinery) so the two can later merge into one shared package with zero
behavioural drift (spec §0). Do not reinvent the distributions here — mirror
the WSC implementation (github.com/adilch/WSCprep, ffa-service/app/ffa.py).

M2 added the QC numerics (trend/homogeneity, aggregation, infilling).
M3 adds the frequency-analysis core (WSC mirror), PDS extraction, and IDF.
"""

__version__ = "0.2.0"


def engine_version() -> str:
    return __version__
