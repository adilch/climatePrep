"use client";

import { LMR_CURVES } from "@/lib/analyses/lmr-curves";
import { BASE_LAYOUT, OKABE_ITO, PlotlyLazy } from "./PlotlyLazy";

/**
 * L-moment ratio diagram (spec C2; Hosking & Wallis 1997 Fig 2.5):
 * sample (t3, t4) per duration against theoretical distribution curves.
 */
export function LmrDiagram({
  samples,
}: {
  samples: { durationHours: number; t3: number; t4: number }[];
}) {
  const data: Plotly.Data[] = [
    ...(["gev", "glo", "pe3"] as const).map((k, i) => ({
      x: LMR_CURVES[k].map((p) => p[0]),
      y: LMR_CURVES[k].map((p) => p[1]),
      mode: "lines" as const,
      name: k.toUpperCase(),
      line: { color: OKABE_ITO[i], width: 1.5 },
      type: "scatter" as const,
    })),
    {
      x: [LMR_CURVES.gumbel[0][0]],
      y: [LMR_CURVES.gumbel[0][1]],
      mode: "markers",
      name: "Gumbel",
      marker: { color: OKABE_ITO[4], size: 10, symbol: "diamond" },
      type: "scatter",
    },
    {
      x: samples.map((s) => s.t3),
      y: samples.map((s) => s.t4),
      mode: "text+markers",
      name: "Sample (per duration)",
      marker: { color: "#334155", size: 9, symbol: "circle-open", line: { width: 2 } },
      text: samples.map((s) => `${s.durationHours}h`),
      textposition: "top center",
      textfont: { size: 10 },
      type: "scatter",
    },
  ];

  return (
    <PlotlyLazy
      data={data}
      layout={{
        ...BASE_LAYOUT,
        title: { text: "L-moment ratio diagram", font: { size: 13 } },
        xaxis: { title: { text: "L-skewness (τ₃)" }, gridcolor: "#e2e8f0", range: [-0.1, 0.7] },
        yaxis: { title: { text: "L-kurtosis (τ₄)" }, gridcolor: "#e2e8f0", range: [0, 0.5] },
        legend: { orientation: "h", y: -0.2 },
        height: 400,
      }}
      config={{ displaylogo: false, responsive: true }}
      style={{ width: "100%" }}
      useResizeHandler
    />
  );
}
