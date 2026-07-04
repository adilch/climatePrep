"use client";

import { BASE_LAYOUT, OKABE_ITO, PlotlyLazy } from "./PlotlyLazy";

/**
 * Frequency plot (spec §4 chart conventions): quantile curves on a log
 * return-period axis, translucent CI band for the selected distribution,
 * observed AMS as plotting-position markers.
 */

interface Fit {
  key: string;
  label: string;
  curve: [number, number][];
  quantiles: {
    returnPeriod: number;
    value: number;
    ciLower: number | null;
    ciUpper: number | null;
  }[];
  fitError: string | null;
}

export function FrequencyPlot({
  durationHours,
  fits,
  plottingPositions,
  ciDistribution,
  unit = "mm",
}: {
  durationHours: number;
  fits: Fit[];
  plottingPositions: { returnPeriod: number; value: number; year: number }[];
  ciDistribution: string;
  unit?: string;
}) {
  const data: Plotly.Data[] = [];

  // CI band first (under everything).
  const ciFit = fits.find((f) => f.key === ciDistribution && !f.fitError);
  if (ciFit) {
    const withCi = ciFit.quantiles.filter(
      (q) => q.ciLower !== null && q.ciUpper !== null,
    );
    if (withCi.length > 1) {
      data.push({
        x: [...withCi.map((q) => q.returnPeriod), ...withCi.map((q) => q.returnPeriod).reverse()],
        y: [...withCi.map((q) => q.ciUpper!), ...withCi.map((q) => q.ciLower!).reverse()],
        fill: "toself",
        fillcolor: "rgba(0,114,178,0.12)",
        line: { width: 0 },
        hoverinfo: "skip",
        showlegend: true,
        name: `${ciFit.key.toUpperCase()} CI`,
        type: "scatter",
      });
    }
  }

  fits
    .filter((f) => !f.fitError)
    .forEach((f, i) => {
      data.push({
        x: f.curve.map((p) => p[0]),
        y: f.curve.map((p) => p[1]),
        mode: "lines",
        name: f.key.toUpperCase(),
        line: { color: OKABE_ITO[i % OKABE_ITO.length], width: f.key === ciDistribution ? 2.5 : 1.5 },
        type: "scatter",
      });
    });

  data.push({
    x: plottingPositions.map((p) => p.returnPeriod),
    y: plottingPositions.map((p) => p.value),
    mode: "markers",
    name: "Observed (Cunnane)",
    marker: { color: "#334155", size: 7, symbol: "circle-open", line: { width: 1.5 } },
    text: plottingPositions.map((p) => String(p.year)),
    hovertemplate: "T=%{x:.1f} yr · %{y:.1f} " + unit + " (%{text})<extra></extra>",
    type: "scatter",
  });

  return (
    <PlotlyLazy
      data={data}
      layout={{
        ...BASE_LAYOUT,
        title: { text: `Frequency plot — ${durationHours} h duration`, font: { size: 13 } },
        xaxis: {
          type: "log",
          title: { text: "Return period (years)" },
          range: [Math.log10(1.01), Math.log10(12000)],
          gridcolor: "#e2e8f0",
        },
        yaxis: {
          title: { text: `Precipitation depth (${unit})` },
          rangemode: "tozero",
          gridcolor: "#e2e8f0",
        },
        legend: { orientation: "h", y: -0.18 },
        height: 420,
      }}
      config={{ displaylogo: false, responsive: true }}
      style={{ width: "100%" }}
      useResizeHandler
    />
  );
}
