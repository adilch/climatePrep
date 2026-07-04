"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, MapPin, Plus, X } from "lucide-react";
import { StationMapLazy } from "@/components/map/StationMapLazy";
import { AvailabilityPanel } from "@/components/stations/AvailabilityPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Station finder (spec A1/A4): click the dam site → ranked nearby stations by
 * distance, record length, and elevation difference → inspect availability →
 * attach stations to the project.
 */

interface Site {
  latitude: number;
  longitude: number;
  elevationM?: number | null;
}

interface Candidate {
  station: {
    id: string;
    climateId: string;
    stationName: string;
    province: string | null;
    latitude: number;
    longitude: number;
    elevationM: number | null;
    firstYear: number | null;
    lastYear: number | null;
    recordLengthYears: number | null;
  };
  rank: {
    distanceKm: number;
    elevationDiffM: number | null;
    recordLengthYears: number;
    score: number;
  };
}

interface SelectedRow {
  projectStation: { id: string; stationId: string; role: string };
  station: Candidate["station"];
}

export function StationFinder({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  // --- Site pin (persisted per project) ---
  const siteQuery = useQuery<{ site: Site | null }>({
    queryKey: ["site", projectId],
    queryFn: async () => (await fetch(`/api/projects/${projectId}/site`)).json(),
  });
  const site = siteQuery.data?.site ?? null;

  const siteMutation = useMutation({
    mutationFn: async (next: Site) => {
      const res = await fetch(`/api/projects/${projectId}/site`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error("site update failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site", projectId] });
      qc.invalidateQueries({ queryKey: ["rank"] });
    },
  });

  // --- Ranked candidates ---
  const rankQuery = useQuery<{ candidates: Candidate[] }>({
    queryKey: ["rank", site?.latitude, site?.longitude, site?.elevationM],
    enabled: Boolean(site),
    queryFn: async () => {
      const p = new URLSearchParams({
        lat: String(site!.latitude),
        lon: String(site!.longitude),
        limit: "15",
      });
      if (site!.elevationM != null) p.set("elev", String(site!.elevationM));
      const res = await fetch(`/api/stations/rank?${p}`);
      if (!res.ok) throw new Error("rank failed");
      return res.json();
    },
  });
  const candidates = rankQuery.data?.candidates ?? [];

  // --- Selected stations ---
  const selectedQuery = useQuery<{ stations: SelectedRow[] }>({
    queryKey: ["project-stations", projectId],
    queryFn: async () =>
      (await fetch(`/api/projects/${projectId}/stations`)).json(),
  });
  const selected = selectedQuery.data?.stations ?? [];
  const selectedIds = new Set(selected.map((s) => s.projectStation.stationId));

  const addMutation = useMutation({
    mutationFn: async (c: Candidate) => {
      const res = await fetch(`/api/projects/${projectId}/stations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stationId: c.station.id,
          role: "primary",
          distanceKm: Number(c.rank.distanceKm.toFixed(2)),
          elevationDiffM: c.rank.elevationDiffM,
        }),
      });
      if (!res.ok) throw new Error("add failed");
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["project-stations", projectId] }),
  });

  const removeMutation = useMutation({
    mutationFn: async (stationId: string) => {
      await fetch(
        `/api/projects/${projectId}/stations?stationId=${stationId}`,
        { method: "DELETE" },
      );
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["project-stations", projectId] }),
  });

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Site location</CardTitle>
          {site && (
            <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <MapPin className="inline h-3 w-3" />
              {site.latitude.toFixed(5)}, {site.longitude.toFixed(5)}
              <label className="ml-2 flex items-center gap-1">
                elev
                <input
                  type="number"
                  defaultValue={site.elevationM ?? ""}
                  placeholder="m"
                  className="w-20 rounded border border-border bg-background px-1.5 py-0.5 text-xs"
                  onBlur={(e) => {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    if (v !== (site.elevationM ?? null)) {
                      siteMutation.mutate({
                        latitude: site.latitude,
                        longitude: site.longitude,
                        elevationM: v,
                      });
                    }
                  }}
                />
                m
              </label>
            </span>
          )}
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Click the map to drop the dam-site pin. Candidates are ranked by
            distance, record length, and elevation difference.
          </p>
          <StationMapLazy
            site={site}
            stations={candidates.map((c) => ({
              id: c.station.id,
              stationName: c.station.stationName,
              climateId: c.station.climateId,
              latitude: c.station.latitude,
              longitude: c.station.longitude,
              selected: selectedIds.has(c.station.id),
              highlighted: highlighted === c.station.id,
            }))}
            onSiteChange={(latitude, longitude) =>
              // Moving the pin preserves the entered elevation.
              siteMutation.mutate({
                latitude,
                longitude,
                elevationM: site?.elevationM ?? null,
              })
            }
            onStationClick={(id) => setExpanded(expanded === id ? null : id)}
          />
        </CardContent>
      </Card>

      {selected.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Selected stations ({selected.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {selected.map((s) => (
              <span
                key={s.projectStation.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/5 py-1 pl-3 pr-1.5 text-sm"
              >
                <span className="font-medium">{s.station.stationName}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {s.station.climateId}
                </span>
                <button
                  type="button"
                  onClick={() => removeMutation.mutate(s.station.id)}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-error/10 hover:text-error"
                  title="Remove station"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Candidate stations{" "}
            {site ? `(${candidates.length})` : "— set the site first"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!site ? (
            <p className="text-sm text-muted-foreground">
              Drop a pin on the map to rank nearby stations.
            </p>
          ) : rankQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Ranking stations…</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">Station</th>
                  <th className="px-2 py-1.5 text-right font-medium">Dist (km)</th>
                  <th className="px-2 py-1.5 text-right font-medium">Record (yr)</th>
                  <th className="px-2 py-1.5 text-right font-medium">Δ elev (m)</th>
                  <th className="px-2 py-1.5 text-right font-medium">Score</th>
                  <th className="py-1.5 pl-2" />
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  const isSel = selectedIds.has(c.station.id);
                  const isOpen = expanded === c.station.id;
                  return (
                    <FragmentRow
                      key={c.station.id}
                      candidate={c}
                      isSelected={isSel}
                      isOpen={isOpen}
                      onToggleOpen={() =>
                        setExpanded(isOpen ? null : c.station.id)
                      }
                      onHover={(on) =>
                        setHighlighted(on ? c.station.id : null)
                      }
                      onAdd={() => addMutation.mutate(c)}
                      onRemove={() => removeMutation.mutate(c.station.id)}
                    />
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FragmentRow({
  candidate: c,
  isSelected,
  isOpen,
  onToggleOpen,
  onHover,
  onAdd,
  onRemove,
}: {
  candidate: Candidate;
  isSelected: boolean;
  isOpen: boolean;
  onToggleOpen: () => void;
  onHover: (on: boolean) => void;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <>
      <tr
        className="border-b border-border/60 hover:bg-muted/40"
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
      >
        <td className="py-2 pr-2">
          <button
            type="button"
            onClick={onToggleOpen}
            className="flex items-center gap-1.5 text-left"
            title="Show data availability"
          >
            {isOpen ? (
              <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span>
              <span className="font-medium">{c.station.stationName}</span>{" "}
              <span className="font-mono text-xs text-muted-foreground">
                {c.station.climateId}
              </span>
            </span>
          </button>
        </td>
        <td className="px-2 py-2 text-right font-mono text-xs">
          {c.rank.distanceKm.toFixed(1)}
        </td>
        <td className="px-2 py-2 text-right font-mono text-xs">
          {c.station.recordLengthYears ?? "—"}
          {c.station.firstYear && (
            <span className="text-muted-foreground">
              {" "}
              ({c.station.firstYear}–{c.station.lastYear})
            </span>
          )}
        </td>
        <td className="px-2 py-2 text-right font-mono text-xs">
          {c.rank.elevationDiffM !== null ? (
            c.rank.elevationDiffM.toFixed(0)
          ) : (
            <Badge variant="flag">n/a</Badge>
          )}
        </td>
        <td className="px-2 py-2 text-right font-mono text-xs">
          {c.rank.score.toFixed(3)}
        </td>
        <td className="py-2 pl-2 text-right">
          {isSelected ? (
            <Button variant="outline" size="sm" onClick={onRemove}>
              <X className="h-3.5 w-3.5" /> Remove
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={onAdd}>
              <Plus className="h-3.5 w-3.5" /> Select
            </Button>
          )}
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={6} className="pb-3">
            <AvailabilityPanel stationId={c.station.id} />
          </td>
        </tr>
      )}
    </>
  );
}
