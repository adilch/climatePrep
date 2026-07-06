"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import type { PmpResponse } from "@climateprep/core-ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoButton } from "@/components/ui/InfoButton";

/**
 * Hershfield PMP panel (spec D, M5). Every adjustment factor is displayed in
 * the step log (acceptance criterion) along with the digitization notice —
 * the analyst can override Km and disable individual adjustments.
 */

interface QcAnalysisRow {
  analysis: { id: string; name: string; createdAt: string };
  result: {
    results: { durations?: { durationHours: number; ams: unknown[] }[] };
  } | null;
}

interface PmpAnalysisRow {
  analysis: { id: string; name: string; inputHash: string; createdAt: string };
  result: { results: PmpResponse };
  station: { stationName: string; climateId: string } | null;
}

export function PmpPanel({ projectId }: { projectId: string }) {
  const qcClient = useQueryClient();
  const [qcAnalysisId, setQcAnalysisId] = useState("");
  const [durationHours, setDurationHours] = useState("24");
  const [areaKm2, setAreaKm2] = useState("");
  const [kmOverride, setKmOverride] = useState("");
  const [outlier, setOutlier] = useState(true);
  const [length, setLength] = useState(true);
  const [interval_, setInterval_] = useState(true);

  const sources = useQuery<{ analyses: QcAnalysisRow[] }>({
    queryKey: ["qc-analyses", projectId],
    queryFn: async () => (await fetch(`/api/projects/${projectId}/qc`)).json(),
    select: (d) => ({
      analyses: d.analyses.filter(
        (a) =>
          a.analysis.name.startsWith("AMS aggregation") &&
          (a.result?.results?.durations?.length ?? 0) > 0,
      ),
    }),
  });

  const pmpQuery = useQuery<{ analyses: PmpAnalysisRow[] }>({
    queryKey: ["pmp-analyses", projectId],
    queryFn: async () => (await fetch(`/api/projects/${projectId}/pmp`)).json(),
  });
  const latest = pmpQuery.data?.analyses?.[0] ?? null;

  const run = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/pmp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qcAnalysisId,
          durationHours: Number(durationHours),
          areaKm2: areaKm2 ? Number(areaKm2) : null,
          kmOverride: kmOverride ? Number(kmOverride) : null,
          applyOutlierAdjustment: outlier,
          applyLengthAdjustment: length,
          applyIntervalAdjustment: interval_,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `failed (${res.status})`);
      return body;
    },
    onSuccess: () =>
      qcClient.invalidateQueries({ queryKey: ["pmp-analyses", projectId] }),
  });

  const selectedSource = sources.data?.analyses.find(
    (a) => a.analysis.id === qcAnalysisId,
  );
  const availableDurations =
    selectedSource?.result?.results?.durations?.map((d) => d.durationHours) ?? [];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>
            Statistical PMP — Hershfield (WMO-1045 Ch. 4)
            <InfoButton infoKey="pmp.controls" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(sources.data?.analyses.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              PMP runs on a QC AMS — run AMS aggregation in the QA/QC tab first.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-xs">
                <span className="mb-1 block font-medium text-muted-foreground">
                  AMS source
                </span>
                <select
                  value={qcAnalysisId}
                  onChange={(e) => setQcAnalysisId(e.target.value)}
                  className="min-w-64 rounded-md border border-border bg-background px-2 py-2 text-sm"
                >
                  <option value="">Select…</option>
                  {sources.data!.analyses.map((s) => (
                    <option key={s.analysis.id} value={s.analysis.id}>
                      {s.analysis.name} ·{" "}
                      {new Date(s.analysis.createdAt).toISOString().slice(0, 10)}
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
                  {(availableDurations.length ? availableDurations : [24]).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs">
                <span className="mb-1 block font-medium text-muted-foreground">
                  Basin area (km², optional)
                </span>
                <input
                  type="number"
                  min="1"
                  value={areaKm2}
                  onChange={(e) => setAreaKm2(e.target.value)}
                  placeholder="point"
                  className="w-28 rounded-md border border-border bg-background px-2 py-2 text-sm"
                />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block font-medium text-muted-foreground">
                  Km override
                </span>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  value={kmOverride}
                  onChange={(e) => setKmOverride(e.target.value)}
                  placeholder="Fig 4.1"
                  className="w-24 rounded-md border border-border bg-background px-2 py-2 text-sm"
                />
              </label>
              {(
                [
                  ["outlier adj (Fig 4.2/4.3)", outlier, setOutlier],
                  ["length adj (Fig 4.4)", length, setLength],
                  ["interval adj (Fig 4.5)", interval_, setInterval_],
                ] as const
              ).map(([label, val, set]) => (
                <label key={label} className="flex items-center gap-1.5 pb-2 text-xs">
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={(e) => set(e.target.checked)}
                    className="h-3.5 w-3.5 accent-accent"
                  />
                  {label}
                </label>
              ))}
              <Button onClick={() => run.mutate()} disabled={!qcAnalysisId || run.isPending}>
                <Play className="h-4 w-4" />
                {run.isPending ? "Computing…" : "Compute PMP"}
              </Button>
              {run.isError && (
                <span className="text-xs text-error">{(run.error as Error).message}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {latest && <PmpResults row={latest} />}
    </div>
  );
}

function PmpResults({ row }: { row: PmpAnalysisRow }) {
  const r = row.result.results;
  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            {row.analysis.name} — {row.station?.stationName}{" "}
            <span className="font-mono text-xs text-muted-foreground">
              {row.station?.climateId}
            </span>
            <InfoButton infoKey="pmp.results" />
          </CardTitle>
          <div className="flex gap-2">
            <Badge variant="accent" className="text-sm">
              point {r.pmpTrueIntervalMm.toFixed(0)} mm
            </Badge>
            {r.pmpArealMm !== null && (
              <Badge variant="ok" className="text-sm">
                {r.areaKm2?.toFixed(0)} km² → {r.pmpArealMm.toFixed(0)} mm
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 pr-2 font-medium">Step</th>
                <th className="px-2 py-1.5 text-right font-medium">Value</th>
                <th className="px-2 py-1.5 font-medium">Source</th>
                <th className="px-2 py-1.5 font-medium">Note</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {r.steps.map((s) => (
                <tr key={s.key} className="border-b border-border/40">
                  <td className="py-1.5 pr-2 font-sans">{s.label}</td>
                  <td className="px-2 py-1.5 text-right font-semibold">{s.value}</td>
                  <td className="px-2 py-1.5">
                    <Badge variant={s.source.startsWith("override") ? "flag" : "default"}>
                      {s.source}
                    </Badge>
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">{s.note}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="rounded-md border border-flag/40 bg-flag/5 p-2 text-[11px] text-foreground/80">
            {r.digitizationNotice}
          </p>

          {r.dad && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Depth–area (DAD) table — {r.durationHours} h PMP
              </p>
              <table className="text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-1 pr-4 font-medium">Area (km²)</th>
                    <th className="px-2 py-1 text-right font-medium">Depth (mm)</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {r.dad.map((d) => (
                    <tr key={d.areaKm2} className="border-b border-border/40">
                      <td className="py-0.5 pr-4">{d.areaKm2}</td>
                      <td className="px-2 py-0.5 text-right">
                        {Object.values(d.depthsMm)[0]?.toFixed(0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="font-mono text-[11px] text-muted-foreground">
            n={r.n} · max observed {r.maxObservedMm.toFixed(1)} mm · engine{" "}
            {r.engineVersion} · input {row.analysis.inputHash.slice(0, 12)}
          </p>
        </CardContent>
      </Card>
    </>
  );
}
