"""climatePrep numerical core.

This package is written to be functionally identical in interface to the WSC
flood-frequency engine (same distributions, L-moment fitting, bootstrap
machinery) so the two can later merge into one shared package with zero
behavioural drift (spec §0). Do not reinvent the distributions here — mirror
the WSC implementation (github.com/adilch/WSCprep, ffa-service/app/ffa.py).

M0 exposes only the version. The frequency-analysis core lands in M3.
"""

__version__ = "0.0.0"


def engine_version() -> str:
    return __version__
