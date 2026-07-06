/**
 * Card info registry — the "i" button on every card reads its content here.
 * Content is drawn from the engine's method docstrings and the spec §7
 * references, so the explanations match what the code actually computes.
 * Keep entries factual: what the card shows, the method, how it is computed,
 * and primary references (with links where a stable one exists).
 */

export interface InfoReference {
  text: string;
  href?: string;
}

export interface InfoContent {
  title: string;
  /** What this card shows, in one or two sentences. */
  description: string;
  /** Named method / approach, if applicable. */
  method?: string;
  /** How the numbers are produced, as short steps. */
  how?: string[];
  /** Caveats the reviewing engineer should keep in mind. */
  notes?: string;
  references?: InfoReference[];
}

const OGL: InfoReference = {
  text: "Environment and Climate Change Canada (ECCC) — data under the Open Government Licence – Canada",
  href: "https://open.canada.ca/en/open-government-licence-canada",
};

export const INFO: Record<string, InfoContent> = {
  // ------------------------------- Stations --------------------------------
  "stations.site": {
    title: "Site location",
    description:
      "The dam site anchors every downstream analysis: candidate stations are ranked relative to it, and it is the origin for the Saville fetch construction.",
    how: [
      "Click the map to drop the site pin (latitude/longitude captured to 5 decimals).",
      "Enter the site elevation to enable the elevation-difference term in station ranking (important in the Alberta foothills).",
    ],
    notes:
      "Coordinates and elevation become part of the provenance record for every result generated from this project.",
  },
  "stations.candidates": {
    title: "Candidate station ranking",
    description:
      "Nearby ECCC climate stations ranked for suitability by distance, record length, and elevation difference from the site.",
    method: "Transparent weighted score (distance 0.5 · record 0.3 · elevation 0.2)",
    how: [
      "Great-circle distance to each station by the haversine formula.",
      "distScore = max(0, 1 − d/150 km); recordScore = min(1, years/60); elevScore = max(0, 1 − |Δelev|/500 m).",
      "score = 0.5·distScore + 0.3·recordScore + 0.2·elevScore, sorted descending.",
      "Unknown station elevation is not penalised (elevScore = 1) and is flagged instead.",
    ],
    notes:
      "The score is deliberately simple and appears in reports; it is guidance, not a substitute for judgement about station representativeness.",
    references: [OGL],
  },
  "stations.selected": {
    title: "Selected stations",
    description:
      "The stations attached to this project. A project may use several: a primary, supporting neighbours for infilling, a wind station, and comparison stations.",
    notes:
      "Each selection stores the distance and elevation difference computed at selection time for the provenance chain.",
  },

  // --------------------------------- Data ----------------------------------
  "data.pull": {
    title: "Data acquisition",
    description:
      "Pulls observation series from the ECCC Meteorological Service of Canada GeoMet OGC API (or AHCCD homogenized series) for the chosen station, collection, and period.",
    method: "MSC GeoMet — OGC API – Features (api.weather.gc.ca)",
    how: [
      "Requests are paged (10 000 features/page), rate-limited, and retried with backoff.",
      "Responses are cached deterministically (by collection + station + period + params) so an identical repeat pull is served from cache.",
      "Every pull writes an append-only data_pulls provenance row: source, endpoint URL, period, row count, timestamps, and OGL attribution.",
    ],
    notes:
      "Datamart's static climate archive was retired; GeoMet is the primary source with the legacy bulk CSV as fallback (verified 2026-07-04).",
    references: [OGL, { text: "MSC GeoMet OGC API – Features", href: "https://api.weather.gc.ca" }],
  },
  "data.preview": {
    title: "Raw data preview",
    description:
      "The first rows of the pulled series, straight from the source with no processing — a sanity check before QA/QC.",
    notes: "Always-null columns are hidden. The full series is cached and used by downstream analyses.",
  },
  "data.history": {
    title: "Pull history (provenance)",
    description:
      "Every data pull for this project, kept permanently (append-only). This is the acquisition half of the audit trail that every exported number traces back to.",
    how: [
      "Records source, collection, period, row count, request/completion timestamps, endpoint URL, and licence.",
      "Failed pulls are recorded with an error status rather than deleted.",
    ],
    references: [OGL],
  },

  // --------------------------------- QA/QC ---------------------------------
  "qc.trend": {
    title: "Homogeneity & trend testing",
    description:
      "Tests whether the annual series is stationary and homogeneous before it is used for frequency analysis. A detected change point suggests a station move, instrument or exposure change rather than climate.",
    method: "Mann-Kendall + Sen's slope (trend); Pettitt and SNHT (change point)",
    how: [
      "Mann-Kendall S statistic with tie-corrected variance → Z and a two-sided p-value; Sen's slope is the median of pairwise slopes.",
      "Pettitt: rank-based change-point test (approximate p-value).",
      "SNHT (Alexandersson): standard normal homogeneity test with a seeded Monte-Carlo p-value (reproducible).",
      "If any test flags inhomogeneity, the app suggests pulling the AHCCD homogenized series for the station.",
    ],
    notes:
      "Implementations are golden-valued against pymannkendall and pyhomogeneity on canonical datasets.",
    references: [
      { text: "Mann (1945); Kendall (1975); Sen (1968)" },
      { text: "Pettitt, A.N. (1979), Applied Statistics 28(2)" },
      { text: "Alexandersson, H. (1986), Journal of Climatology 6" },
    ],
  },
  "qc.aggregate": {
    title: "AMS aggregation & interval correction",
    description:
      "Extracts the annual maximum series (AMS) for each duration and applies the fixed→true interval correction. Clock-interval maxima systematically underestimate true sliding maxima, so this correction is required for frequency analysis.",
    method: "Rolling-sum AMS + WMO-1045 / Weiss (1964) interval factors",
    how: [
      "The record is placed on a regular grid; a rolling k-step sum gives each duration; any window containing a missing interval is invalid.",
      "A year is used only if its daily completeness meets the threshold (default 80% of the calendar year); skipped years are logged.",
      "The fixed→true factor multiplies each duration's maxima: k=1 → 1.13 (default, editable), k=2 → 1.04, k=3 → 1.03, … (full table, each applied factor logged).",
    ],
    notes:
      "Disable the correction only if the series is already true-interval. The corrected AMS feeds PFA and PMP.",
    references: [
      { text: "WMO-No. 1045 (2009), Manual on Estimation of PMP", href: "https://library.wmo.int/idurl/4/35708" },
      { text: "Weiss, L.L. (1964), Monthly Weather Review 92" },
    ],
  },
  "qc.infill": {
    title: "Missing-data infilling",
    description:
      "Estimates missing daily values from correlated neighbour stations. Every filled point is flagged and logged with the method and the neighbours used.",
    method: "Normal-ratio, inverse-distance weighting (IDW), or regression",
    how: [
      "Normal-ratio (Paulhus & Kohler 1952): mean of neighbour values scaled by the ratio of station normals.",
      "IDW: weights ∝ distance⁻² (configurable power).",
      "Regression: OLS against the best-correlated neighbour over paired complete observations (minimum overlap enforced); negative estimates clamped to zero.",
      "Points no method can fill remain missing and are reported.",
    ],
    references: [{ text: "Paulhus, J.L.H. & Kohler, M.A. (1952), Monthly Weather Review 80" }],
  },

  // ---------------------------------- PFA ----------------------------------
  "pfa.controls": {
    title: "Precipitation frequency analysis (PFA)",
    description:
      "Fits extreme-value distributions to the annual maximum series for each duration and produces design quantiles with confidence intervals, then assembles the IDF surface.",
    method: "L-moments (default), MOM, or MLE fitting of Gumbel/GEV/GLO/PE3/LP3",
    how: [
      "Distributions fitted via the lmoments3 core (mirrors the WSC streamflow engine for zero drift).",
      "Goodness of fit: Kolmogorov–Smirnov, Anderson–Darling, PPCC, and AIC/BIC (LP3 fit in log₁₀ space with the Jacobian correction).",
      "Quantiles from T=2 to 10,000 yr with nonparametric bootstrap confidence intervals at a fixed seed (reproducible).",
      "The IDF surface uses a single distribution family across durations (default Gumbel) to keep the curves monotone and comparable to the ECCC published IDF.",
    ],
    references: [
      { text: "Hosking, J.R.M. & Wallis, J.R. (1997), Regional Frequency Analysis: An Approach Based on L-Moments" },
      { text: "Cunnane, C. (1978), Journal of Hydrology 37 (plotting positions)" },
    ],
  },
  "pfa.results": {
    title: "Distribution fits & frequency plot",
    description:
      "Per-duration fitted parameters, goodness-of-fit statistics, and the quantile table, with the frequency plot showing the fitted curves, a confidence band, and the observed maxima at their plotting positions.",
    how: [
      "\"Best fit\" is the distribution with the lowest AIC.",
      "Observed points are placed with Cunnane plotting positions; the return-period axis is logarithmic.",
      "The confidence band is the bootstrap percentile interval for the selected (IDF) distribution.",
    ],
    references: [
      { text: "Hosking & Wallis (1997)" },
    ],
  },
  "pfa.idf": {
    title: "IDF — site vs ECCC published",
    description:
      "Intensity–duration–frequency curves from the site-specific analysis (solid, with confidence band) overlaid on the ECCC Engineering Climate Datasets published IDF for the same station (dashed).",
    how: [
      "Site intensities = fitted depth ÷ duration for the IDF distribution.",
      "Published curves are parsed from the ECCC Engineering Climate Datasets (v3.20 per-province archives); both are Gumbel/method-of-moments, so they are directly comparable.",
    ],
    notes:
      "Differences commonly reflect record period, gauge type, and the interval correction. Only ~600 tipping-bucket stations have a published IDF.",
    references: [
      { text: "ECCC Engineering Climate Datasets (IDF Files)", href: "https://climate.weather.gc.ca/prods_servs/engineering_e.html" },
      OGL,
    ],
  },
  "pfa.lmr": {
    title: "L-moment ratio diagram",
    description:
      "Plots the sample L-skewness/L-kurtosis (τ₃, τ₄) for each duration against the theoretical curves of the candidate distributions — a visual guide to which family fits best.",
    how: [
      "Sample L-moment ratios are computed from the AMS.",
      "Theoretical curves for GEV/GLO/PE3 (and the Gumbel point) are the Hosking & Wallis relationships.",
    ],
    references: [{ text: "Hosking & Wallis (1997), Fig. 2.5" }],
  },

  // ---------------------------------- PMP ----------------------------------
  "pmp.controls": {
    title: "Statistical PMP — Hershfield",
    description:
      "Estimates Probable Maximum Precipitation for a duration from the station's annual maxima using the Hershfield statistical method as standardized by WMO-1045.",
    method: "Hershfield (WMO-No. 1045, Chapter 4)",
    how: [
      "Adjust mean and standard deviation for the maximum observed event (Figs 4.2/4.3) and for record length (Fig 4.4).",
      "Read the frequency factor Km from Fig 4.1 using the adjusted mean and duration.",
      "Point PMP = adjusted mean + Km × adjusted SD (Eq. 4.2).",
      "Apply the fixed→true interval factor (Fig 4.5 / Weiss) and the point→area reduction (Fig 4.7).",
    ],
    notes:
      "The figure-derived factors are digitized curves anchored to the manual's Table 4.1 worked example; verify readings for production use or supply overrides. Every applied factor is listed in the result's step log.",
    references: [
      { text: "Hershfield, D.M. (1961, 1965)" },
      { text: "WMO-No. 1045 (2009), Chapter 4", href: "https://library.wmo.int/idurl/4/35708" },
    ],
  },
  "pmp.results": {
    title: "PMP result & adjustment log",
    description:
      "The step-by-step Hershfield computation — every adjustment factor with its source — plus the depth–area (DAD) table and the digitization notice.",
    notes:
      "The area-reduction curves are the manual's idealized western-US example; develop site-specific curves for production work (WMO-1045 §4.5).",
    references: [{ text: "WMO-No. 1045 (2009), §4.3–4.5" }],
  },

  // -------------------------------- Storms ---------------------------------
  "storm.controls": {
    title: "Design storm generation",
    description:
      "Builds a design hyetograph from an IDF (or a PMP depth) using a temporal pattern, for use as rainfall forcing in HEC-HMS/RAS/SWMM. Forcing only — no routing.",
    method: "Chicago, alternating block, SCS Type II, or PMP hyetograph",
    how: [
      "Chicago (Keifer & Chu 1957): analytic hyetograph from an i = a/(t+b)^c IDF fit around a time-to-peak ratio.",
      "Alternating block: nested storm from IDF depths — the m largest blocks sum exactly to the m·Δt-duration depth.",
      "SCS Type II: USDA TR-55 dimensionless 24-h mass curve scaled to the total depth.",
      "PMP hyetograph: alternating block on the WMO-1045 Fig 4.8 maximum depth–duration curve.",
    ],
    notes:
      "Huff quartile and AES/ECCC distributions will be added once verified curve tables are incorporated.",
    references: [
      { text: "Keifer, C.J. & Chu, H.H. (1957), ASCE J. Hydraulics" },
      { text: "USDA NRCS, TR-55 (1986)" },
    ],
  },
  "storm.results": {
    title: "Hyetograph",
    description:
      "The generated design storm as incremental intensity (bars) and cumulative depth (line). The increments sum exactly to the target depth.",
    notes:
      "Export as a native SWMM rain-gage (.dat) file or a HEC-HMS/RAS paste-ready CSV from the buttons above.",
  },

  // ---------------------------- Wind & freeboard ---------------------------
  "wind.extremes": {
    title: "Extreme wind frequency",
    description:
      "Fits a Gumbel (EV1) distribution to the annual maximum wind series to obtain design wind speeds by return period, and summarizes direction as a wind rose.",
    method: "Gumbel/EV1 via the shared frequency core; 16-sector wind rose",
    how: [
      "Annual maxima are taken from hourly wind speed (≥6000 valid hours/year) or daily maximum gust.",
      "Gumbel is fitted by L-moments with bootstrap confidence intervals (same core as PFA — no separate numerics).",
      "The rose bins all hourly observations into 16 compass sectors and speed classes.",
    ],
    references: [{ text: "Gumbel, E.J. (1958), Statistics of Extremes" }],
  },
  "wind.freeboard": {
    title: "Fetch, waves & freeboard",
    description:
      "From the reservoir polygon and a design wind, computes the effective fetch, the wind-generated waves, and the required freeboard as a CDA-aligned component table.",
    method: "Saville effective fetch → SMB/SPM waves → runup + setup + allowances",
    how: [
      "Saville effective fetch: 15 radials at 6° to ±42° from the dam; F_eff = Σ(xᵢ·cos²αᵢ)/Σcos αᵢ.",
      "Overland wind converted to over-water (SPM R_L curve); waves via SMB/Bretschneider (or SPM-84).",
      "Runup by TAW (2002) or Hunt with the embankment slope and riprap roughness γf; wind setup by the Zuider Zee equation.",
      "A 16-direction scan reports the governing (critical) direction. Total freeboard = runup + setup + analyst allowances.",
    ],
    notes:
      "R_L and γf are curve/table-based factors — verify them for production use. The freeboard table lists every input so it stands alone in a report.",
    references: [
      { text: "USACE Coastal Engineering Manual, EM 1110-2-1100" },
      { text: "Shore Protection Manual (1984); Saville (1954); TAW (2002)" },
    ],
  },

  // -------------------------------- Compare --------------------------------
  "compare.idf": {
    title: "Site vs published comparison",
    description:
      "Contrasts the site-specific IDF with the ECCC published IDF at shared duration/return-period points so the chosen design value is defensible.",
    how: [
      "Δ% = (site depth − published depth) / published depth × 100 at each matching point.",
      "Differences above ±25% are flagged for attention.",
    ],
    notes:
      "Document the rationale for the chosen design value; regional estimates will join this panel in a later phase.",
    references: [OGL],
  },

  // --------------------------------- Report --------------------------------
  "report.generate": {
    title: "Report generation",
    description:
      "Produces the DSR-ready deliverables from a completed analysis: a Word report section, a PDF, and an Excel workbook.",
    how: [
      "Methodology text is generated from the actual analysis parameters (not boilerplate); figures are rendered server-side by matplotlib for reproducibility.",
      "The provenance appendix, OGL-Canada attribution, and professional-responsibility disclaimer are always included — no export without a complete source→method→version chain.",
    ],
    notes:
      "The engineer reviews and stamps; the tool assists and does not certify results.",
    references: [
      { text: "CDA Dam Safety Guidelines (2007, rev. 2013)" },
      OGL,
    ],
  },
  "report.documents": {
    title: "Generated documents",
    description:
      "Every deliverable generated for this project, each stamped with the app and engine versions and downloadable from Blob storage.",
    notes: "Regenerate after any upstream change so the document reflects the current results.",
  },
};

export type InfoKey = keyof typeof INFO;
