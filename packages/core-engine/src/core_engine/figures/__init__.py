"""Server-side figure rendering (spec §3.7).

matplotlib (Agg) renders every report figure server-side — one figure
pipeline, reproducible bytes for stamped reports. Every figure carries a
title, axis labels with units, and a provenance footer (station, seed,
engine version) per spec §4.
"""
