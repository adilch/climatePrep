"use client";

import {
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Reservoir polygon drawing (spec F3): click to add vertices; the polygon
 * closes automatically. Dependency-free (no leaflet-draw).
 */

export interface FetchRay {
  /** Bearing from the site, degrees clockwise from north (wind-toward + α). */
  bearingDeg: number;
  km: number;
  /** Saville weight cos²α — drives line opacity. */
  weight: number;
  central: boolean;
}

export interface ReservoirMapProps {
  site: { latitude: number; longitude: number };
  /** Vertices as [lon, lat] (GeoJSON order, matches sites.reservoir_polygon). */
  polygon: [number, number][];
  drawing: boolean;
  onAddVertex: (lonLat: [number, number]) => void;
  /** Saville radials from the latest fetch computation (hidden while drawing). */
  fetchRays?: FetchRay[];
}

const M_PER_DEG_LAT = (Math.PI / 180) * 6_371_008.8;

/** Endpoint of a ray from the site — same equirectangular plane the engine
 * uses for the fetch computation, so lines land exactly on the intersections. */
function rayEnd(
  site: { latitude: number; longitude: number },
  bearingDeg: number,
  km: number,
): [number, number] {
  const b = (bearingDeg * Math.PI) / 180;
  const dNorth = km * 1000 * Math.cos(b);
  const dEast = km * 1000 * Math.sin(b);
  return [
    site.latitude + dNorth / M_PER_DEG_LAT,
    site.longitude +
      dEast / (M_PER_DEG_LAT * Math.cos((site.latitude * Math.PI) / 180)),
  ];
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
  fetchRays,
}: ReservoirMapProps) {
  return (
    <MapContainer
      center={[site.latitude, site.longitude]}
      zoom={12}
      className={`h-[360px] w-full rounded-lg border border-border ${
        drawing ? "cursor-crosshair [&_.leaflet-grab]:!cursor-crosshair [&_.leaflet-interactive]:!cursor-crosshair" : ""
      }`}
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
          pathOptions={{
            color: "#0f766e",
            fillOpacity: drawing ? 0.08 : 0.15,
            weight: 2,
            dashArray: drawing ? "6 4" : undefined,
          }}
        />
      )}
      {/* Vertex dots give instant feedback from the very first click. */}
      {drawing &&
        polygon.map(([lon, lat], i) => (
          <CircleMarker
            key={`${lon}-${lat}-${i}`}
            center={[lat, lon]}
            radius={4}
            pathOptions={{ color: "#0f766e", fillColor: "#0f766e", fillOpacity: 1 }}
          />
        ))}
      {/* Saville fetch radials (spec F3): central ray emphasized; side rays
          fade with their cos²α weight. Hidden while drawing. */}
      {!drawing &&
        fetchRays
          ?.filter((r) => r.km > 0)
          .map((r) => (
            <Polyline
              key={r.bearingDeg}
              positions={[
                [site.latitude, site.longitude],
                rayEnd(site, r.bearingDeg, r.km),
              ]}
              pathOptions={{
                color: r.central ? "#D55E00" : "#0072B2",
                weight: r.central ? 3 : 1.5,
                opacity: r.central ? 0.95 : 0.25 + 0.6 * r.weight,
                dashArray: r.central ? undefined : "4 4",
              }}
            >
              <Tooltip direction="top" sticky>
                {`${r.central ? "central radial" : "radial"} · ${r.km.toFixed(2)} km @ ${r.bearingDeg.toFixed(0)}°`}
              </Tooltip>
            </Polyline>
          ))}
    </MapContainer>
  );
}
