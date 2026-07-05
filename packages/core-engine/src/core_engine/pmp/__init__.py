"""Statistical PMP — Hershfield method (spec §1.5 D, M5).

Implements WMO-No. 1045 (2009) Chapter 4 with the full adjustment chain:
outlier (max-observed) adjustment, sample-size adjustment, Km(mean, duration),
fixed→true interval, and point→area reduction — every factor logged.

IMPORTANT — digitization notice: WMO-1045 presents Figures 4.1–4.7 as graphs.
The default curves here are documented digitizations anchored to the manual's
own worked example (Table 4.1) and figure axis limits; between anchors they
are approximate. Every factor is overridable, and the reviewing engineer must
verify curve readings against the manual for production use (spec §1.4).
"""
