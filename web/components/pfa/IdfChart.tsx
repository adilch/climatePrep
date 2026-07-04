"use client";

import { BASE_LAYOUT, OKABE_ITO, PlotlyLazy } from "./PlotlyLazy";

/**
 * IDF chart (spec C4/K5): log-log intensity vs duration, one line per return
 * period, translucent CI band, ECCC-published IDF as DISTINCT DASHED series
 * (spec §4). Site + published are directly comparable — both Gumbel.
 */

export interface SiteIdf {
  distribution: string;
  durationsHours: number[];
  returnPeriods: number[];
  cells: ({ intensity: number; ciLow: number | null; ciHigh: number | null } | null)[][];
}

export interface PublishedIdfChart {
  version: string;
  durations: { hours: number }[];
  returnPeriods: number[];
  intensitiesMmHr: (number | null)[][];
}

const SHOW_T = [2, 10, 100];

export function IdfChart({
  site,
  published,
}: {
  site: SiteIdf;
  published: PublishedIdfChart | null;
}) {
  const data: Plotly.Data[] = [];

  SHOW_T.forEach((T, ti) => {
    const rpIdx = site.returnPeriods.indexOf(T);
    if (rpIdx === -1) return;
    const color = OKABE_ITO[ti % OKABE_ITO.length];

    const xs: number[] = [];
    const ys: number[] = [];
    const lo: number[] = [];
    const hi: number[] = [];
    site.durationsHours.forEach((d, di) => {
      const cell = site.cells[di][rpIdx];
      if (!cell) return;
      xs.push(d);
      ys.push(cell.intensity);
      if (cell.ciLow !== null && cell.ciHigh !== null) {
        lo.push(cell.ciLow);
        hi.push(cell.ciHigh);
      }
    });

    if (lo.length === xs.length && xs.length > 1) {
      data.push({
        x: [...xs, ...[...xs].reverse()],
        y: [...hi, ...[...lo].reverse()],
        fill: "toself",
        fillcolor: color + "1f",
        line: { width: 0 },
        hoverinfo: "skip",
        showlegend: false,
        type: "scatter",
      });
    }
    data.push({
      x: xs,
      y: ys,
      mode: "lines+markers",
      name: `T=${T} yr (site)`,
      line: { color, width: 2 },
      marker: { size: 6 },
      type: "scatter",
    });

    if (published) {
      const pIdx = published.returnPeriods.indexOf(T);
      if (pIdx !== -1) {
        const px: number[] = [];
        const py: number[] = [];
        published.durations.forEach((d, di) => {
          const v = published.intensitiesMmHr[di][pIdx];
          if (v !== null) {
            px.push(d.hours);
            py.push(v);
          }
        });
        data.push({
          x: px,
          y: py,
          mode: "lines",
          name: `T=${T} yr (ECCC ${published.version})`,
          line: { color, width: 1.5, dash: "dash" },
          type: "scatter",
        });
      }
    }
  });

  return (
    <PlotlyLazy
      data={data}
      layout={{
        ...BASE_LAYOUT,
        title: {
          text: `IDF — site-specific (${site.distribution.toUpperCase()}, solid) vs ECCC published (dashed)`,
          font: { size: 13 },
        },
        xaxis: {
          type: "log",
          title: { text: "Duration (h)" },
          gridcolor: "#e2e8f0",
        },
        yaxis: {
          type: "log",
          title: { text: "Intensity (mm/h)" },
          gridcolor: "#e2e8f0",
        },
        legend: { orientation: "h", y: -0.2 },
        height: 440,
      }}
      config={{ displaylogo: false, responsive: true }}
      style={{ width: "100%" }}
      useResizeHandler
    />
  );
}
