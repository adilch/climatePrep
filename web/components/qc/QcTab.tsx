"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoButton } from "@/components/ui/InfoButton";

/**
 * QA/QC tab (spec B1–B3, M2): trend/homogeneity flags with AHCCD suggestion,
 * AMS aggregation with the fixed→true interval correction surfaced, and
 * neighbour-based infilling with per-point logging.
 */

interface PullRow {
  pull: {
    id: string;
    collection: string;
    periodStart: string | null;
    periodEnd: string | null;
    rowCount: number | null;
    status: string;
  };
  station: { climateId: string; stationName: string };
}

function usePulls(projectId: string) {
  return useQuery<{ pulls: PullRow[] }>({
    queryKey: ["pulls", projectId],
    queryFn: async () =>
      (await fetch(`/api/pulls?projectId=${projectId}`)).json(),
    select: (d) => ({
      pulls: d.pulls.filter(
        (p) => p.pull.status === "complete" && p.pull.collection === "climate-daily",
      ),
    }),
  });
}

function pullLabel(p: PullRow): string {
  const period =
    p.pull.periodStart && p.pull.periodEnd
      ? `${p.pull.periodStart.slice(0, 4)}–${p.pull.periodEnd.slice(0, 4)}`
      : "full record";
  return `${p.station.stationName} (${p.station.climateId}) · ${period}`;
}

export function QcTab({ projectId }: { projectId: string }) {
  const pullsQuery = usePulls(projectId);
  const pulls = pullsQuery.data?.pulls ?? [];

  if (pullsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading pulls…</p>;
  }
  if (pulls.length === 0) {
    return (
      <Card>
        <CardContent className="pt-5 text-sm text-muted-foreground">
          QA/QC operates on completed <span className="font-mono">climate-daily</span>{" "}
          pulls. Pull daily data in the Data tab first.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <TrendPanel projectId={projectId} pulls={pulls} />
      <AggregatePanel projectId={projectId} pulls={pulls} />
      <InfillPanel projectId={projectId} pulls={pulls} />
    </div>
  );
}

/* ----------------------------- Trend panel ------------------------------ */

interface TrendResults {
  n: number;
  years: number[];
  excludedYears: { year: number; completeness: number }[];
  mannKendall: {
    trend: string;
    significant: boolean;
    pValue: number;
    senSlope: number;
    tau: number;
  };
  pettitt: ChangePoint;
  snht: ChangePoint;
  engineVersion: string;
  seed: number;
}
interface ChangePoint {
  homogeneous: boolean;
  changePointIndex: number;
  pValue: number;
  statistic: number;
  meanBefore: number;
  meanAfter: number;
}

function TrendPanel({ projectId, pulls }: { projectId: string; pulls: PullRow[] }) {
  const qc = useQueryClient();
  const [pullId, setPullId] = useState("");
  const [seriesType, setSeriesType] = useState<"annual_max" | "annual_total">(
    "annual_max",
  );
  const [results, setResults] = useState<TrendResults | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/qc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "trend", pullId, seriesType }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `failed (${res.status})`);
      return body.results as TrendResults;
    },
    onSuccess: (r) => {
      setResults(r);
      qc.invalidateQueries({ queryKey: ["qc-analyses", projectId] });
    },
  });

  const inhomogeneous =
    results && (!results.pettitt.homogeneous || !results.snht.homogeneous);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Homogeneity &amp; trend (Pettitt · SNHT · Mann-Kendall + Sen)
          <InfoButton infoKey="qc.trend" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <PullSelect pulls={pulls} value={pullId} onChange={setPullId} />
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-muted-foreground">Series</span>
            <select
              value={seriesType}
              onChange={(e) => setSeriesType(e.target.value as typeof seriesType)}
              className="rounded-md border border-border bg-background px-2 py-2 text-sm"
            >
              <option value="annual_max">Annual max daily precip</option>
              <option value="annual_total">Annual total precip</option>
            </select>
          </label>
          <Button onClick={() => run.mutate()} disabled={!pullId || run.isPending}>
            <Play className="h-4 w-4" />
            {run.isPending ? "Running…" : "Run tests"}
          </Button>
          {run.isError && (
            <span className="text-xs text-error">{(run.error as Error).message}</span>
          )}
        </div>

        {results && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <ResultBox
                title="Mann-Kendall + Sen"
                flag={results.mannKendall.significant}
                flagLabel={
                  results.mannKendall.significant
                    ? `${results.mannKendall.trend} trend`
                    : "no significant trend"
                }
                rows={[
                  ["p-value", results.mannKendall.pValue.toExponential(2)],
                  ["Sen slope", `${results.mannKendall.senSlope.toFixed(3)} mm/yr`],
                  ["tau", results.mannKendall.tau.toFixed(3)],
                ]}
              />
              <ChangePointBox title="Pettitt" cp={results.pettitt} years={results.years} />
              <ChangePointBox title="SNHT" cp={results.snht} years={results.years} />
            </div>

            {inhomogeneous && (
              <div className="rounded-md border border-flag/40 bg-flag/5 p-3 text-sm">
                <Badge variant="flag" className="mb-1.5">record flagged inhomogeneous</Badge>
                <p className="text-xs text-foreground/80">
                  A change point was detected — the record may reflect station
                  moves, instrument changes, or exposure changes rather than
                  climate. Consider pulling the{" "}
                  <span className="font-medium">AHCCD homogenized series</span>{" "}
                  for this station (Data tab → AHCCD collections) and compare
                  before using this record for frequency analysis.
                </p>
              </div>
            )}

            <p className="font-mono text-[11px] text-muted-foreground">
              n={results.n} years ({results.years[0]}–{results.years[results.years.length - 1]})
              {results.excludedYears.length > 0 &&
                ` · ${results.excludedYears.length} incomplete year(s) excluded`}
              {" · "}seed {results.seed} · engine {results.engineVersion}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ResultBox({
  title,
  flag,
  flagLabel,
  rows,
}: {
  title: string;
  flag: boolean;
  flagLabel: string;
  rows: [string, string][];
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold">{title}</span>
        <Badge variant={flag ? "flag" : "ok"}>{flagLabel}</Badge>
      </div>
      <dl className="space-y-0.5 font-mono text-xs text-muted-foreground">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <dt>{k}</dt>
            <dd className="text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ChangePointBox({
  title,
  cp,
  years,
}: {
  title: string;
  cp: ChangePoint;
  years: number[];
}) {
  const cpYear = years[cp.changePointIndex] ?? "—";
  return (
    <ResultBox
      title={title}
      flag={!cp.homogeneous}
      flagLabel={cp.homogeneous ? "homogeneous" : `break after ${cpYear}`}
      rows={[
        ["p-value", cp.pValue < 1e-4 ? cp.pValue.toExponential(1) : cp.pValue.toFixed(4)],
        ["statistic", cp.statistic.toFixed(2)],
        ["mean before", cp.meanBefore.toFixed(1)],
        ["mean after", cp.meanAfter.toFixed(1)],
      ]}
    />
  );
}

/* --------------------------- Aggregation panel -------------------------- */

interface AggResults {
  durations: {
    durationHours: number;
    kIntervals: number;
    correctionApplied: boolean;
    correctionFactor: number;
    ams: { year: number; valueRaw: number; value: number; completeness: number }[];
    yearsSkipped: { year: number; reason: string }[];
  }[];
  engineVersion: string;
}

function AggregatePanel({ projectId, pulls }: { projectId: string; pulls: PullRow[] }) {
  const [pullId, setPullId] = useState("");
  const [applyCorrection, setApplyCorrection] = useState(true);
  const [factor, setFactor] = useState("1.13");
  const [results, setResults] = useState<AggResults | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/qc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "aggregate",
          pullId,
          durationsHours: [24, 48, 72],
          applyCorrection,
          singleIntervalFactor: Number(factor),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `failed (${res.status})`);
      return body.results as AggResults;
    },
    onSuccess: setResults,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          AMS aggregation (24/48/72 h) + fixed→true interval correction
          <InfoButton infoKey="qc.aggregate" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <PullSelect pulls={pulls} value={pullId} onChange={setPullId} />
          <label className="flex items-center gap-2 pb-2 text-xs">
            <input
              type="checkbox"
              checked={applyCorrection}
              onChange={(e) => setApplyCorrection(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            <span>
              Apply correction{" "}
              <span className="text-muted-foreground">(WMO-1045 / Weiss)</span>
            </span>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-muted-foreground">
              k=1 factor
            </span>
            <input
              type="number"
              step="0.01"
              min="1"
              max="1.5"
              value={factor}
              disabled={!applyCorrection}
              onChange={(e) => setFactor(e.target.value)}
              className="w-20 rounded-md border border-border bg-background px-2 py-2 text-sm disabled:opacity-50"
            />
          </label>
          <Button onClick={() => run.mutate()} disabled={!pullId || run.isPending}>
            <Play className="h-4 w-4" />
            {run.isPending ? "Aggregating…" : "Extract AMS"}
          </Button>
          {run.isError && (
            <span className="text-xs text-error">{(run.error as Error).message}</span>
          )}
        </div>

        {!applyCorrection && (
          <p className="rounded-md border border-flag/40 bg-flag/5 p-2 text-xs text-flag">
            Correction disabled: fixed-interval (clock-day) maxima systematically
            underestimate true sliding maxima. Only disable if your data are
            already true-interval.
          </p>
        )}

        {results && (
          <div className="space-y-4">
            {results.durations.map((d) => (
              <div key={d.durationHours}>
                <div className="mb-1.5 flex items-center gap-2 text-xs">
                  <span className="font-semibold">{d.durationHours} h</span>
                  <Badge variant={d.correctionApplied ? "accent" : "flag"}>
                    {d.correctionApplied
                      ? `× ${d.correctionFactor.toFixed(2)} (k=${d.kIntervals})`
                      : "uncorrected"}
                  </Badge>
                  <span className="text-muted-foreground">
                    {d.ams.length} years
                    {d.yearsSkipped.length > 0 && ` · ${d.yearsSkipped.length} skipped`}
                  </span>
                </div>
                <div className="max-h-44 overflow-y-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted">
                      <tr className="text-left text-muted-foreground">
                        <th className="px-2 py-1 font-medium">Year</th>
                        <th className="px-2 py-1 text-right font-medium">Raw (mm)</th>
                        <th className="px-2 py-1 text-right font-medium">Corrected (mm)</th>
                        <th className="px-2 py-1 text-right font-medium">Completeness</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {d.ams.map((p) => (
                        <tr key={p.year} className="border-t border-border/50">
                          <td className="px-2 py-0.5">{p.year}</td>
                          <td className="px-2 py-0.5 text-right">{p.valueRaw.toFixed(1)}</td>
                          <td className="px-2 py-0.5 text-right">{p.value.toFixed(1)}</td>
                          <td className="px-2 py-0.5 text-right">
                            {(p.completeness * 100).toFixed(0)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            <p className="font-mono text-[11px] text-muted-foreground">
              AMS ready for frequency analysis (M3) · engine {results.engineVersion}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ----------------------------- Infill panel ----------------------------- */

interface InfillResults {
  filledPoints: {
    date: string;
    value: number;
    method: string;
    neighbours: { id: string; name: string }[];
    params: Record<string, unknown>;
  }[];
  unfillable: { date: string; reason: string }[];
  stats: Record<string, unknown>;
  engineVersion: string;
}

function InfillPanel({ projectId, pulls }: { projectId: string; pulls: PullRow[] }) {
  const [targetId, setTargetId] = useState("");
  const [neighbourIds, setNeighbourIds] = useState<string[]>([]);
  const [method, setMethod] = useState<"normal_ratio" | "idw" | "regression">(
    "normal_ratio",
  );
  const [results, setResults] = useState<InfillResults | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/qc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "infill",
          targetPullId: targetId,
          neighbourPullIds: neighbourIds,
          method,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `failed (${res.status})`);
      return body.results as InfillResults;
    },
    onSuccess: setResults,
  });

  const neighbourOptions = pulls.filter((p) => p.pull.id !== targetId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Missing-data infilling
          <InfoButton infoKey="qc.infill" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {pulls.length < 2 ? (
          <p className="text-sm text-muted-foreground">
            Infilling needs the target plus at least one neighbour station pull.
            Pull daily data for a second (nearby) station in the Data tab.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <PullSelect
                label="Target"
                pulls={pulls}
                value={targetId}
                onChange={(v) => {
                  setTargetId(v);
                  setNeighbourIds(neighbourIds.filter((n) => n !== v));
                }}
              />
              <label className="block text-xs">
                <span className="mb-1 block font-medium text-muted-foreground">
                  Method
                </span>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as typeof method)}
                  className="rounded-md border border-border bg-background px-2 py-2 text-sm"
                >
                  <option value="normal_ratio">Normal ratio</option>
                  <option value="idw">Inverse distance (b=2)</option>
                  <option value="regression">Regression (best neighbour)</option>
                </select>
              </label>
              <Button
                onClick={() => run.mutate()}
                disabled={!targetId || neighbourIds.length === 0 || run.isPending}
              >
                <Play className="h-4 w-4" />
                {run.isPending ? "Infilling…" : "Infill"}
              </Button>
              {run.isError && (
                <span className="text-xs text-error">{(run.error as Error).message}</span>
              )}
            </div>

            <fieldset className="text-xs">
              <legend className="mb-1 font-medium text-muted-foreground">
                Neighbours
              </legend>
              <div className="flex flex-wrap gap-2">
                {neighbourOptions.map((p) => (
                  <label
                    key={p.pull.id}
                    className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1"
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-accent"
                      checked={neighbourIds.includes(p.pull.id)}
                      onChange={(e) =>
                        setNeighbourIds(
                          e.target.checked
                            ? [...neighbourIds, p.pull.id]
                            : neighbourIds.filter((n) => n !== p.pull.id),
                        )
                      }
                    />
                    {pullLabel(p)}
                  </label>
                ))}
              </div>
            </fieldset>

            {results && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="ok">
                    {String(results.stats.nFilled)} filled
                  </Badge>
                  <Badge variant={results.unfillable.length ? "flag" : "default"}>
                    {results.unfillable.length} unfillable
                  </Badge>
                  <Badge variant="outline">
                    of {String(results.stats.nMissing)} missing
                  </Badge>
                </div>
                {results.filledPoints.length > 0 && (
                  <div className="max-h-44 overflow-y-auto rounded-md border border-border">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted">
                        <tr className="text-left text-muted-foreground">
                          <th className="px-2 py-1 font-medium">Date</th>
                          <th className="px-2 py-1 text-right font-medium">Value (mm)</th>
                          <th className="px-2 py-1 font-medium">Method</th>
                          <th className="px-2 py-1 font-medium">Neighbours used</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {results.filledPoints.slice(0, 200).map((p) => (
                          <tr key={p.date} className="border-t border-border/50">
                            <td className="px-2 py-0.5">{p.date}</td>
                            <td className="px-2 py-0.5 text-right">{p.value.toFixed(1)}</td>
                            <td className="px-2 py-0.5">
                              <Badge variant="flag">{p.method}</Badge>
                            </td>
                            <td className="px-2 py-0.5">
                              {p.neighbours.map((n) => n.id).join(", ")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="font-mono text-[11px] text-muted-foreground">
                  every filled point is flagged + logged with method and
                  neighbours · engine {results.engineVersion}
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------- shared --------------------------------- */

function PullSelect({
  pulls,
  value,
  onChange,
  label = "Daily pull",
}: {
  pulls: PullRow[];
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-64 rounded-md border border-border bg-background px-2 py-2 text-sm"
      >
        <option value="">Select…</option>
        {pulls.map((p) => (
          <option key={p.pull.id} value={p.pull.id}>
            {pullLabel(p)}
          </option>
        ))}
      </select>
    </label>
  );
}
