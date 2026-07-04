"use client";

import dynamic from "next/dynamic";
import type { StationMapProps } from "./StationMap";

/** Leaflet touches `window` at import time — load the map client-side only. */
export const StationMapLazy = dynamic<StationMapProps>(
  () => import("./StationMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] w-full items-center justify-center rounded-lg border border-border bg-muted/40 text-sm text-muted-foreground">
        Loading map…
      </div>
    ),
  },
);
