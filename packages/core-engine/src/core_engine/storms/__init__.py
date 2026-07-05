"""Design-storm generation (spec §1.5 E, M5).

Temporal patterns shipped in M5 (each verifiable without external tables or
against widely published standards):
- chicago:     Keifer & Chu (1957) — analytic, from an i = a/(t+b)^c IDF fit
- alt_block:   alternating block / nested storm — direct from IDF depths
- scs_type2:   SCS/NRCS Type II 24-h mass curve (TR-55 table)
- pmp:         PMP hyetograph — alternating block on the WMO-1045 Figure 4.8
               maximum depth–duration curve scaled to the PMP depth

Huff quartiles and the AES/ECCC (Hogg 1980) distributions require verified
curve tables and join in a Phase-2 continuation — the pattern registry
supports adding them as data without code changes.
"""
