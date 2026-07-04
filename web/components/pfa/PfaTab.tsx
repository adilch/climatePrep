"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import type { PfaResponse } from "@climateprep/core-ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FrequencyPlot } from "./FrequencyPlot";
import { IdfChart, type PublishedIdfChart } from "./IdfChart";
import { LmrDiagram } from "./LmrDiagram";

/**
 * PFA/IDF module (spec C, M3). Source is a completed QC AMS-aggregation
 * analysis — provenance chains pull → QC (correction logged) → PFA.
 */

const ALL_DISTS = ["gumbel", "gev", "glo", "pe3", "lp3"] as const;
type Dist = (typeof ALL_DISTS)[number];

interface QcAnalysisRow {
  analysis: {
    id: string;
    name: string;
    createdAt: string;
    stationId: string | null;
  };
  result: { results: { durations?: { durationHours: number; ams: unknown[] }[] } } | null;
}

interface PfaAnalysisRow {
  analysis: {
    id: string;
    name: string;
    createdAt: string;
    engineVersion: string | null;
    inputHash: string;
    inputs: { bootstrap?: { seed: number } };
  };
  result: { results: PfaResponse; seed: number | null };
  station: { id: string; climateId: string; stationName: string; province: string | null } | null;
}

export function PfaTab({ projectId }: { projectId: string }) {
  const qcClient = useQueryClient();
  const [qcAnalysisId, setQcAnalysisId] = useState("");
  const [dists, setDists] = useState<Dist[]>([...ALL_DISTS]);
  const [method, setMethod] = useState<"lmoments" | "mom" | "mle">("lmoments");
  const [idfDist, setIdfDist] = useState<Dist>("gumbel");
  const [bootstrapN, setBootstrapN] = useState("2000");
  const [seed, setSeed] = useState("42");

  // Sources: QC aggregation analyses with AMS durations.
  const qcQuery = useQuery<{ analyses: QcAnalysisRow[] }>({
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

  // Existing PFA results (latest first).
  const pfaQuery = useQuery<{ analyses: PfaAnalysisRow[] }>({
    queryKey: ["pfa-analyses", projectId],
    queryFn: async () => (await fetch(`/api/projects/${projectId}/pfa`)).json(),
  });
  const latest = pfaQuery.data?.analyses?.[0] ?? null;

  // Published IDF for the latest result's station.
  const publishedQuery = useQuery<{
    found: boolean;
    idf?: PublishedIdfChart & { stationName: string; yearsRange: string | null };
  }>({
    queryKey: ["published-idf", latest?.station?.id],
    enabled: Boolean(latest?.station?.id),
    staleTime: Infinity,
    queryFn: async () =>
      (await fetch(`/api/stations/${latest!.station!.id}/published-idf`)).json(),
  });

  const run = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/pfa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qcAnalysisId,
          distributions: dists,
          estimationMethod: method,
          idfDistribution: idfDist,
          bootstrapN: Number(bootstrapN),
          seed: Number(seed),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `failed (${res.status})`);
      return body;
    },
    onSuccess: () =>
      qcClient.invalidateQueries({ queryKey: ["pfa-analyses", projectId] }),
  });

  const sources = qcQuery.data?.analyses ?? [];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Precipitation frequency analysis / IDF</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              PFA runs on an AMS produced by QA/QC. Run{" "}
              <span className="font-medium">AMS aggregation</span> in the QA/QC
              tab first (the fixed→true interval correction is applied there
              and logged into the provenance chain).
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-xs">
                <span className="mb-1 block font-medium text-muted-foreground">
                  AMS source (QC analysis)
                </span>
                <select
                  value={qcAnalysisId}
                  onChange={(e) => setQcAnalysisId(e.target.value)}
                  className="min-w-72 rounded-md border border-border bg-background px-2 py-2 text-sm"
                >
                  <option value="">Select…</option>
                  {sources.map((s) => (
                    <option key={s.analysis.id} value={s.analysis.id}>
                      {s.analysis.name} ·{" "}
                      {new Date(s.analysis.createdAt).toISOString().slice(0, 16)}Z
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="text-xs">
                <legend className="mb-1 font-medium text-muted-foreground">
                  Distributions
                </legend>
                <div className="flex gap-2">
                  {ALL_DISTS.map((d) => (
                    <label
                      key={d}
                      className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5"
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-accent"
                        checked={dists.includes(d)}
                        onChange={(e) =>
                          setDists(
                            e.target.checked
                              ? [...dists, d]
                              : dists.filter((x) => x !== d),
                          )
                        }
                      />
                      {d.toUpperCase()}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="block text-xs">
                <span className="mb-1 block font-medium text-muted-foreground">Method</span>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as typeof method)}
                  className="rounded-md border border-border bg-background px-2 py-2 text-sm"
                >
                  <option value="lmoments">L-moments</option>
                  <option value="mom">MOM (LP3)</option>
                  <option value="mle">MLE</option>
                </select>
              </label>

              <label className="block text-xs">
                <span className="mb-1 block font-medium text-muted-foreground">
                  IDF family
                </span>
                <select
                  value={idfDist}
                  onChange={(e) => setIdfDist(e.target.value as Dist)}
                  className="rounded-md border border-border bg-background px-2 py-2 text-sm"
                  title="Gumbel matches ECCC's published-IDF methodology"
                >
                  {ALL_DISTS.map((d) => (
                    <option key={d} value={d}>
                      {d.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs">
                <span className="mb-1 block font-medium text-muted-foreground">
                  Bootstrap n
                </span>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  step="100"
                  value={bootstrapN}
                  onChange={(e) => setBootstrapN(e.target.value)}
                  className="w-24 rounded-md border border-border bg-background px-2 py-2 text-sm"
                />
              </label>

              <label className="block text-xs">
                <span className="mb-1 block font-medium text-muted-foreground">Seed</span>
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  className="w-20 rounded-md border border-border bg-background px-2 py-2 text-sm"
                />
              </label>

              <Button
                onClick={() => run.mutate()}
                disabled={!qcAnalysisId || dists.length === 0 || run.isPending}
              >
                <Play className="h-4 w-4" />
                {run.isPending ? "Fitting…" : "Run PFA"}
              </Button>
              {run.isError && (
                <span className="text-xs text-error">
                  {(run.error as Error).message}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {latest && (
        <PfaResults
          row={latest}
          published={
            publishedQuery.data?.found ? publishedQuery.data.idf ?? null : null
          }
          publishedMissing={
            publishedQuery.isSuccess && !publishedQuery.data?.found
          }
        />
      )}
    </div>
  );
}

/* ------------------------------ results ---------------------------------- */

function PfaResults({
  row,
  published,
  publishedMissing,
}: {
  row: PfaAnalysisRow;
  published: (PublishedIdfChart & { stationName: string; yearsRange: string | null }) | null;
  publishedMissing: boolean;
}) {
  const results = row.result.results;
  const [durIdx, setDurIdx] = useState(0);
  const dur = results.durations[Math.min(durIdx, results.durations.length - 1)];

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            Results — {row.station?.stationName}{" "}
            <span className="font-mono text-xs text-muted-foreground">
              {row.station?.climateId}
            </span>
          </CardTitle>
          <div className="flex gap-1">
            {results.durations.map((d, i) => (
              <button
                key={d.durationHours}
                type="button"
                onClick={() => setDurIdx(i)}
                className={`rounded-md border px-2 py-1 text-xs ${
                  i === durIdx
                    ? "border-accent bg-accent/10 font-medium text-accent"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {d.durationHours} h
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">Distribution</th>
                  <th className="px-2 py-1.5 font-medium">Parameters</th>
                  <th className="px-2 py-1.5 text-right font-medium">AIC</th>
                  <th className="px-2 py-1.5 text-right font-medium">KS</th>
                  <th className="px-2 py-1.5 text-right font-medium">AD</th>
                  <th className="px-2 py-1.5 text-right font-medium">PPCC</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody className="font-mono">
                {dur.fits.map((f) => (
                  <tr key={f.key} className="border-b border-border/50">
                    <td className="py-1.5 pr-2 font-sans font-medium">
                      {f.key.toUpperCase()}
                    </td>
                    <td className="px-2 py-1.5">
                      {f.fitError
                        ? f.fitError
                        : Object.entries(f.parameters)
                            .map(([k, v]) => `${k}=${v.toFixed(4)}`)
                            .join("  ")}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {f.goodnessOfFit?.aic?.toFixed(1) ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {f.goodnessOfFit?.ksStat?.toFixed(3) ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {f.goodnessOfFit?.adStat?.toFixed(3) ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {f.goodnessOfFit?.ppcc?.toFixed(4) ?? "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      {dur.bestFit === f.key && <Badge variant="ok">best (AIC)</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <FrequencyPlot
            durationHours={dur.durationHours}
            fits={dur.fits}
            plottingPositions={dur.plottingPositions}
            ciDistribution={results.idf.distribution}
          />

          <div className="overflow-x-auto">
            <QuantileTable dur={dur} idfDist={results.idf.distribution} />
          </div>

          <p className="font-mono text-[11px] text-muted-foreground">
            n={dur.n} · seed {results.seed} · engine {results.engineVersion} ·
            input {row.analysis.inputHash.slice(0, 12)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>IDF — site-specific vs ECCC published</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <IdfChart site={results.idf} published={published} />
          {publishedMissing && (
            <p className="rounded-md border border-flag/40 bg-flag/5 p-2 text-xs text-foreground/80">
              ECCC publishes no IDF for this station (only ~600 tipping-bucket
              stations have one). The site-specific curve stands alone; consider
              adding a nearby published-IDF station for comparison.
            </p>
          )}
          {published && (
            <p className="text-[11px] text-muted-foreground">
              Published: ECCC Engineering Climate Datasets {published.version} —{" "}
              {published.stationName}
              {published.yearsRange ? ` (${published.yearsRange})` : ""} · Gumbel/MOM ·
              contains information licensed under the OGL – Canada.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>L-moment ratio diagram</CardTitle>
        </CardHeader>
        <CardContent>
          <LmrDiagram
            samples={results.durations.map((d) => ({
              durationHours: d.durationHours,
              t3: d.lmomentRatios.t3,
              t4: d.lmomentRatios.t4,
            }))}
          />
        </CardContent>
      </Card>
    </>
  );
}

function QuantileTable({
  dur,
  idfDist,
}: {
  dur: PfaResponse["durations"][number];
  idfDist: string;
}) {
  const fit = dur.fits.find((f) => f.key === idfDist && !f.fitError);
  if (!fit) return null;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border text-left text-muted-foreground">
          <th className="py-1.5 pr-2 font-medium">T (yr)</th>
          <th className="px-2 py-1.5 text-right font-medium">AEP</th>
          <th className="px-2 py-1.5 text-right font-medium">
            Depth (mm) — {fit.key.toUpperCase()}
          </th>
          <th className="px-2 py-1.5 text-right font-medium">90% CI</th>
        </tr>
      </thead>
      <tbody className="font-mono">
        {fit.quantiles.map((q) => (
          <tr key={q.returnPeriod} className="border-b border-border/40">
            <td className="py-1 pr-2">{q.returnPeriod}</td>
            <td className="px-2 py-1 text-right">{q.aep}</td>
            <td className="px-2 py-1 text-right font-medium">{q.value.toFixed(1)}</td>
            <td className="px-2 py-1 text-right text-muted-foreground">
              {q.ciLower !== null && q.ciUpper !== null
                ? `${q.ciLower.toFixed(1)} – ${q.ciUpper.toFixed(1)}`
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
