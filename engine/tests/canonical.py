"""Canonical dataset for trend/homogeneity golden-value tests.

Synthetic "annual precipitation" series (mm), n=50: base 480 mm, sd 60 mm,
mild upward trend (+1.2 mm/yr), and a +90 mm step change after index 24 —
exercises Mann-Kendall/Sen (trend), Pettitt and SNHT (change point).
Generated once (numpy default_rng(2026)) and FROZEN as literals; the golden
values in test_trend_golden.py were produced from this exact list by the
reference implementations pymannkendall 1.4.3 and pyhomogeneity 1.1
(see scripts/generate_goldens.py).
"""

CANONICAL_PRECIP = [
    432.4, 495.6, 368.6, 567.3, 523.1, 468.5, 468.5, 506.6, 473.5, 477.2,
    535.2, 524.1, 490.6, 490.5, 506.5, 461.2, 475.0, 533.3, 493.8, 420.3,
    475.4, 544.6, 492.5, 498.7, 547.3, 709.5, 558.4, 683.3, 529.8, 615.3,
    535.8, 688.3, 658.4, 677.9, 557.7, 653.1, 582.1, 587.0, 646.0, 669.4,
    630.3, 581.5, 570.9, 708.3, 658.4, 667.2, 756.2, 577.4, 781.2, 817.9,
]

# A short stable series (no trend, no step) for negative-control assertions.
CANONICAL_STABLE = [
    501.2, 489.7, 512.3, 495.5, 507.1, 498.9, 493.4, 510.8, 502.6, 488.1,
    505.9, 497.3, 509.4, 491.8, 500.0, 503.7, 494.6, 506.2, 499.1, 496.8,
]
