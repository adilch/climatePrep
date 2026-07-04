"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

/**
 * Pre-commitment availability viz (spec A4): per-collection record spans from
 * catalog metadata + a year×month completeness heatmap (fraction of days with
 * a valid observation) computed from a slim cached daily pull.
 */

interface Span {
  first: string;
  last: string;
}
interface Timeline {
  daily: Span | null;
  hourly: Span | null;
  monthly: Span | null;
  hasNormals: boolean;
}
interface HeatmapRow {
  year: number;
  precip: number[];
  temp: number[];
}
interface AvailabilityResponse {
  timeline: Timeline;
  heatmap: HeatmapRow[] | null;
  provenance?: { fromCache: boolean; rowCount: number };
}

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

function cellColor(fraction: number): string {
  if (fraction <= 0) return "#e2e8f0"; // slate-200: no data
  // Sequential teal ramp (colorblind-safe single hue).
  const alpha = 0.25 + 0.75 * Math.min(1, fraction);
  return `rgba(15, 118, 110, ${alpha.toFixed(2)})`;
}

export function AvailabilityPanel({ stationId }: { stationId: string }) {
  const [element, setElement] = useState<"precip" | "temp">("precip");
  const { data, isLoading, isError } = useQuery<AvailabilityResponse>({
    queryKey: ["availability", stationId],
    queryFn: async () => {
      const res = await fetch(`/api/stations/${stationId}/availability`);
      if (!res.ok) throw new Error(`availability failed: ${res.status}`);
      return res.json();
    },
    staleTime: 24 * 3600 * 1000,
  });

  if (isLoading) {
    return (
      <p className="px-1 py-3 text-xs text-muted-foreground">
        Loading availability (first load pulls the daily record — cached
        afterwards)…
      </p>
    );
  }
  if (isError || !data) {
    return (
      <p className="px-1 py-3 text-xs text-error">
        Could not load availability for this station.
      </p>
    );
  }

  const t = data.timeline;

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <TimelineChip label="Daily" span={t.daily} />
        <TimelineChip label="Hourly" span={t.hourly} />
        <TimelineChip label="Monthly" span={t.monthly} />
        <Badge variant={t.hasNormals ? "ok" : "default"}>
          Normals {t.hasNormals ? "✓" : "—"}
        </Badge>
      </div>

      {data.heatmap && data.heatmap.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Completeness by month —{" "}
              {element === "precip" ? "precipitation" : "temperature"}
            </span>
            <button
              type="button"
              onClick={() => setElement(element === "precip" ? "temp" : "precip")}
              className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
            >
              show {element === "precip" ? "temperature" : "precipitation"}
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto pr-1">
            <table className="border-separate border-spacing-px">
              <thead>
                <tr>
                  <th className="pr-1 text-right text-[10px] font-normal text-muted-foreground" />
                  {MONTHS.map((m, i) => (
                    <th
                      key={i}
                      className="w-4 text-center text-[10px] font-normal text-muted-foreground"
                    >
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.heatmap.map((row) => (
                  <tr key={row.year}>
                    <td className="pr-1 text-right font-mono text-[10px] text-muted-foreground">
                      {row.year}
                    </td>
                    {row[element].map((f, i) => (
                      <td key={i}>
                        <div
                          className="h-3.5 w-4 rounded-[2px]"
                          style={{ backgroundColor: cellColor(f) }}
                          title={`${row.year}-${String(i + 1).padStart(2, "0")}: ${Math.round(f * 100)}% of days`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.provenance && (
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              {data.provenance.rowCount.toLocaleString()} daily records
              {data.provenance.fromCache ? " · cache" : " · live pull"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function TimelineChip({ label, span }: { label: string; span: Span | null }) {
  if (!span) return <Badge variant="default">{label} —</Badge>;
  return (
    <Badge variant="accent" className="font-mono">
      {label} {span.first.slice(0, 4)}–{span.last.slice(0, 4)}
    </Badge>
  );
}
