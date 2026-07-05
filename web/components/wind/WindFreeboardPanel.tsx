"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Play, Trash2 } from "lucide-react";
import type {
  FetchWaveResponse,
  FreeboardResponse,
  WindResponse,
} from "@climateprep/core-ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BASE_LAYOUT, OKABE_ITO, PlotlyLazy } from "@/components/pfa/PlotlyLazy";
import type { FetchRay, ReservoirMapProps } from "./ReservoirMap";

const ReservoirMapLazy = dynamic<ReservoirMapProps>(
  () => import("./ReservoirMap"),
  { ssr: false, loading: () => <div className="h-[360px] rounded-lg border border-border bg-muted/40" /> },
);

/** Wind & freeboard module (spec F/G, M6). */

interface PullRow {
  pull: { id: string; collection: string; status: string; periodStart: string | null; periodEnd: string | null };
  station: { climateId: string; stationName: string };
}

interface WindRow {
  analysis: { id: string; name: string; type: string; inputHash: string; createdAt: string };
  result: { results: WindResponse | { fetchWave: FetchWaveResponse; freeboard: FreeboardResponse } };
  station: { stationName: string; climateId: string } | null;
}

const SECTORS = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];

export function WindFreeboardPanel({ projectId }: { projectId: string }) {
  const qcClient = useQueryClient();

  // ------------------------- wind extremes state -------------------------
  const [pullId, setPullId] = useState("");
  const [windSource, setWindSource] = useState<"hourly_wind" | "daily_gust">("hourly_wind");

  // ------------------------- freeboard state -----------------------------
  // Drawing uses a LOCAL draft (instant feedback, no per-click server calls);
  // the polygon is persisted once, on "Finish & save" (≥3 vertices).
  const [draft, setDraft] = useState<[number, number][] | null>(null);
  const drawing = draft !== null;
  const [showRays, setShowRays] = useState(true);
  const [directionDeg, setDirectionDeg] = useState("90");
  const [uLand, setULand] = useState("20");
  const [depth, setDepth] = useState("10");
  const [slope, setSlope] = useState("0.3333");
  const [gammaF, setGammaF] = useState("0.55");
  const [settlement, setSettlement] = useState("0.3");
  const [seiche, setSeiche] = useState("0.15");

  const pullsQuery = useQuery<{ pulls: PullRow[] }>({
    queryKey: ["pulls", projectId],
    queryFn: async () => (await fetch(`/api/pulls?projectId=${projectId}`)).json(),
  });
  const pulls = (pullsQuery.data?.pulls ?? []).filter((p) => p.pull.status === "complete");
  const eligible = pulls.filter((p) =>
    windSource === "hourly_wind"
      ? p.pull.collection === "climate-hourly"
      : p.pull.collection === "climate-daily",
  );

  const siteQuery = useQuery<{
    site: { latitude: number; longitude: number; reservoirPolygon: [number, number][] | null } | null;
  }>({
    queryKey: ["site", projectId],
    queryFn: async () => (await fetch(`/api/projects/${projectId}/site`)).json(),
  });
  const site = siteQuery.data?.site ?? null;
  const polygon = site?.reservoirPolygon ?? [];

  const analysesQuery = useQuery<{ analyses: WindRow[] }>({
    queryKey: ["wind-analyses", projectId],
    queryFn: async () => (await fetch(`/api/projects/${projectId}/wind`)).json(),
  });
  const windRows = analysesQuery.data?.analyses.filter((a) => a.analysis.type === "wind") ?? [];
  const fbRows = analysesQuery.data?.analyses.filter((a) => a.analysis.type === "freeboard") ?? [];
  const latestWind = windRows[0] ?? null;
  const latestFb = fbRows[0] ?? null;

  // Saville radials from the latest freeboard run, rendered on the map.
  const fetchRays: FetchRay[] = (() => {
    if (!latestFb || !showRays) return [];
    const f = (latestFb.result.results as { fetchWave: FetchWaveResponse })
      .fetchWave?.fetch as {
      directionDeg: number;
      radials: { angleDeg: number; fetchKm: number; weight: number }[];
    } | undefined;
    if (!f?.radials) return [];
    return f.radials.map((r) => ({
      bearingDeg: (f.directionDeg + r.angleDeg + 360) % 360,
      km: r.fetchKm,
      weight: r.weight,
      central: Math.abs(r.angleDeg) < 1e-9,
    }));
  })();

  const savePolygon = useMutation({
    mutationFn: async (next: [number, number][] | null) => {
      if (!site) throw new Error("set the site pin first (Stations tab)");
      const res = await fetch(`/api/projects/${projectId}/site`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: site.latitude,
          longitude: site.longitude,
          reservoirPolygon: next,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `polygon save failed (${res.status})`);
      }
    },
    onSuccess: () => {
      setDraft(null);
      qcClient.invalidateQueries({ queryKey: ["site", projectId] });
    },
  });

  const runWind = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/wind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "wind", pullId, source: windSource }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `failed (${res.status})`);
      return body;
    },
    onSuccess: () => qcClient.invalidateQueries({ queryKey: ["wind-analyses", projectId] }),
  });

  const runFreeboard = useMutation({
    mutationFn: async () => {
      const allowances: Record<string, number> = {};
      if (Number(settlement) > 0) allowances.settlement = Number(settlement);
      if (Number(seiche) > 0) allowances.seiche = Number(seiche);
      const res = await fetch(`/api/projects/${projectId}/wind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "freeboard",
          windTowardDeg: Number(directionDeg),
          uLandMs: Number(uLand),
          avgDepthM: Number(depth),
          slopeVPerH: Number(slope),
          gammaF: Number(gammaF),
          allowancesM: allowances,
          windAnalysisId: latestWind?.analysis.id ?? null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `failed (${res.status})`);
      return body;
    },
    onSuccess: () => qcClient.invalidateQueries({ queryKey: ["wind-analyses", projectId] }),
  });

  return (
    <div className="space-y-5">
      {/* ------------------------- wind extremes -------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Extreme wind (Gumbel on annual maxima)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-muted-foreground">Source</span>
              <select
                value={windSource}
                onChange={(e) => setWindSource(e.target.value as typeof windSource)}
                className="rounded-md border border-border bg-background px-2 py-2 text-sm"
              >
                <option value="hourly_wind">Hourly wind (climate-hourly)</option>
                <option value="daily_gust">Daily max gust (climate-daily)</option>
              </select>
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-muted-foreground">Pull</span>
              <select
                value={pullId}
                onChange={(e) => setPullId(e.target.value)}
                className="min-w-64 rounded-md border border-border bg-background px-2 py-2 text-sm"
              >
                <option value="">Select…</option>
                {eligible.map((p) => (
                  <option key={p.pull.id} value={p.pull.id}>
                    {p.station.stationName} ({p.station.climateId}) ·{" "}
                    {p.pull.periodStart?.slice(0, 4)}–{p.pull.periodEnd?.slice(0, 4)}
                  </option>
                ))}
              </select>
            </label>
            <Button onClick={() => runWind.mutate()} disabled={!pullId || runWind.isPending}>
              <Play className="h-4 w-4" />
              {runWind.isPending ? "Fitting…" : "Fit extremes"}
            </Button>
            {runWind.isError && (
              <span className="text-xs text-error">{(runWind.error as Error).message}</span>
            )}
          </div>
          {eligible.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No {windSource === "hourly_wind" ? "hourly" : "daily"} pulls yet —
              pull {windSource === "hourly_wind" ? "hourly" : "daily"} data in
              the Data tab for a station with wind records.
            </p>
          )}

          {latestWind && <WindResults row={latestWind} />}
        </CardContent>
      </Card>

      {/* ------------------------ reservoir & fetch ----------------------- */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Reservoir polygon &amp; freeboard</CardTitle>
          <div className="flex gap-2">
            {!drawing ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDraft([])}
                  disabled={!site}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {polygon.length >= 3 ? "Redraw polygon" : "Draw polygon"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => savePolygon.mutate(null)}
                  disabled={!polygon.length || savePolygon.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  onClick={() => savePolygon.mutate(draft)}
                  disabled={(draft?.length ?? 0) < 3 || savePolygon.isPending}
                >
                  {savePolygon.isPending
                    ? "Saving…"
                    : `Finish & save (${draft?.length ?? 0} pts)`}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDraft((d) => (d && d.length ? d.slice(0, -1) : d))}
                  disabled={(draft?.length ?? 0) === 0}
                >
                  Undo point
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!site ? (
            <p className="text-sm text-muted-foreground">
              Set the dam-site pin first (Stations tab).
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {drawing
                  ? `Click the map to add vertices along the reservoir shoreline — ${draft!.length} placed, ${Math.max(0, 3 - draft!.length)} more needed. Then "Finish & save".`
                  : polygon.length >= 3
                    ? `Reservoir polygon: ${polygon.length} vertices.`
                    : "Draw the reservoir outline to enable fetch computation."}
              </p>
              {savePolygon.isError && (
                <p className="text-xs text-error">
                  {(savePolygon.error as Error).message}
                </p>
              )}
              <ReservoirMapLazy
                site={site}
                polygon={draft ?? polygon}
                drawing={drawing}
                onAddVertex={(v) => setDraft((d) => [...(d ?? []), v])}
                fetchRays={fetchRays}
              />
              {latestFb && !drawing && (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={showRays}
                    onChange={(e) => setShowRays(e.target.checked)}
                    className="h-3.5 w-3.5 accent-accent"
                  />
                  Show Saville fetch radials (from the latest run — central ray
                  solid, side rays weighted by cos²α)
                </label>
              )}

              <div className="flex flex-wrap items-end gap-3">
                <label className="block text-xs">
                  <span className="mb-1 block font-medium text-muted-foreground">
                    Wind toward
                  </span>
                  <select
                    value={directionDeg}
                    onChange={(e) => setDirectionDeg(e.target.value)}
                    className="rounded-md border border-border bg-background px-2 py-2 text-sm"
                  >
                    {SECTORS.map((s, i) => (
                      <option key={s} value={i * 22.5}>
                        {s} ({(i * 22.5).toFixed(1)}°)
                      </option>
                    ))}
                  </select>
                </label>
                <NumInput label="U land (m/s)" value={uLand} set={setULand} w="w-24" />
                <NumInput label="Avg depth (m)" value={depth} set={setDepth} w="w-24" />
                <NumInput label="Slope tanα (1V:3H=0.333)" value={slope} set={setSlope} w="w-36" />
                <label className="block text-xs">
                  <span className="mb-1 block font-medium text-muted-foreground">
                    Roughness γf
                  </span>
                  <select
                    value={gammaF}
                    onChange={(e) => setGammaF(e.target.value)}
                    className="rounded-md border border-border bg-background px-2 py-2 text-sm"
                  >
                    <option value="0.55">Riprap (0.55)</option>
                    <option value="0.60">Rock, one layer (0.60)</option>
                    <option value="1.0">Smooth / grass (1.0)</option>
                  </select>
                </label>
                <NumInput label="Settlement (m)" value={settlement} set={setSettlement} w="w-24" />
                <NumInput label="Seiche (m)" value={seiche} set={setSeiche} w="w-24" />
                <Button
                  onClick={() => runFreeboard.mutate()}
                  disabled={polygon.length < 3 || runFreeboard.isPending}
                >
                  <Play className="h-4 w-4" />
                  {runFreeboard.isPending ? "Computing…" : "Compute freeboard"}
                </Button>
                {runFreeboard.isError && (
                  <span className="text-xs text-error">
                    {(runFreeboard.error as Error).message}
                  </span>
                )}
              </div>
            </>
          )}

          {latestFb && <FreeboardResults row={latestFb} />}
        </CardContent>
      </Card>
    </div>
  );
}

function NumInput({
  label, value, set, w,
}: { label: string; value: string; set: (v: string) => void; w: string }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-medium text-muted-foreground">{label}</span>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(e) => set(e.target.value)}
        className={`${w} rounded-md border border-border bg-background px-2 py-2 text-sm`}
      />
    </label>
  );
}

/* ------------------------------ results ---------------------------------- */

function WindResults({ row }: { row: WindRow }) {
  const r = row.result.results as WindResponse;
  return (
    <div className="space-y-3">
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            {r.label} — {row.station?.stationName} · n={r.n} · Gumbel loc=
            {r.gumbelParams.loc?.toFixed(1)} scale={r.gumbelParams.scale?.toFixed(1)}
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1 pr-2 font-medium">T (yr)</th>
                <th className="px-2 py-1 text-right font-medium">km/h</th>
                <th className="px-2 py-1 text-right font-medium">m/s</th>
                <th className="px-2 py-1 text-right font-medium">90% CI (km/h)</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {r.quantiles.map((q) => (
                <tr key={q.returnPeriod} className="border-b border-border/40">
                  <td className="py-0.5 pr-2">{q.returnPeriod}</td>
                  <td className="px-2 py-0.5 text-right font-semibold">
                    {q.speedKmh.toFixed(1)}
                  </td>
                  <td className="px-2 py-0.5 text-right">{q.speedMs.toFixed(1)}</td>
                  <td className="px-2 py-0.5 text-right text-muted-foreground">
                    {q.ciLowerKmh !== null && q.ciUpperKmh !== null
                      ? `${q.ciLowerKmh.toFixed(0)}–${q.ciUpperKmh.toFixed(0)}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {r.rose && <RoseChart rose={r.rose as unknown as RoseData} />}
      </div>
      <p className="font-mono text-[11px] text-muted-foreground">
        seed {r.seed} · engine {r.engineVersion} · input {row.analysis.inputHash.slice(0, 12)}
      </p>
    </div>
  );
}

interface RoseData {
  sectors: { sector: string; centerDeg: number; frequencyPct: number; meanKmh: number }[];
  prevailingSector: string;
  strongestSector: string;
  nObservations: number;
}

function RoseChart({ rose }: { rose: RoseData }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        Wind rose — prevailing {rose.prevailingSector}, strongest{" "}
        {rose.strongestSector} ({rose.nObservations.toLocaleString()} obs)
      </p>
      <PlotlyLazy
        data={[
          {
            type: "barpolar",
            r: rose.sectors.map((s) => s.frequencyPct),
            theta: rose.sectors.map((s) => s.centerDeg),
            width: new Array(rose.sectors.length).fill(20),
            marker: { color: OKABE_ITO[0], opacity: 0.8 },
            name: "frequency %",
          } as Plotly.Data,
        ]}
        layout={{
          ...BASE_LAYOUT,
          polar: {
            angularaxis: { direction: "clockwise", rotation: 90 },
            radialaxis: { ticksuffix: "%" },
          },
          height: 320,
          margin: { l: 30, r: 30, t: 20, b: 20 },
          showlegend: false,
        }}
        config={{ displaylogo: false, responsive: true }}
        style={{ width: "100%" }}
        useResizeHandler
      />
    </div>
  );
}

function FreeboardResults({ row }: { row: WindRow }) {
  const { fetchWave, freeboard } = row.result.results as {
    fetchWave: FetchWaveResponse;
    freeboard: FreeboardResponse;
  };
  const fetch_ = fetchWave.fetch as {
    effectiveFetchKm: number;
    centralFetchKm: number;
    directionDeg: number;
  };
  const scan = fetchWave.scan as {
    rows: { directionDeg: number; effectiveFetchKm: number; hsM: number }[];
    critical: { directionDeg: number; hsM: number };
  } | null;

  const components: [string, string][] = [
    ["Effective fetch (Saville)", `${fetch_.effectiveFetchKm.toFixed(2)} km`],
    ["Design wind over water", `${(freeboard.inputs.uWaterMs as number).toFixed(1)} m/s (R_L ${freeboard.inputs.rl})`],
    ["Significant wave height Hs", `${freeboard.hsM.toFixed(2)} m`],
    ["Wave period T", `${freeboard.tS.toFixed(2)} s`],
    [`Wave runup (${freeboard.inputs.runupMethod}, γf ${freeboard.inputs.gammaF}, ξ ${freeboard.inputs.xi})`, `${freeboard.runupM.toFixed(2)} m`],
    ["Wind setup (Zuider Zee)", `${freeboard.setupM.toFixed(3)} m`],
    ...Object.entries(freeboard.allowancesM).map(
      ([k, v]) => [`Allowance — ${k}`, `${v.toFixed(2)} m`] as [string, string],
    ),
  ];

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <p className="text-xs font-medium text-muted-foreground">
        {row.analysis.name}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <table className="w-full text-xs">
          <tbody className="font-mono">
            {components.map(([k, v]) => (
              <tr key={k} className="border-b border-border/40">
                <td className="py-1 pr-2 font-sans">{k}</td>
                <td className="px-2 py-1 text-right">{v}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-accent/50 font-semibold">
              <td className="py-1.5 pr-2 font-sans">Total required freeboard</td>
              <td className="px-2 py-1.5 text-right text-accent">
                {freeboard.totalFreeboardM.toFixed(2)} m
              </td>
            </tr>
          </tbody>
        </table>

        {scan && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Directional scan — critical: {scan.critical.directionDeg}° (Hs{" "}
              {scan.critical.hsM.toFixed(2)} m)
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">Toward</th>
                  <th className="px-2 py-1 text-right font-medium">F_eff (km)</th>
                  <th className="px-2 py-1 text-right font-medium">Hs (m)</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {scan.rows.map((s) => (
                  <tr
                    key={s.directionDeg}
                    className={
                      s.directionDeg === scan.critical.directionDeg
                        ? "bg-flag/10 font-semibold"
                        : "border-b border-border/30"
                    }
                  >
                    <td className="py-0.5 pr-2">{s.directionDeg}°</td>
                    <td className="px-2 py-0.5 text-right">{s.effectiveFetchKm.toFixed(2)}</td>
                    <td className="px-2 py-0.5 text-right">{s.hsM.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="font-mono text-[11px] text-muted-foreground">
        engine {freeboard.engineVersion} · input {row.analysis.inputHash.slice(0, 12)}
        {" · "}
        <Badge variant="flag">verify curve-based factors (R_L, γf) for production</Badge>
      </p>
    </div>
  );
}
