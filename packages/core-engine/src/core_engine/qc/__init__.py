"""QA/QC numerics (spec §1.5 B, M2).

Modules:
- trend:     Mann-Kendall + Sen's slope, Pettitt, SNHT (Alexandersson)
- aggregate: rolling-maximum AMS extraction + fixed→true interval correction
- infill:    normal-ratio, IDW, regression infilling with per-point logging

All functions are deterministic (Monte Carlo p-values are seeded) and every
result carries enough metadata to reconstruct the computation (spec §9).
"""
