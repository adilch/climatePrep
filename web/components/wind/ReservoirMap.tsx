"use client";

import { MapContainer, Marker, Polygon, TileLayer, Tooltip, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Reservoir polygon drawing (spec F3): click to add vertices; the polygon
 * closes automatically. Dependency-free (no leaflet-draw).
 */

export interface ReservoirMapProps {
  site: { latitude: number; longitude: number };
  /** Vertices as [lon, lat] (GeoJSON order, matches sites.reservoir_polygon). */
  polygon: [number, number][];
  drawing: boolean;
  onAddVertex: (lonLat: [number, number]) => void;
}

const SITE_ICON = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:50% 50% 50% 0;background:#0f766e;transform:rotate(-45deg);border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 16],
});

function ClickCapture({
  drawing,
  onAddVertex,
}: Pick<ReservoirMapProps, "drawing" | "onAddVertex">) {
  useMapEvents({
    click(e) {
      if (drawing) {
        onAddVertex([
          Number(e.latlng.lng.toFixed(6)),
          Number(e.latlng.lat.toFixed(6)),
        ]);
      }
    },
  });
  return null;
}

export default function ReservoirMap({
  site,
  polygon,
  drawing,
  onAddVertex,
}: ReservoirMapProps) {
  return (
    <MapContainer
      center={[site.latitude, site.longitude]}
      zoom={12}
      className="h-[360px] w-full rounded-lg border border-border"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickCapture drawing={drawing} onAddVertex={onAddVertex} />
      <Marker position={[site.latitude, site.longitude]} icon={SITE_ICON}>
        <Tooltip direction="top" offset={[0, -16]}>Dam site</Tooltip>
      </Marker>
      {polygon.length >= 2 && (
        <Polygon
          positions={polygon.map(([lon, lat]) => [lat, lon] as [number, number])}
          pathOptions={{ color: "#0f766e", fillOpacity: 0.15, weight: 2 }}
        />
      )}
    </MapContainer>
  );
}
