"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Data acquisition tab (spec A2/A5): choose station + collection + period →
 * pull (cached, rate-limited) → append-only provenance history + raw preview.
 */

const COLLECTION_OPTIONS = [
  { key: "daily", label: "Daily observations" },
  { key: "hourly", label: "Hourly observations" },
  { key: "monthly", label: "Monthly summaries" },
  { key: "normals", label: "Normals 1981–2010" },
  { key: "ahccdAnnual", label: "AHCCD annual (homogenized)" },
  { key: "ahccdMonthly", label: "AHCCD monthly (homogenized)" },
] as const;

interface SelectedRow {
  projectStation: { stationId: string };
  station: {
    id: string;
    climateId: string;
    stationName: string;
    firstYear: number | null;
    lastYear: number | null;
  };
}

interface PullRow {
  pull: {
    id: string;
    collection: string;
    periodStart: string | null;
    periodEnd: string | null;
    requestedAt: string;
    completedAt: string | null;
    rowCount: number | null;
    status: string;
    cacheKey: string | null;
    blobRef: string | null;
    endpointUrl: string;
    oglAttribution: boolean;
    error: string | null;
  };
  station: { climateId: string; stationName: string };
}

export function DataAcquisition({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [stationId, setStationId] = useState("");
  const [collection, setCollection] =
    useState<(typeof COLLECTION_OPTIONS)[number]["key"]>("daily");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown>[] | null>(null);
  const [lastPullNote, setLastPullNote] = useState<string | null>(null);

  const stationsQuery = useQuery<{ stations: SelectedRow[] }>({
    queryKey: ["project-stations", projectId],
    queryFn: async () =>
      (await fetch(`/api/projects/${projectId}/stations`)).json(),
  });
  const stations = stationsQuery.data?.stations ?? [];

  const pullsQuery = useQuery<{ pulls: PullRow[] }>({
    queryKey: ["pulls", projectId],
    queryFn: async () =>
      (await fetch(`/api/pulls?projectId=${projectId}`)).json(),
  });

  const pullMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/pulls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          stationId,
          collection,
          periodStart: periodStart || null,
          periodEnd: periodEnd || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `pull failed (${res.status})`);
      return body as {
        pull: PullRow["pull"];
        preview: Record<string, unknown>[];
        fromCache: boolean;
      };
    },
    onSuccess: (data) => {
      setPreview(data.preview);
      setLastPullNote(
        `${data.pull.rowCount?.toLocaleString()} rows · ${
          data.fromCache ? "served from cache" : "live pull"
        }`,
      );
      qc.invalidateQueries({ queryKey: ["pulls", projectId] });
    },
  });

  const selectedStation = stations.find((s) => s.station.id === stationId);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Pull data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {stations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No stations selected yet — pick candidates in the Stations tab
              first.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block text-xs">
                  <span className="mb-1 block font-medium text-muted-foreground">
                    Station
                  </span>
                  <select
                    value={stationId}
                    onChange={(e) => setStationId(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
                  >
                    <option value="">Select…</option>
                    {stations.map((s) => (
                      <option key={s.station.id} value={s.station.id}>
                        {s.station.stationName} ({s.station.climateId})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs">
                  <span className="mb-1 block font-medium text-muted-foreground">
                    Collection
                  </span>
                  <select
                    value={collection}
                    onChange={(e) =>
                      setCollection(
                        e.target.value as typeof collection,
                      )
                    }
                    className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
                  >
                    {COLLECTION_OPTIONS.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs">
                  <span className="mb-1 block font-medium text-muted-foreground">
                    From (optional)
                  </span>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block text-xs">
                  <span className="mb-1 block font-medium text-muted-foreground">
                    To (optional)
                  </span>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  />
                </label>
              </div>

              {selectedStation?.station.firstYear && (
                <p className="text-xs text-muted-foreground">
                  Record: {selectedStation.station.firstYear}–
                  {selectedStation.station.lastYear}. Leave dates empty to pull
                  the full record.
                </p>
              )}

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => pullMutation.mutate()}
                  disabled={!stationId || pullMutation.isPending}
                >
                  <Download className="h-4 w-4" />
                  {pullMutation.isPending ? "Pulling…" : "Pull data"}
                </Button>
                {lastPullNote && (
                  <span className="font-mono text-xs text-ok">{lastPullNote}</span>
                )}
                {pullMutation.isError && (
                  <span className="text-xs text-error">
                    {(pullMutation.error as Error).message}
                  </span>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {preview && preview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Raw preview (first {preview.length} rows)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <PreviewTable rows={preview} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pull history (provenance)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {(pullsQuery.data?.pulls ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No pulls yet. Every pull is recorded here permanently — source,
              endpoint, period, row count, timestamps.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">Station</th>
                  <th className="px-2 py-1.5 font-medium">Collection</th>
                  <th className="px-2 py-1.5 font-medium">Period</th>
                  <th className="px-2 py-1.5 text-right font-medium">Rows</th>
                  <th className="px-2 py-1.5 font-medium">Requested</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                  <th className="px-2 py-1.5 font-medium">Licence</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {pullsQuery.data!.pulls.map(({ pull, station }) => (
                  <tr key={pull.id} className="border-b border-border/60">
                    <td className="py-1.5 pr-2">
                      <span className="font-sans">{station.stationName}</span>{" "}
                      {station.climateId}
                    </td>
                    <td className="px-2 py-1.5">{pull.collection}</td>
                    <td className="px-2 py-1.5">
                      {pull.periodStart && pull.periodEnd
                        ? `${pull.periodStart} → ${pull.periodEnd}`
                        : "full record"}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {pull.rowCount?.toLocaleString() ?? "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      {new Date(pull.requestedAt).toISOString().slice(0, 16)}Z
                    </td>
                    <td className="px-2 py-1.5">
                      <Badge
                        variant={
                          pull.status === "complete"
                            ? "ok"
                            : pull.status === "error"
                              ? "error"
                              : "default"
                        }
                      >
                        {pull.status}
                      </Badge>
                    </td>
                    <td className="px-2 py-1.5">
                      {pull.oglAttribution ? "OGL-Canada" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">
            Contains information licensed under the Open Government Licence –
            Canada. Source: Environment and Climate Change Canada.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewTable({ rows }: { rows: Record<string, unknown>[] }) {
  // Show the most useful columns first; hide always-null columns.
  const keys = Object.keys(rows[0]).filter((k) =>
    rows.some((r) => r[k] !== null && r[k] !== undefined),
  );
  return (
    <table className="w-full whitespace-nowrap text-xs">
      <thead>
        <tr className="border-b border-border text-left text-muted-foreground">
          {keys.map((k) => (
            <th key={k} className="px-2 py-1.5 font-medium">
              {k}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="font-mono">
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-border/40">
            {keys.map((k) => (
              <td key={k} className="px-2 py-1">
                {r[k] === null || r[k] === undefined ? (
                  <span className="text-muted-foreground/50">·</span>
                ) : (
                  String(r[k])
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
