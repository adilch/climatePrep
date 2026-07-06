"use client";

import { useQuery } from "@tanstack/react-query";
import type { PfaResponse } from "@climateprep/core-ts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoButton } from "@/components/ui/InfoButton";
import { IdfChart, type PublishedIdfChart } from "@/components/pfa/IdfChart";

/**
 * Compare panel (spec K5): site-specific PFA vs ECCC published IDF at shared
 * duration × return-period points, so the chosen design value is defensible.
 * Regional estimates join in Phase 2 (M7).
 */

interface PfaRow {
  analysis: { id: string; name: string; createdAt: string };
  result: { results: PfaResponse };
  station: { id: string; stationName: string; climateId: string } | null;
}

export function CompareTab({ projectId }: { projectId: string }) {
  const pfaQuery = useQuery<{ analyses: PfaRow[] }>({
    queryKey: ["pfa-analyses", projectId],
    queryFn: async () => (await fetch(`/api/projects/${projectId}/pfa`)).json(),
  });
  const latest = pfaQuery.data?.analyses?.[0] ?? null;

  const publishedQuery = useQuery<{
    found: boolean;
    idf?: PublishedIdfChart & {
      stationName: string;
      yearsRange: string | null;
      depthsMm: (number | null)[][];
    };
  }>({
    queryKey: ["published-idf", latest?.station?.id],
    enabled: Boolean(latest?.station?.id),
    staleTime: Infinity,
    queryFn: async () =>
      (await fetch(`/api/stations/${latest!.station!.id}/published-idf`)).json(),
  });

  if (pfaQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (!latest) {
    return (
      <Card>
        <CardContent className="pt-5 text-sm text-muted-foreground">
          Run a PFA/IDF analysis first — the comparison panel contrasts the
          latest site-specific results with the ECCC published IDF.
        </CardContent>
      </Card>
    );
  }

  const results = latest.result.results;
  const published = publishedQuery.data?.found
    ? publishedQuery.data.idf ?? null
    : null;

  // Shared points table.
  const rows: {
    dur: number;
    T: number;
    site: number;
    pub: number;
    delta: number;
  }[] = [];
  if (published) {
    results.idf.durationsHours.forEach((dur, di) => {
      const pdi = published.durations.findIndex((d) => d.hours === dur);
      if (pdi === -1) return;
      results.idf.returnPeriods.forEach((T, ti) => {
        const pti = published.returnPeriods.indexOf(T);
        if (pti === -1) return;
        const cell = results.idf.cells[di][ti];
        const pub = published.depthsMm[pdi][pti];
        if (!cell || pub === null) return;
        rows.push({
          dur,
          T,
          site: cell.depth,
          pub,
          delta: ((cell.depth - pub) / pub) * 100,
        });
      });
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>
            Site-specific vs ECCC published — {latest.station?.stationName}{" "}
            <span className="font-mono text-xs text-muted-foreground">
              {latest.station?.climateId}
            </span>
            <InfoButton infoKey="compare.idf" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <IdfChart site={results.idf} published={published} />

          {published && rows.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">Duration (h)</th>
                  <th className="px-2 py-1.5 font-medium">T (yr)</th>
                  <th className="px-2 py-1.5 text-right font-medium">Site depth (mm)</th>
                  <th className="px-2 py-1.5 text-right font-medium">
                    ECCC {published.version} (mm)
                  </th>
                  <th className="px-2 py-1.5 text-right font-medium">Δ (%)</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {rows.map((r) => (
                  <tr key={`${r.dur}-${r.T}`} className="border-b border-border/40">
                    <td className="py-1 pr-2">{r.dur}</td>
                    <td className="px-2 py-1">{r.T}</td>
                    <td className="px-2 py-1 text-right">{r.site.toFixed(1)}</td>
                    <td className="px-2 py-1 text-right">{r.pub.toFixed(1)}</td>
                    <td className="px-2 py-1 text-right">
                      <Badge variant={Math.abs(r.delta) > 25 ? "flag" : "ok"}>
                        {r.delta >= 0 ? "+" : ""}
                        {r.delta.toFixed(1)}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!published && publishedQuery.isSuccess && (
            <p className="rounded-md border border-flag/40 bg-flag/5 p-2 text-xs">
              No ECCC-published IDF for this station — the site-specific
              analysis stands alone. Regional estimates join this panel in
              Phase 2.
            </p>
          )}

          <p className="text-[11px] text-muted-foreground">
            Differences between site-specific and published values commonly
            reflect record period, gauge type, and the fixed→true interval
            correction — document the chosen design value&apos;s rationale in
            the report.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
