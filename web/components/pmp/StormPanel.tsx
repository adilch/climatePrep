"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Play } from "lucide-react";
import type { DesignStormResponse } from "@climateprep/core-ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoButton } from "@/components/ui/InfoButton";
import { BASE_LAYOUT, OKABE_ITO, PlotlyLazy } from "@/components/pfa/PlotlyLazy";

/** Design-storm panel (spec E, M5): pattern → hyetograph → forcing export. */

const PATTERNS = [
  { key: "chicago", label: "Chicago (Keifer-Chu)", needs: "pfa" },
  { key: "alt_block", label: "Alternating block (nested)", needs: "pfa" },
  { key: "scs_type2", label: "SCS Type II", needs: "depth" },
  { key: "pmp", label: "PMP hyetograph", needs: "pmp" },
] as const;
type PatternKey = (typeof PATTERNS)[number]["key"];

interface AnalysisOption {
  analysis: { id: string; name: string; createdAt: string };
}

interface StormRow {
  analysis: { id: string; name: string; inputHash: string; createdAt: string };
  result: { results: DesignStormResponse };
}

export function StormPanel({ projectId }: { projectId: string }) {
  const qcClient = useQueryClient();
  const [pattern, setPattern] = useState<PatternKey>("alt_block");
  const [sourceId, setSourceId] = useState("");
  const [returnPeriod, setReturnPeriod] = useState("100");
  const [totalDepth, setTotalDepth] = useState("100");
  const [dtHours, setDtHours] = useState("1");
  const [peakRatio, setPeakRatio] = useState("0.375");
  const [durationHours, setDurationHours] = useState("24");

  const pfaQuery = useQuery<{ analyses: AnalysisOption[] }>({
    queryKey: ["pfa-analyses", projectId],
    queryFn: async () => (await fetch(`/api/projects/${projectId}/pfa`)).json(),
  });
  const pmpQuery = useQuery<{ analyses: AnalysisOption[] }>({
    queryKey: ["pmp-analyses", projectId],
    queryFn: async () => (await fetch(`/api/projects/${projectId}/pmp`)).json(),
  });
  const stormsQuery = useQuery<{ analyses: StormRow[] }>({
    queryKey: ["storm-analyses", projectId],
    queryFn: async () => (await fetch(`/api/projects/${projectId}/storms`)).json(),
  });
  const latest = stormsQuery.data?.analyses?.[0] ?? null;

  const needs = PATTERNS.find((p) => p.key === pattern)!.needs;
  const sourceOptions =
    needs === "pfa"
      ? pfaQuery.data?.analyses ?? []
      : needs === "pmp"
        ? pmpQuery.data?.analyses ?? []
        : [];

  const run = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/storms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern,
          dtHours: Number(dtHours),
          durationHours: Number(durationHours),
          peakRatio: Number(peakRatio),
          sourceAnalysisId: needs === "depth" ? null : sourceId || null,
          returnPeriod: needs === "pfa" ? Number(returnPeriod) : null,
          totalDepthMm: needs === "depth" ? Number(totalDepth) : null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `failed (${res.status})`);
      return body;
    },
    onSuccess: () =>
      qcClient.invalidateQueries({ queryKey: ["storm-analyses", projectId] }),
  });

  const canRun = needs === "depth" ? Number(totalDepth) > 0 : Boolean(sourceId);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>
            Design storm generation
            <InfoButton infoKey="storm.controls" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-muted-foreground">Pattern</span>
              <select
                value={pattern}
                onChange={(e) => {
                  setPattern(e.target.value as PatternKey);
                  setSourceId("");
                }}
                className="rounded-md border border-border bg-background px-2 py-2 text-sm"
              >
                {PATTERNS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            {needs !== "depth" && (
              <label className="block text-xs">
                <span className="mb-1 block font-medium text-muted-foreground">
                  {needs === "pfa" ? "PFA source (IDF)" : "PMP source (24 h)"}
                </span>
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  className="min-w-56 rounded-md border border-border bg-background px-2 py-2 text-sm"
                >
                  <option value="">Select…</option>
                  {sourceOptions.map((s) => (
                    <option key={s.analysis.id} value={s.analysis.id}>
                      {s.analysis.name} ·{" "}
                      {new Date(s.analysis.createdAt).toISOString().slice(0, 10)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {needs === "pfa" && (
              <label className="block text-xs">
                <span className="mb-1 block font-medium text-muted-foreground">T (yr)</span>
                <select
                  value={returnPeriod}
                  onChange={(e) => setReturnPeriod(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-2 text-sm"
                >
                  {[2, 5, 10, 25, 50, 100, 200, 500, 1000, 10000].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {needs === "depth" && (
              <label className="block text-xs">
                <span className="mb-1 block font-medium text-muted-foreground">
                  Total depth (mm)
                </span>
                <input
                  type="number"
                  min="1"
                  value={totalDepth}
                  onChange={(e) => setTotalDepth(e.target.value)}
                  className="w-24 rounded-md border border-border bg-background px-2 py-2 text-sm"
                />
              </label>
            )}

            <label className="block text-xs">
              <span className="mb-1 block font-medium text-muted-foreground">Δt (h)</span>
              <select
                value={dtHours}
                onChange={(e) => setDtHours(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-2 text-sm"
              >
                {[0.25, 0.5, 1, 2].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs">
              <span className="mb-1 block font-medium text-muted-foreground">
                Duration (h)
              </span>
              <select
                value={durationHours}
                onChange={(e) => setDurationHours(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-2 text-sm"
              >
                {[6, 12, 24].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs">
              <span className="mb-1 block font-medium text-muted-foreground">
                Peak ratio r
              </span>
              <input
                type="number"
                step="0.025"
                min="0.05"
                max="0.95"
                value={peakRatio}
                onChange={(e) => setPeakRatio(e.target.value)}
                className="w-20 rounded-md border border-border bg-background px-2 py-2 text-sm"
              />
            </label>

            <Button onClick={() => run.mutate()} disabled={!canRun || run.isPending}>
              <Play className="h-4 w-4" />
              {run.isPending ? "Generating…" : "Generate"}
            </Button>
            {run.isError && (
              <span className="text-xs text-error">{(run.error as Error).message}</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Huff quartile and AES/ECCC (Hogg 1980) distributions join once
            verified curve tables are incorporated.
          </p>
        </CardContent>
      </Card>

      {latest && <StormResults projectId={projectId} row={latest} />}
    </div>
  );
}

function StormResults({ projectId, row }: { projectId: string; row: StormRow }) {
  const h = row.result.results.hyetograph;
  const times = h.depthsMm.map((_, k) => (k + 0.5) * h.dtHours);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>
          {row.analysis.name}
          <InfoButton infoKey="storm.results" />
        </CardTitle>
        <div className="flex gap-2">
          <a
            href={`/api/projects/${projectId}/storms/${row.analysis.id}/forcing?format=swmm`}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" /> SWMM .dat
          </a>
          <a
            href={`/api/projects/${projectId}/storms/${row.analysis.id}/forcing?format=hec`}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" /> HEC CSV
          </a>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <PlotlyLazy
          data={[
            {
              x: times,
              y: h.intensitiesMmHr,
              type: "bar",
              name: "Intensity (mm/h)",
              marker: { color: OKABE_ITO[0] },
            },
            {
              x: times,
              y: h.cumulativeMm,
              type: "scatter",
              mode: "lines",
              name: "Cumulative (mm)",
              yaxis: "y2",
              line: { color: OKABE_ITO[1], width: 2 },
            },
          ]}
          layout={{
            ...BASE_LAYOUT,
            title: {
              text: `${h.pattern} — total ${h.totalDepthMm.toFixed(1)} mm over ${h.durationHours} h`,
              font: { size: 13 },
            },
            xaxis: { title: { text: "Time (h)" }, gridcolor: "#e2e8f0" },
            yaxis: { title: { text: "Intensity (mm/h)" }, gridcolor: "#e2e8f0" },
            yaxis2: {
              title: { text: "Cumulative (mm)" },
              overlaying: "y",
              side: "right",
              rangemode: "tozero",
            },
            legend: { orientation: "h", y: -0.2 },
            height: 380,
            bargap: 0.05,
          }}
          config={{ displaylogo: false, responsive: true }}
          style={{ width: "100%" }}
          useResizeHandler
        />

        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="accent">Σ = {h.totalDepthMm.toFixed(1)} mm</Badge>
          <Badge variant="default">
            peak {Math.max(...h.intensitiesMmHr).toFixed(1)} mm/h @{" "}
            {((h.peakIndex + 0.5) * h.dtHours).toFixed(1)} h
          </Badge>
          {Object.entries(h.params)
            .filter(([k]) => ["a", "b", "c", "fitRmseRel", "peakRatio"].includes(k))
            .map(([k, v]) => (
              <Badge key={k} variant="default" className="font-mono">
                {k}={typeof v === "number" ? v.toFixed(3) : String(v)}
              </Badge>
            ))}
        </div>
        {h.warnings.map((w) => (
          <p key={w} className="rounded-md border border-flag/40 bg-flag/5 p-2 text-xs">
            {w}
          </p>
        ))}
        <p className="font-mono text-[11px] text-muted-foreground">
          engine {row.result.results.engineVersion} · input{" "}
          {row.analysis.inputHash.slice(0, 12)}
        </p>
      </CardContent>
    </Card>
  );
}
