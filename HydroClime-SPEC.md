# HydroClime — Master Specification

> **Working name:** HydroClime (placeholder — rename freely).
> **What it is:** A web application for Canadian water-resources engineers to acquire ECCC/MSC climate data and run the full suite of meteorological analyses required for **Dam Safety Reviews (DSR)** — precipitation frequency analysis, PMP, design storms, extreme wind, wave/freeboard, and snowmelt — with a defensible, reproducible audit trail suitable for P.Eng.-stamped reports.
> **Deployment target:** Vercel.
> **Audience for this doc:** Claude Code, for end-to-end build + deploy.

This is the single source of truth. Sections are ordered **PRD → App Flow → Tech Stack → Design System → Data Schema → Implementation Plan → Methods & References**. Build milestone-by-milestone (see Implementation Plan); do not attempt the whole thing in one pass.

---

## 0. Scope & Relationship to the Existing WSC App

There is an existing WSC Hydrometric web app (streamflow flood-frequency analysis: HYDAT catalog, FastAPI + scipy/lmoments3, GEV/GLO/Gumbel/LP3/PE3 + L-moments + bootstrap CIs). HydroClime is the **meteorology sibling** of that app. Long term they converge into one monorepo over a shared core. For this build, to keep the path to a deployed tool short:

**Build HydroClime as its own standalone, independently deployable app now**, but structure its internals as extraction-ready packages:

- `packages/core-engine` (Python) — the numerical frequency-analysis core. **Write this to be functionally identical in interface to the WSC engine** (same distributions, same L-moment fitting, same bootstrap machinery) so the two can later be merged into one shared package with zero behavioural drift. Do **not** reinvent the distributions; mirror the WSC implementation.
- `packages/core-ts` — shared TypeScript types, Zod schemas, and the provenance model.
- `packages/ui` — shared React components (station map, frequency/IDF charts, data tables).

**Explicitly out of scope for this build:** refactoring or migrating the existing WSC app. That is a later phase (monorepo extraction + WSC merge). HydroClime must stand alone and deploy independently.

**MVP boundary:** Data Acquisition + QA/QC + Precipitation Frequency Analysis + IDF (with ECCC-published-IDF comparison) + Reporting/Export. PMP, design storms, wind/wave, freeboard, snowmelt, and the classification-scoping engine are Phase 2. Deterministic storm transposition, gridded data, and the monorepo merge are Phase 3.

---

## 1. Product Requirements (PRD)

### 1.1 Problem

ECCC climate data access (climate.weather.gc.ca) is slow and CSV-driven; every DSR meteorology task is hand-assembled in ad-hoc spreadsheets with no traceability. Reviewers (regulators, independent engineers) demand to see source stations, record periods, methods, and parameters. There is no single tool that goes from **"click the dam site"** to **"DSR-ready, auditable met analysis + report section."**

### 1.2 Users & personas

| Persona | Needs |
|---|---|
| **DSR lead engineer (P.Eng.)** | Defensible numbers, full provenance, report/Excel outputs they can stamp, control over methods and assumptions. |
| **Junior water-resources engineer** | Guidance on *which* analyses a given dam requires (consequence-class scoping), sensible defaults, hard-to-misuse workflows. |
| **Reviewer / regulator (indirect)** | Wants transparency: source IDs, timestamps, methods, parameters, versions — ideally in a standard appendix. |
| **General hydrologist (secondary)** | Wants IDF for a culvert, low-flow context, or extreme wind — *without* being forced into a full DSR project. |

### 1.3 Goals

1. Remove the data-acquisition friction entirely (map-based, multi-source, cached, provenance-captured).
2. Provide a defensible, reproducible analytical engine covering the DSR meteorology workflow.
3. Encode the **CDA consequence-classification → analysis-scoping** logic so studies are scoped correctly.
4. Produce stamp-ready outputs: report section (Word/PDF), Excel workbook, standard figures, and model-ready forcing files — each carrying a complete audit trail.

### 1.4 Non-goals

- Not a hydrologic/hydraulic model. HydroClime produces **meteorological forcing and frequency results**; routing/PMF happens in HEC-HMS/RAS/SWMM. Hand off cleanly, don't reimplement routing.
- Not a replacement for engineering judgment. Every output carries a professional-responsibility disclaimer; the engineer stamps, the tool assists.
- Not (in MVP) deterministic storm transposition or gridded reanalysis — those are Phase 3.

### 1.5 Functional requirements

Grouped by module. **[MVP]** = ship in v1; **[P2]** = Phase 2; **[P3]** = Phase 3.

**A. Data acquisition [MVP]**
- A1. Map-based station finder (Leaflet/MapLibre): click a site → ranked nearby stations by **distance, record length, and elevation difference** (elevation matters in the Alberta foothills).
- A2. Multi-source ingestion via **MSC GeoMet / Open Data (OGC API – Features, `api.weather.gc.ca`)**: `climate-daily`, `climate-hourly`, `climate-monthly`, `climate-normals`, and **AHCCD** homogenized series (annual/monthly/trends/stations). **Datamart** (`dd.weather.gc.ca`) for bulk. Legacy bulk CSV (`climate.weather.gc.ca/climate_data/bulk_data_e.html`) as a fallback. **Verify all endpoint paths/collection names/versions at build time — MSC has been migrating products.**
- A3. Ingest **ECCC Engineering Climate Datasets** (published IDF files + annual-maximum rainfall series) for overlay/comparison against site-specific analysis.
- A4. Data-availability visualization: per-station record-length timeline + missing-data heatmap, shown *before* the user commits to a station.
- A5. Every pull captured as a provenance record (source, Climate ID / WMO ID / Station ID, endpoint, pull timestamp, record period, row counts).

**B. QA/QC & preprocessing [MVP]**
- B1. Missing-data infilling: normal-ratio, IDW, and regression against correlated neighbours — **method and neighbours logged**.
- B2. Homogeneity/trend testing: Pettitt, SNHT, Mann-Kendall + Sen's slope. Flag inhomogeneous records; offer the AHCCD equivalent.
- B3. Sub-daily/multi-day aggregation: roll hourly → 1/2/6/12/24 h and 48/72 h maxima, with the **fixed-interval → true-interval correction factor** applied (configurable; default ≈1.13 single-interval per WMO-1045). Clock-hour data underestimates true sliding maxima — this correction is mandatory and must be visible/toggleable.

**C. Precipitation frequency analysis (PFA) [MVP]** — *reuses the shared freq engine*
- C1. AMS and PDS extraction across all durations simultaneously.
- C2. Fit **Gumbel / GEV / LP3 / GLO / PE3** via **L-moments (default), MOM, MLE**. GOF via AD/KS/PPCC + L-moment ratio diagram.
- C3. Quantiles for **2 → 10,000 yr** with **bootstrap confidence bands** (configurable n resamples, CI level).
- C4. **IDF curve generation**, plotted against ECCC-published IDF for the same station.
- C5. **Areal reduction factors** (point → catchment-average depth).
- C6. **Regional frequency analysis** [P2]: L-moment/index-flood regionalization, discordancy + Hosking-Wallis heterogeneity H.

**D. PMP [P2]**
- D1. Statistical **Hershfield method**, done properly: Km as a function of mean & duration; sample-size corrections for mean and standard deviation; fixed→true interval; point→area reduction.
- D2. Depth-Area-Duration (DAD) analysis; seasonal distribution of PMP.
- D3. Moisture-maximization hooks (dewpoint / precipitable water) — stub for [P3] deterministic transposition.

**E. Design storm generation [P2]**
- E1. Temporal distributions: Chicago (Keifer-Chu), alternating block, Huff quartiles, SCS/NRCS types, AES/ECCC.
- E2. Nested design storms from IDF; PMP hyetograph.
- E3. Export hyetographs as **HEC-HMS / HEC-RAS / SWMM** inputs. Forcing only — no routing.

**F. Wind & wave [P2]**
- F1. Extreme wind frequency (annual-max hourly + gust, Gumbel) for design return periods.
- F2. Wind rose / directional analysis; overland → overwater conversion.
- F3. **Effective fetch from reservoir geometry**: user draws reservoir polygon on the map, picks critical direction → effective fetch (Saville) computed automatically and fed to the wave calc.

**G. Freeboard [P2]**
- G1. Wave prediction (Hs, Tp) via CEM/SPM + Bretschneider.
- G2. Wind setup + wave runup on the embankment (accounts for upstream slope + riprap roughness).
- G3. CDA-aligned freeboard summary table (runup + setup + allowances).

**H. Snowmelt / rain-on-snow [P2/P3]**
- H1. Derive SWE from snow-on-ground; degree-day/temperature-index melt; rain-on-snow antecedent scenario builder.

**I. Consequence-classification scoping [P2]**
- I1. Input the dam's **CDA consequence category** (Low → Extreme) → app returns the applicable **IDF/EDF and PMP/PMF targets** and the required analysis set. Layer Alberta **Dam and Canal Safety Directive** requirements on top. Encodes the CDA decision framework so juniors scope correctly.

**J. Project, provenance & reproducibility [MVP — core differentiator]**
- J1. A **project** ties a dam + consequence classification + site + all analyses into one reproducible unit.
- J2. Every analysis stores: source station(s), Climate/WMO ID, pull timestamp, record period, method, distribution, fitted parameters, engine version, app version.
- J3. Re-run reproducibility: given a saved project, re-execution yields identical results (seeded bootstrap).
- J4. **Standalone-analysis mode**: each module usable without a full DSR project (e.g. IDF for a culvert). Do not gate analyses behind "start a dam project."

**K. Reporting & export [MVP]**
- K1. DSR-ready **report section** (methodology text + tables + figures) as **PDF and Word (.docx)**.
- K2. **Excel workbook**: raw data, intermediate calcs, results (reviewers want the numbers).
- K3. Standard figures: IDF with CIs, frequency plots, wind roses, DAD curves, hyetographs, freeboard summary.
- K4. Model-ready files (HEC-HMS/RAS/SWMM hyetographs).
- K5. **Comparison panel**: site-specific PFA vs ECCC-published IDF vs regional estimates, so the chosen design value is defensible.
- K6. Every export includes a **provenance appendix** and **OGL-Canada attribution** for ECCC data + a professional-responsibility disclaimer.

### 1.6 Non-functional requirements

- **Reproducibility/audit (highest priority):** deterministic, seeded computations; complete provenance on every number; app + engine versions stamped into results and exports.
- **Correctness:** golden-value tests against published references for every analytical method (see §5, §6). Engineering correctness outranks delivery speed.
- **Performance within Vercel limits:** design compute so no single request depends on an unbounded execution time (see Tech Stack async-job pattern).
- **Security:** authenticated; project data scoped per user/org; no secrets client-side.
- **Data licensing:** ECCC data is under the **Open Government Licence – Canada**; attribution required in all outputs. Cache respectfully (rate-limit, backoff, honor source terms).
- **Accessibility:** WCAG 2.1 AA; colorblind-safe chart palettes.
- **Units:** SI primary (mm, m, m/s, m³/s); display-only imperial toggle optional. Sign/interval conventions documented in outputs.

### 1.7 Success metrics

- Time from "site selected" to "IDF + report section" reduced to minutes.
- 100% of exported numbers traceable to a source + method + version.
- Golden-value suite passes for all shipped methods.
- A junior engineer can correctly scope a DSR's met analyses from the consequence class alone.

### 1.8 Assumptions & constraints

- Vercel is the deployment platform (see Tech Stack for the honest treatment of Python + function-duration limits).
- Solo developer; favour maintainability and a single deployable over microservice sprawl.
- ECCC endpoints must be verified at build (they move).
- The tool assists a licensed engineer; it does not certify results.

---

## 2. App Flow

### 2.1 Primary journey (full DSR project)

```
Sign in
  └─> Dashboard (list of projects + "New standalone analysis")
        └─> New Project
              ├─ Dam & consequence classification  (name, owner, CDA category Low→Extreme, jurisdiction=AB default)
              ├─ Site location (map pin → lat/lon/elev; optional reservoir polygon)
              └─ [Scoping engine, P2] returns required analyses + IDF/PMP targets
        └─> Station Finder
              ├─ Map centered on site; ranked candidate stations (distance / record length / elev diff)
              ├─ Availability panel (timeline + missing-data heatmap) per candidate
              └─ Select one or more stations → confirm
        └─> Data Acquisition
              ├─ Choose collections (daily / hourly / normals / AHCCD) + period
              ├─ Pull (cached; provenance captured); progress + row counts
              └─ Raw data preview
        └─> QA/QC
              ├─ Missing-data infilling (method + neighbours)
              ├─ Homogeneity/trend flags (Pettitt/SNHT/MK+Sen)
              └─ Sub-daily aggregation + fixed→true interval correction (toggle + factor)
        └─> Analyses (module tabs, each independently runnable)
              ├─ PFA / IDF            [MVP]
              ├─ PMP (Hershfield)     [P2]
              ├─ Design storms        [P2]
              ├─ Wind & wave          [P2]
              ├─ Freeboard            [P2]
              └─ Snowmelt / RoS       [P2/P3]
        └─> Compare panel (site PFA vs ECCC IDF vs regional)   [MVP]
        └─> Report Builder
              ├─ Select sections/figures/tables
              ├─ Generate .docx / .pdf / .xlsx + model-forcing files
              └─ Provenance appendix + OGL attribution + disclaimer auto-included
```

### 2.2 Standalone-analysis journey (no project)

`Dashboard → New standalone analysis → pick module → (optional) find station + pull, or paste/upload a series → run → export`. Results can optionally be "saved into a project" later. This keeps the tool useful for non-DSR tasks (culvert IDF, low-flow context, extreme wind).

### 2.3 Navigation structure

- **App shell:** left nav = Projects, Standalone, Reference data, Settings. Top bar = project switcher, user menu, app version badge (version is part of provenance).
- **Project shell:** tabbed — Overview · Stations · Data · QA/QC · Analyses (sub-tabs per module) · Compare · Report. State persists per project.

### 2.4 Project state machine

`draft → data_acquired → qa_complete → analyses_in_progress → report_ready`. States are non-blocking (you can revisit any stage); they drive UI hints and the scoping checklist, not hard gates. Any change to upstream data (new pull, changed QA) marks dependent analyses **stale** and prompts re-run (never silently serves outdated results).

### 2.5 Async compute flow (Vercel-aware)

Heavy jobs (large bootstraps across many durations, PMP over many durations, regional pooling) must not block a request:

```
Client → POST /app/api/jobs (enqueue)  → returns { jobId, status: 'queued' }
         └─ enqueue to QStash (Upstash) with payload
QStash  → invokes Python engine function (extended duration) with payload + callback
Engine  → computes → writes result to Postgres + Blob → marks job 'done'
Client  → polls GET /app/api/jobs/:id  OR receives SSE/websocket update → renders result
```

Light jobs (single distribution fit, quick quantiles) may run synchronously in the engine function directly. The **decision rule**: if worst-case runtime could exceed a comfortable fraction of the function duration limit, route it through the job queue.

---

## 3. Tech Stack

Use latest stable versions at build time; verify each. Rationale is given where a choice is load-bearing.

### 3.1 Frontend
- **Next.js (App Router) + React + TypeScript** — deploys natively on Vercel.
- **Tailwind CSS + shadcn/ui** — fast, consistent, accessible primitives.
- **Map:** Leaflet (react-leaflet) or MapLibre GL. Leaflet is simplest for pin + polygon draw (use `leaflet-draw` / `@turf/turf` for fetch geometry). MapLibre if vector basemaps/perf matter later.
- **Charts:** for scientific plots (IDF log-log with CI bands, frequency plots on probability axes, DAD, wind rose, hyetographs) use **Plotly** (`react-plotly.js`) or **visx**. Plotly handles log axes, error bands, and export-to-PNG out of the box; visx gives more control but more code. **Recommendation: Plotly for the analytical charts, Recharts only for simple dashboard widgets.**
- **Data fetching/state:** TanStack Query (server state + polling for jobs), Zustand for local UI state.
- **Forms/validation:** React Hook Form + **Zod** (Zod schemas are shared via `packages/core-ts` and must mirror the Python pydantic models 1:1).

### 3.2 Compute / analytical engine
- **Language: Python** (numpy, scipy, pandas, **lmoments3**, statsmodels for trend tests). Reuses the WSC engine investment and guarantees convergence with the streamflow app. **Do not reimplement the numerics in TypeScript.**
- **Hosting (default): Vercel Python Serverless Functions**, in a **top-level `/api/*.py`** directory (separate from Next's `app/api/**/route.ts` — see §3.6 for the mixed-runtime gotcha). 
- **Honest Vercel constraints — design around these, don't fight them:**
  - **Function duration** is limited (verify current Hobby/Pro limits; enable **Fluid Compute** + extend `maxDuration` on Pro). Never assume an unbounded runtime → hence the QStash job pattern in §2.5.
  - **Package size:** numpy+scipy+pandas is large (unzipped function budget ~250 MB — verify). Keep the engine function lean; import only what's needed; consider `scipy` submodule imports; if size becomes a wall, see the escape hatch below.
  - **Read-only FS** except `/tmp`. No writing to bundled files at runtime.
- **Escape hatch (design for it from day one):** the engine is a **self-contained package behind a small HTTP contract** (§3.5). If Vercel Python packaging/duration proves painful at scale, lift the *same* package to an always-on service (Railway/Render/Fly) with **zero contract change**. Keep the contract clean so compute location is swappable. Default stays Vercel per the deployment target.
- **Orchestration:** Next.js Route Handlers (Node) own auth, CRUD, job enqueue, and calling the engine. The engine functions are pure compute — no auth, no DB writes of business logic beyond result rows (or better: engine returns results, Node persists them).

### 3.3 Data & storage (Vercel-native)
- **Vercel Postgres (Neon)** — relational store: users, projects, dams, sites, stations, data_pulls (provenance), analyses, results, jobs, audit_log. ORM: **Drizzle** (light, TS-first, great migrations) or Prisma. **Recommendation: Drizzle.**
- **Vercel Blob** — generated exports (.docx/.pdf/.xlsx/model files) and cached raw series (parquet/CSV) too large for rows.
- **Vercel KV (Upstash Redis)** — cache ECCC API responses (keyed by collection+station+period+params), rate-limit outbound ECCC calls, and hold job status.
- **QStash (Upstash)** — durable queue for async compute with callbacks (§2.5).
- **Static reference data** — station catalog + regional pooling groups bundled as read-only parquet/JSON, or seeded into Postgres. (SQLite static catalog works read-only but Postgres is cleaner here.)

### 3.4 Auth
- **Auth.js (NextAuth)** with email/OAuth, or **Clerk** for speed. (Firebase Auth is a known alternative from prior projects, but Postgres-native session/user rows keep provenance in one store — prefer Auth.js.)

### 3.5 Engine HTTP contract (make compute swappable)
All engine endpoints are stateless `POST` with JSON in/out. Types mirror `packages/core-ts` (Zod) and `packages/core-engine` (pydantic). Seeded for reproducibility. Examples:

```
POST /api/engine/pfa
  in:  { series:[{year,value}], durations:[...], distributions:["gev","lp3",...],
         methods:["lmom","mle"], returnPeriods:[2,...,10000],
         bootstrap:{ n:2000, ci:0.90, seed:42 }, intervalCorrection:{ apply:true, factor:1.13 } }
  out: { fits:[{dist,method,params,gof:{ad,ks,ppcc}}],
         quantiles:[{dist,method,T,estimate,ciLow,ciHigh}],
         idf:{ durations, returnPeriods, intensities }, lmomentRatios:{...}, diagnostics:{...},
         engineVersion:"x.y.z" }

POST /api/engine/pmp        (Hershfield: mean, sd, n, duration, adjustments → PMP depth + steps)   [P2]
POST /api/engine/design-storm  (IDF + pattern → hyetograph + model-forcing payloads)               [P2]
POST /api/engine/wind       (annual-max wind → Gumbel quantiles; rose stats)                        [P2]
POST /api/engine/fetch-wave (reservoir polygon + direction + wind → effective fetch, Hs, Tp)        [P2]
POST /api/engine/freeboard  (Hs, Tp, geometry, roughness → runup, setup, freeboard table)           [P2]
POST /api/engine/qc         (series → infilling / homogeneity / trend results)                       [MVP]
```

Every response includes `engineVersion`; Node stamps `appVersion` + inputs hash when persisting.

### 3.6 Mixed-runtime gotcha (must handle correctly)
Next.js Node route handlers live in `app/api/**/route.ts`. Python serverless functions live in a **top-level `/api/**/*.py`** directory with a Vercel `functions`/builder config. Keep the two namespaces distinct to avoid collisions. Document the `vercel.json` (runtimes, `maxDuration`, memory) and the Python `requirements.txt` in the repo README. If co-location proves fiddly, deploy the Python engine as a **separate Vercel project** (still Vercel) behind the same contract.

### 3.7 Reporting/export generation
- **.docx** — server-side via `docx` (JS) or a Python route using `python-docx`; template-driven (methodology text + tables + embedded figures).
- **.xlsx** — `exceljs` (JS) or `openpyxl` (Python); multi-sheet (Raw / Calcs / Results / Provenance).
- **.pdf** — render the report route to PDF via **Puppeteer + `@sparticuz/chromium`** on Vercel, or generate from the docx. Verify chromium-on-Vercel setup.
- **Figures** — Plotly `toImage` (client) embedded into exports, or server-render figures in the Python engine (matplotlib) for the docx/pdf. Prefer one figure pipeline; matplotlib server-side is most reproducible for stamped reports.

### 3.8 Testing / CI / observability
- **Python engine:** pytest + **golden-value tests** against published references (§6). This is the credibility backbone.
- **TS:** Vitest (unit), Playwright (E2E flows).
- **Contract tests:** Zod ↔ pydantic parity checks so the two type systems never drift.
- **CI/CD:** GitHub + Vercel preview deployments on PRs.
- **Observability:** Vercel logs + **Sentry** (frontend + functions).
- **Monorepo tooling (later, for WSC merge):** pnpm workspaces + Turborepo.

### 3.9 Repo structure (target)

```
hydroclime/
├─ app/
│  ├─ (app)/                      # authed UI
│  │  ├─ dashboard/
│  │  ├─ projects/[id]/           # project shell: overview, stations, data, qa, analyses, compare, report
│  │  └─ analyze/                 # standalone analyses
│  ├─ api/                        # Node route handlers: auth, CRUD, jobs enqueue/status, engine proxy
│  └─ layout.tsx
├─ api/                           # Vercel PYTHON functions (engine): pfa.py, pmp.py, wind.py, ...
├─ packages/
│  ├─ core-engine/                # Python numerical core (distributions, L-moments, bootstrap, GOF) — mirrors WSC
│  ├─ core-ts/                    # shared TS types + Zod schemas + provenance model
│  └─ ui/                         # shared React: StationMap, IdfChart, FrequencyPlot, DataTable
├─ lib/                           # db (drizzle), kv, blob, qstash, eccc-client, auth
├─ drizzle/                       # schema + migrations
├─ tests/                         # pytest golden values + vitest + playwright
├─ reference-data/                # station catalog, pooling groups (parquet/json)
├─ vercel.json                    # python runtime, maxDuration, memory, fluid compute
├─ requirements.txt               # engine deps
└─ README.md                      # setup, env vars, endpoint-verification checklist, deploy steps
```

---

## 4. Design System (brief)

Professional/technical aesthetic — data-dense but clean, calm, and print-friendly (reports must look right in .docx/.pdf).

- **Type:** one humanist sans for UI (Inter/IBM Plex Sans); tabular figures for all numeric tables; a mono (JetBrains Mono / IBM Plex Mono) for parameters, IDs, and code-like values.
- **Color:** neutral slate/gray base; a single professional accent (deep blue/teal — water-appropriate). Semantic: green=ok, amber=flagged (e.g. inhomogeneous record), red=error/stale. **All chart palettes colorblind-safe** (e.g. Okabe-Ito or ColorBrewer); never encode meaning by color alone.
- **Spacing/density:** compact tables (reviewers scan lots of numbers) but generous whitespace around figures.
- **Charts:** consistent conventions — return period on log axis, probability plots with standard plotting positions, CI bands as translucent fills, ECCC-published series as a distinct dashed reference. Every figure has title, axis labels with **units**, source caption, and a small provenance footer.
- **Print/report theme:** a dedicated print stylesheet + docx template with letterhead placeholder, figure/table numbering, and an auto-generated provenance appendix.
- **Accessibility:** WCAG 2.1 AA contrast, full keyboard nav, focus states, ARIA on the map and charts.
- **Units:** SI primary everywhere; optional display toggle; units always shown in headers and axes.

---

## 5. Data Schema

Postgres via Drizzle. The **provenance model is the crux** — every analysis result must be reconstructable. IDs are `uuid` (PK) unless noted; all tables have `created_at`, `updated_at`.

### 5.1 Core relational tables

**users** — `id, email, name, org_id?, role` (via Auth.js).
**organizations** *(optional)* — `id, name`.

**projects**
`id, user_id, org_id?, name, description, status ('draft'|'data_acquired'|'qa_complete'|'analyses_in_progress'|'report_ready'), app_version_created`.

**dams**
`id, project_id, name, owner, jurisdiction (default 'AB'), cda_consequence_category ('low'|'significant'|'high'|'very_high'|'extreme'|null), classification_notes`.

**sites**
`id, project_id, latitude, longitude, elevation_m, reservoir_polygon (geojson/jsonb, nullable), datum`.

**stations** — catalog + cached metadata
`id, source ('msc_geomet'|'datamart'|'bulk_csv'|'ahccd'|'eng_climate'), climate_id, wmo_id, station_name, province, latitude, longitude, elevation_m, first_year, last_year, record_length_years, available_collections (jsonb), raw_metadata (jsonb)`.
Index on `(latitude, longitude)` for spatial ranking; consider PostGIS if spatial queries grow.

**project_stations** — join (a project may use several)
`id, project_id, station_id, role ('primary'|'supporting'|'wind'|'comparison'), distance_km, elevation_diff_m`.

**data_pulls** — provenance of every ingestion (**never delete; append-only**)
`id, project_id?, station_id, source, endpoint_url, collection, period_start, period_end, requested_at, completed_at, row_count, status, cache_key, blob_ref (raw data in Blob), params (jsonb), ogl_attribution (bool default true)`.

**series** *(optional if not storing rows in Postgres)* — either store observations here or reference `data_pulls.blob_ref`. If stored: `id, data_pull_id, timestamp, element ('precip'|'tmax'|'tmin'|'wind_speed'|'wind_dir'|'snow_on_ground'|...), value, flag`. **Recommendation:** keep raw series in Blob (parquet), keep only derived/aggregated arrays needed for analyses in-row or in the analysis payload.

**analyses** — polymorphic across modules
`id, project_id?, station_id?, type ('pfa'|'pmp'|'design_storm'|'wind'|'freeboard'|'snowmelt'|'qc'|'regional'), name, status ('queued'|'running'|'done'|'stale'|'error'), inputs (jsonb), input_hash, engine_version, app_version, created_by`.
`input_hash` = deterministic hash of `inputs` (+ upstream `data_pull` ids) → enables cache hits and staleness detection.

**analysis_results**
`id, analysis_id, results (jsonb), figures (jsonb: [{name, blob_ref}]), seed, computed_at, engine_version`.
Result JSON shapes follow the §3.5 contract outputs (typed in `core-ts`/pydantic).

**distributions_fitted** *(denormalized convenience for PFA/wind, optional)*
`id, analysis_id, distribution, method, parameters (jsonb), gof (jsonb), duration_label?`.

**report_documents**
`id, project_id, format ('docx'|'pdf'|'xlsx'|'model_forcing'), blob_ref, sections (jsonb), generated_at, app_version, engine_version`.

**jobs** — async compute tracking (also mirrored in KV for fast polling)
`id, analysis_id?, type, status ('queued'|'running'|'done'|'error'), qstash_message_id, payload_ref, error, started_at, finished_at`.

**audit_log** — append-only
`id, user_id, project_id?, action, entity, entity_id, metadata (jsonb), at`.

### 5.2 Provenance rule (enforce in code)
When persisting any `analysis_results`, the row **must** be linkable to: the `station(s)` (Climate/WMO ID), the originating `data_pulls` (with `requested_at`, `period`, `endpoint`), the `method` + `distribution` + `parameters`, the `seed`, and both `engine_version` and `app_version`. The provenance appendix in exports is generated directly from this chain. No result may be exported without a complete chain.

### 5.3 Caching schema (KV)
- ECCC response cache: key `eccc:{source}:{collection}:{climate_id}:{period}:{paramsHash}` → value = Blob ref + fetched_at + TTL. Respect source freshness; normals/AHCCD long TTL, recent daily short TTL.
- Rate-limit: sliding-window counters per outbound host.
- Job status mirror: `job:{id}` → status JSON for fast client polling.

### 5.4 Blob layout
```
raw/{station_id}/{collection}/{period}.parquet        # cached ECCC series
figures/{analysis_id}/{figure_name}.png               # report figures
exports/{project_id}/{report_id}.{docx|pdf|xlsx}       # generated deliverables
forcing/{analysis_id}/{model}.{dss|hms|inp|...}        # model-ready hyetographs
```

### 5.5 Reference/static data
- **station_catalog** (seed): full ECCC station list with coords/elev/record span for fast offline ranking (refreshable job).
- **regional_pooling_groups** (P2): predefined homogeneous regions / pooling metadata for regional FFA.
- **eccc_idf_reference**: parsed ECCC-published IDF per station (durations, return periods, intensities) for the comparison panel. Store parsed values + source file ref + version.
- **arf_curves / temporal_patterns**: ARF relationships and standard storm temporal distributions (Chicago/Huff/SCS/AES) as parameter tables.

### 5.6 Shared types
`packages/core-ts` holds Zod schemas for every §3.5 payload; `packages/core-engine` holds the pydantic equivalents. A CI contract test asserts they stay in sync. Persisted `inputs`/`results` JSON validate against these on write.

---

## 6. Implementation Plan

Build milestone-by-milestone. Each milestone lists **scope**, **deliverables**, and **acceptance criteria** (which include tests). Do not start a milestone before the previous one's acceptance criteria pass. **Golden-value validation is non-negotiable** for every analytical method — an engineer will stamp these numbers.

### M0 — Foundation
**Scope:** Repo scaffold (§3.9); Next.js + TS + Tailwind + shadcn/ui; Vercel project + preview deploys; Drizzle + Postgres + initial migration (users, projects, dams, sites); Auth.js; app shell + project CRUD; Blob/KV/QStash wired; `vercel.json` with Python runtime + `maxDuration` + Fluid Compute; a trivial `/api/engine/ping.py` proving the Python runtime deploys.
**Deliverables:** deployed skeleton; create/list/open/delete project; env-var + endpoint-verification checklist in README.
**Acceptance:** green Vercel deploy; auth works; project CRUD persists; Python function returns from production; CI runs lint + type + empty test suites.

### M1 — Data acquisition (the MVP centrepiece)
**Scope:** ECCC client lib (`lib/eccc-client`) for MSC GeoMet OGC Features (daily/hourly/monthly/normals/AHCCD), Datamart bulk, and legacy bulk CSV fallback — **verify endpoints first**. Station catalog seed + spatial ranking (distance/record-length/elevation-diff). Station finder map (pin + candidate list + ranking). Availability panel (timeline + missing-data heatmap). Pull flow with KV caching, rate-limit, retry/backoff, and **`data_pulls` provenance capture**. Raw preview. OGL attribution stored per pull.
**Deliverables:** click site → ranked stations → pull → cached, provenance-stamped raw data with availability viz.
**Acceptance:** ranking correct on known foothills examples; identical repeat pull hits cache; every pull writes a complete `data_pulls` row; graceful handling of missing/partial records; endpoint verification documented.

### M2 — QA/QC & preprocessing
**Scope:** infilling (normal-ratio, IDW, regression) with logged method + neighbours; homogeneity/trend (Pettitt, SNHT, Mann-Kendall + Sen) with flags; sub-daily/multi-day aggregation (1/2/6/12/24/48/72 h maxima) with **fixed→true interval correction** (toggle + configurable factor, default ≈1.13).
**Deliverables:** QA/QC tab producing cleaned, aggregated, annotated series ready for PFA.
**Acceptance:** trend/homogeneity tests match reference implementations on canonical datasets (golden values); interval correction applied and clearly surfaced; infilled points flagged and logged; inhomogeneous records visibly flagged with AHCCD suggestion.

### M3 — Precipitation Frequency Analysis + IDF *(reuses shared freq engine)*
**Scope:** `core-engine` distributions (Gumbel/GEV/LP3/GLO/PE3) via L-moments/MOM/MLE — **mirror the WSC engine exactly**; AMS + PDS extraction; GOF (AD/KS/PPCC) + L-moment ratio diagram; quantiles 2→10,000 yr with **seeded bootstrap CIs**; IDF generation; ARF; **ECCC-published-IDF comparison panel**; Plotly IDF (log-log + CI bands) and probability plots. Route heavy multi-duration bootstraps through the QStash job pattern.
**Deliverables:** full PFA → IDF for a station, overlaid on ECCC IDF, with CIs and GOF.
**Acceptance:** **golden-value tests pass** — fitted parameters and quantiles match hand-calculated/published reference values within tolerance; bootstrap reproducible under fixed seed; IDF vs ECCC overlay renders; results carry full provenance + versions.

### M4 — Reporting & Export  →  **MVP SHIP POINT**
**Scope:** report builder (select sections/figures/tables); `.docx` + `.pdf` + `.xlsx` generation; figure pipeline (prefer server-side matplotlib for reproducibility); **provenance appendix** + OGL attribution + professional-responsibility disclaimer auto-included; model-forcing export scaffold.
**Deliverables:** one-click DSR-ready PFA/IDF report section + Excel workbook (Raw/Calcs/Results/Provenance) + figures.
**Acceptance:** exports open cleanly in Word/Excel/PDF readers; every exported number traces to source+method+version; appendix + attribution + disclaimer present; figures have units, captions, provenance footers.
**→ At M4 the tool already replaces the most tedious part of every study. Ship, gather feedback, then Phase 2.**

### M5 — PMP (Hershfield) + design storms  *(Phase 2)*
**Scope:** Hershfield PMP with all adjustments (Km(mean,duration), sample-size corrections for mean & sd, fixed→true interval, point→area); DAD analysis; seasonal PMP; moisture-maximization stubs. Design storms: Chicago/alt-block/Huff/SCS/AES + nested-from-IDF + PMP hyetograph; export HEC-HMS/RAS/SWMM forcing.
**Acceptance:** Hershfield reproduces WMO-1045 worked examples (golden values); hyetographs sum to correct depth; exported forcing loads in target models; every adjustment factor logged + shown.

### M6 — Wind, wave & freeboard  *(Phase 2)*
**Scope:** extreme wind frequency (Gumbel, annual-max hourly + gust); wind rose + directional; overland→overwater conversion; **effective fetch from reservoir polygon** (draw on map → Saville); wave (Hs, Tp via CEM/SPM + Bretschneider); wind setup + runup (slope + riprap roughness); **CDA-aligned freeboard summary table**.
**Acceptance:** fetch geometry correct on test polygons; wave/runup/setup match CEM worked examples (golden values); freeboard table matches a hand calc; directional critical-case selection correct.

### M7 — Snowmelt / rain-on-snow + regional FFA + ARF refinement  *(Phase 2)*
**Scope:** SWE from snow-on-ground; degree-day/temperature-index melt; rain-on-snow antecedent scenario builder. Regional frequency analysis (L-moment/index-flood, discordancy, Hosking-Wallis H) using pooling groups. Refined ARF.
**Acceptance:** melt reproduces a reference degree-day example; regional H/discordancy match Hosking-Wallis reference datasets; regional estimates appear in the compare panel.

### M8 — Classification-scoping engine + hardening  *(Phase 2)*
**Scope:** CDA consequence-class → required-analyses + IDF/EDF/PMP targets, layered with Alberta Directive; project scoping checklist driving the UI. Full golden-value validation suite; docs; performance pass; error states; accessibility audit.
**Acceptance:** correct target/analysis set for each consequence category vs CDA guidance; scoping checklist reflects gaps; full golden-value suite green; WCAG AA audit passes.

### Phase 3 (post-M8)
Deterministic PMP / storm transposition (moisture maximization + transposition); gridded/reanalysis data; **monorepo extraction + WSC merge** (pnpm workspaces + Turborepo; lift `core-engine` into a shared package consumed by both apps with zero behavioural change; contract tests guard parity).

### 6.1 Cross-cutting validation strategy
- **Golden values** for every method (§6 references) live in `tests/` with documented sources and tolerances.
- **Reproducibility test:** a saved project re-executes to identical results (seeded).
- **Zod↔pydantic parity** test in CI.
- **Provenance completeness** test: no `analysis_results` row/export without a full chain.

---

## 7. Methods & References (implement against primary sources; build golden values from them)

Claude Code: treat these as the authority for formulas. **Verify each formula against the cited primary source during implementation** and capture a worked example as a golden-value test. Do not approximate.

- **L-moments & frequency analysis:** Hosking & Wallis, *Regional Frequency Analysis: An Approach Based on L-Moments* (1997). Distributions: Gumbel/EV1, GEV, GLO, PE3, LP3. Plotting positions + probability plots per standard practice.
- **Statistical PMP (Hershfield):** Hershfield (1961, 1965); **WMO, *Manual on Estimation of Probable Maximum Precipitation (PMP)*, WMO-No. 1045 (2009)** — Km vs mean & duration, sample-size adjustments for mean and standard deviation, fixed-to-true interval factors (single-interval ≈1.13), point-to-area (ARF) reduction, DAD.
- **Areal reduction factors:** WMO-1045; US Weather Bureau TP-40 / NOAA Atlas relationships; use regional ARF where available and document the choice.
- **Design storm temporal patterns:** Chicago (Keifer & Chu, 1957); Huff quartile distributions; NRCS/SCS Type curves; AES/ECCC distributions.
- **Extreme wind:** Gumbel/EV1 on annual maxima (hourly + gust); overland-to-overwater conversion.
- **Fetch & waves:** USACE **Coastal Engineering Manual, EM 1110-2-1100**; *Shore Protection Manual*; Bretschneider wave prediction; **Saville effective-fetch** method for irregular reservoirs; wind setup (e.g. Zuider Zee equation); runup (Hunt / TAW / CEM formulations, with slope + roughness).
- **Snowmelt:** degree-day / temperature-index method; rain-on-snow antecedent scenarios (see USACE snow hydrology guidance).
- **Dam safety framework:** **CDA *Dam Safety Guidelines* (2007, rev. 2013)** and Technical Bulletins (Hydrotechnical) for consequence classification and IDF/EDF/PMF targets; **Alberta *Dam and Canal Safety Directive*** for provincial requirements.
- **Trend/homogeneity:** Mann-Kendall + Sen's slope; Pettitt; SNHT (Alexandersson).
- **Data source:** ECCC/MSC — MSC GeoMet (OGC API – Features), MSC Datamart, ECCC Engineering Climate Datasets (IDF), AHCCD homogenized data. **Open Government Licence – Canada** governs use; attribute in all outputs.

---

## 8. Deployment (Vercel)

1. **Provision:** Vercel project (link GitHub repo); Vercel Postgres (Neon); Vercel Blob; Vercel KV (Upstash); QStash (Upstash) token.
2. **Env vars:** `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `KV_*`, `QSTASH_TOKEN`/`QSTASH_CURRENT_SIGNING_KEY`, auth secrets/provider keys, `SENTRY_DSN`, `APP_VERSION` (inject from git SHA/tag → part of provenance).
3. **Python runtime:** `vercel.json` sets the Python function runtime, `maxDuration` (max the plan allows), memory, and enables **Fluid Compute**. `requirements.txt` pins engine deps; keep lean for the size budget.
4. **Migrations:** run Drizzle migrations on deploy; seed station catalog + reference tables (one-off job).
5. **Cron (optional):** Vercel Cron to refresh the station catalog and re-warm long-TTL caches (normals/AHCCD).
6. **Verify-at-build checklist (README):** confirm current MSC GeoMet collection names/paths, legacy bulk CSV availability, Vercel function duration limits, and Python package size budget **before** relying on them.
7. **Escape hatch:** if Python-on-Vercel packaging/duration bites, redeploy `packages/core-engine` as a separate service (Railway/Render/Fly or a second Vercel project) behind the identical §3.5 contract — no frontend change.

---

## 9. Cross-cutting requirements (apply everywhere)

- **Reproducibility first:** seed all stochastic steps; stamp `engine_version` + `app_version` into every result and export.
- **Provenance always:** no exported number without a complete source→method→version chain (§5.2).
- **OGL-Canada attribution** + **professional-responsibility disclaimer** ("This tool assists analysis; results must be reviewed and stamped by a qualified engineer. Not a substitute for engineering judgment.") in every export.
- **Endpoint verification** documented before use.
- **SI units** primary, shown in all headers/axes; sign/interval conventions stated in outputs.
- **Standalone usability:** every module runnable without a full DSR project.
- **Never silently serve stale results:** upstream changes mark dependents `stale` and prompt re-run.
