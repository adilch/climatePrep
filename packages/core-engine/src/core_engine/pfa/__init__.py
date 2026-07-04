"""Precipitation frequency analysis (spec §1.5 C, M3).

The numerical core MIRRORS the WSC flood-frequency engine (ffa-service/app/
ffa.py in adilch/WSCprep) — same lmoments3 distribution objects, same
L-moment/MOM fitting, same LP3 log10-space handling with Jacobian-corrected
AIC/BIC, same seeded-bootstrap CI machinery — so the two apps can later share
one package with zero behavioural drift (spec §0, §3.2). Do not "improve" the
shared numerics here without changing the WSC engine in lockstep.

M3 extensions (additive, not touching shared behaviour): MLE estimation,
PPCC goodness-of-fit, L-moment ratio diagram data, return periods to
10,000 yr, multi-duration IDF assembly, PDS/POT extraction.
"""
