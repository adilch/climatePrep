"""Wind, wave and freeboard numerics (spec §1.5 F/G, M6).

Modules:
- fetch:      Saville effective fetch from a reservoir polygon
- prediction: SMB/Bretschneider + SPM-84 wave hindcasting, overland→overwater
- runup:      Hunt and TAW 2002 runup, Zuider Zee wind setup
- freeboard:  CDA-aligned freeboard component assembly + directional scan

References (spec §7): USACE Coastal Engineering Manual EM 1110-2-1100;
Shore Protection Manual (1984); Bretschneider/SMB curves; Saville (1954);
TAW (2002) / EurOtop lineage for runup; Zuider Zee setup equation.
"""
