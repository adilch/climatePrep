"use client";

import dynamic from "next/dynamic";
import type { PlotParams } from "react-plotly.js";

/**
 * Client-only Plotly (plotly.js touches `window`/`document` at import).
 * Chart conventions (spec §4): Okabe-Ito colorblind-safe palette, units in
 * axis titles, CI bands as translucent fills, ECCC reference series dashed.
 */
export const PlotlyLazy = dynamic(
  async () => {
    const [{ default: createPlotlyComponent }, Plotly] = await Promise.all([
      import("react-plotly.js/factory"),
      import("plotly.js-dist-min"),
    ]);
    return createPlotlyComponent(Plotly.default ?? Plotly);
  },
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[380px] w-full items-center justify-center rounded-md border border-border bg-muted/30 text-sm text-muted-foreground">
        Loading chart…
      </div>
    ),
  },
) as React.ComponentType<PlotParams>;

/** Okabe-Ito palette (colorblind-safe) keyed to distribution order. */
export const OKABE_ITO = [
  "#0072B2", // blue
  "#D55E00", // vermillion
  "#009E73", // green
  "#CC79A7", // pink
  "#E69F00", // orange
  "#56B4E9", // sky
  "#F0E442", // yellow
];

export const BASE_LAYOUT: Partial<Plotly.Layout> = {
  font: { family: "Inter, system-ui, sans-serif", size: 12 },
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  margin: { l: 60, r: 20, t: 36, b: 48 },
  hovermode: "closest",
};
