# climatePrep

A web application for Canadian water-resources engineers to acquire ECCC/MSC
climate data and run the meteorological analyses required for **Dam Safety
Reviews (DSR)** — precipitation frequency, IDF, PMP, design storms, extreme
wind, wave/freeboard, and snowmelt — with a defensible, reproducible audit
trail suitable for P.Eng.-stamped reports.

See [`HydroClime-SPEC.md`](HydroClime-SPEC.md) for the full specification. The
numerical core mirrors the WSC flood-frequency engine
([adilch/WSCprep](https://github.com/adilch/WSCprep)) so the two can later merge
with zero behavioural drift.

> **Status: M6 (wind, wave & freeboard) complete.** Engine 0.4.0 adds
> extreme wind (Gumbel on annual-max hourly wind or daily gust, via the same
> shared frequency core as PFA), a 16-sector wind rose, overland→overwater
> conversion (SPM R_L curve, overridable), **Saville effective fetch** from
> a reservoir polygon drawn on the map (15 radials at ±42°, golden-tested on
> closed-form circle + hand-computed rectangle geometries), SMB/Bretschneider
> (deep + depth-limited) and SPM-84 wave hindcasting, Zuider Zee wind setup,
> Hunt + TAW 2002 runup with riprap roughness presets, a directional scan
> that selects the governing direction, and the CDA-aligned freeboard
> component table (runup + setup + analyst allowances, every input echoed).
> All formula implementations hand-verified in golden tests.
>
> Earlier — **M5**:
> Engine 0.3.0 adds **Hershfield statistical PMP** (WMO-1045 Chapter 4) with
> the full adjustment chain — outlier (Figs 4.2/4.3), sample size (Fig 4.4),
> Km(mean, duration) (Fig 4.1), fixed→true interval (Fig 4.5/Weiss), and
> point→area (Fig 4.7) — every factor logged with its source, every factor
> overridable, golden-tested against the manual's own Table 4.1 worked
> example (two internal inconsistencies in the manual's 1-h column are
> documented in the tests). Plus DAD tables, seasonal distribution, and
> **design storms**: Chicago (Keifer-Chu, analytic IDF fit), alternating
> block (nested, exact telescoping), SCS Type II, and the PMP hyetograph
> (WMO-1045 Fig 4.8); model forcing exports as native SWMM .dat and HEC
> paste-ready CSV. The Analyses tab now has PFA/PMP/Design-storm sub-modules.
> Digitized figure curves are approximations anchored to the manual's worked
> example — the UI carries the verification notice. Huff quartiles + AES
> distributions and DSS export await verified tables (Phase-2 continuation).
>
> Earlier — **M4 (MVP)**:
> One click produces the DSR-ready deliverables (spec K1–K6): a **.docx**
> report section (methodology generated from the actual analysis parameters,
> AMS/fits/quantile tables, embedded server-rendered matplotlib figures with
> numbered captions, ECCC comparison), a print-quality **.pdf** (same content
> model, rendered via headless chromium), and an **.xlsx** workbook
> (Raw / Calcs / Results / Comparison / Provenance / Attribution). Every
> export auto-includes the provenance appendix (station IDs, pull endpoints +
> timestamps, input hashes, seed, engine + app versions), OGL–Canada
> attribution, and the professional-responsibility disclaimer — no export
> without a complete chain. Compare tab contrasts site-specific vs published
> IDF with Δ%. Pipeline: M1 acquisition → M2 QA/QC (interval-corrected AMS)
> → M3 PFA/IDF (WSC-mirrored engine, seeded bootstrap) → M4 report.
> Phase 2 (PMP, design storms, wind/wave, freeboard, scoping) follows.

---

## Architecture (M0)

| Layer | Tech | Notes |
|---|---|---|
| Web | Next.js 16 (App Router) · React 19 · Tailwind 4 · shadcn-style UI | `web/` |
| Data | Drizzle ORM · **PGlite** (embedded Postgres, local) | swaps to Neon/Vercel Postgres on deploy, same SQL |
| Auth | Auth.js v5 (dev Credentials + JWT) | real OAuth/email providers slot in later |
| Compute engine | FastAPI (Python 3.12) · numpy/scipy/lmoments3 (M3) | separate service behind a swappable HTTP contract (spec §3.5) |
| Shared packages | `packages/core-ts` (Zod + provenance) · `packages/ui` · `packages/core-engine` (Python core) | extraction-ready monorepo (npm workspaces) |
| Storage stubs | local Blob (filesystem) · KV (in-memory) · queue (inline) | mirror Vercel Blob / Upstash KV / QStash surfaces |

Local-first by design: no Docker, no cloud accounts required to run.

---

## Prerequisites

- **Node.js ≥ 20** (tested on 24)
- **Python 3.12** for the engine — the scientific stack (numpy/scipy/lmoments3,
  added at M3) may lack wheels on newer Python. [`uv`](https://docs.astral.sh/uv/)
  makes this a one-liner: `uv python install 3.12`.

## Setup

```bash
# 1. Install JS workspace deps
npm install

# 2. Configure env (dev defaults are fine)
cp web/.env.example web/.env.local
#   AUTH_SECRET is required — generate one:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 3. Create + seed the local database (PGlite)
npm run db:migrate --workspace web
npm run db:seed --workspace web             # seeds dev@climateprep.local
npm run db:seed-stations --workspace web    # ECCC station catalog (~8 500, one request)
#   (optionally: -- --province AB for a faster provincial seed)

# 4. Set up the Python engine (isolated 3.12 venv)
cd engine
uv venv --python 3.12 .venv
uv pip install --python .venv -r requirements.txt
cd ..
```

## Run (two processes)

```bash
# Terminal 1 — compute engine (FastAPI on :8000)
engine/.venv/Scripts/uvicorn app.main:app --reload --port 8000 --app-dir engine
#   (macOS/Linux: engine/.venv/bin/uvicorn ...)

# Terminal 2 — web app (Next.js on :3000)
npm run dev --workspace web
```

Open http://localhost:3000 → you're bounced to `/signin`. The dev credentials
are pre-filled (`dev@climateprep.local` / `climateprep`). After sign-in the
top bar shows a live **engine `<version>`** badge (green) proving the Python
service is reachable through the proxy.

## Scripts

| Command | What |
|---|---|
| `npm run dev` | Next dev server |
| `npm run build` | Production build |
| `npm run test --workspace web` | Vitest unit tests |
| `npm run typecheck --workspace web` | `tsc --noEmit` |
| `npm run lint --workspace web` | ESLint |
| `npm run e2e --workspace web` | Playwright smoke tests (needs browsers: `npx playwright install`) |
| `npm run db:generate --workspace web` | Generate a Drizzle migration from the schema |
| `npm run db:migrate --workspace web` | Apply migrations to PGlite |
| `npm run db:seed --workspace web` | Seed the dev user |
| `npm run db:seed-stations --workspace web` | Seed/refresh the ECCC station catalog |
| `engine` pytest | `engine/.venv/Scripts/python -m pytest engine` |

---

## Endpoint-verification checklist (verified 2026-07-04)

MSC has been migrating products; re-verify before major releases (spec §1.5, §8):

- [x] **MSC GeoMet OGC API – Features** base `https://api.weather.gc.ca` — live.
      Confirmed collections: `climate-stations`, `climate-daily`,
      `climate-hourly`, `climate-monthly`, `climate-normals`, `ahccd-stations`,
      `ahccd-annual`, `ahccd-seasonal`, `ahccd-monthly`, `ahccd-trends`.
- [x] Query features confirmed: property filters (`CLIMATE_IDENTIFIER`,
      `PROV_STATE_TERR_CODE`), `datetime` ranges, `bbox`, `sortby`,
      `limit` up to 10 000 + `offset` paging.
      Gotchas: `climate-stations` properties `LATITUDE`/`LONGITUDE` are scaled
      integers — use the GeoJSON geometry (decimal degrees); `ELEVATION` is a
      string (m); AHCCD collections use bilingual snake_case field names
      (`total_precip__precip_totale`), unlike the UPPER_CASE climate-* fields.
- [x] **MSC Datamart** `https://dd.weather.gc.ca` — **restructured**: date-based
      directories (`YYYYMMDD/`, `today/`) for real-time products only; the old
      static `climate/` archive tree is gone. **Not suitable for the climate
      archive** — use GeoMet (primary) and legacy bulk CSV (fallback).
- [x] **Legacy bulk CSV** `climate.weather.gc.ca/climate_data/bulk_data_e.html`
      — live (HTTP 200, CSV). Note: takes the numeric `stationID` (= GeoMet
      `STN_ID`), not the climate identifier.
- [x] **Engineering Climate Datasets** (published IDF) —
      `https://collaboration.cmc.ec.gc.ca/cmc/climate/Engineer_Climate/IDF/`
      (per-province files; ingested in M3 for the comparison panel).
- [x] **OGL – Canada** attribution stored on every `data_pulls` row and
      required in all exports.
- [ ] Vercel function duration + Python package-size budget (verify when the
      engine is co-located on Vercel — currently a separate service).

---

## Deploy (Vercel — later)

1. The web app deploys natively on Vercel (`vercel.json` sets the build).
2. Swap local drivers for cloud: `DATABASE_URL` (Neon/Vercel Postgres),
   Vercel Blob, Vercel KV, QStash — the `web/lib` interfaces are drop-in.
3. Deploy the **engine** either as Vercel Python functions (top-level `/api/*.py`
   + a `functions` block with the python runtime, `maxDuration`, memory, Fluid
   Compute) or as a standalone service (Railway/Render/Fly) — point `ENGINE_URL`
   at it. No frontend change (spec §3.2 escape hatch).
4. Inject `APP_VERSION` from the git SHA/tag — it's part of provenance.

See spec §8 for the full deployment runbook.

---

## Repo layout

```
climatePrep/
├─ web/                    # Next.js app (UI, Node route handlers, db, auth, storage stubs)
├─ engine/                 # FastAPI compute engine (Python 3.12)
├─ packages/
│  ├─ core-ts/             # shared Zod schemas + provenance model
│  ├─ ui/                  # shared React components
│  └─ core-engine/         # Python numerical core (mirrors WSC; M3)
├─ drizzle/migrations/     # generated SQL migrations
├─ .github/workflows/      # CI (web + engine)
└─ HydroClime-SPEC.md      # single source of truth
```
