"use client";

import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Station finder map (spec A1). Click drops the site pin; candidate stations
 * render as circle markers sized/coloured by state. CircleMarkers avoid
 * Leaflet's bundler marker-icon path issues entirely.
 */

export interface MapStation {
  id: string;
  stationName: string;
  climateId: string;
  latitude: number;
  longitude: number;
  selected?: boolean;
  highlighted?: boolean;
}

export interface StationMapProps {
  site: { latitude: number; longitude: number } | null;
  stations: MapStation[];
  onSiteChange: (lat: number, lon: number) => void;
  onStationClick?: (id: string) => void;
}

const SITE_ICON = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:#0f766e;transform:rotate(-45deg);border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 18],
});

function ClickHandler({ onSiteChange }: { onSiteChange: StationMapProps["onSiteChange"] }) {
  useMapEvents({
    click(e) {
      onSiteChange(
        Number(e.latlng.lat.toFixed(5)),
        Number(e.latlng.lng.toFixed(5)),
      );
    },
  });
  return null;
}

/** Recenter once when a site first appears (not on every render). */
function Recenter({ site }: { site: StationMapProps["site"] }) {
  const map = useMap();
  useEffect(() => {
    if (site) map.setView([site.latitude, site.longitude], Math.max(map.getZoom(), 9));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site?.latitude, site?.longitude]);
  return null;
}

export default function StationMap({
  site,
  stations,
  onSiteChange,
  onStationClick,
}: StationMapProps) {
  const center: [number, number] = site
    ? [site.latitude, site.longitude]
    : [51.05, -114.07]; // Calgary — sensible default for AB dam-safety work

  return (
    <MapContainer
      center={center}
      zoom={site ? 9 : 6}
      className="h-[420px] w-full rounded-lg border border-border"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onSiteChange={onSiteChange} />
      <Recenter site={site} />

      {stations.map((s) => (
        <CircleMarker
          key={s.id}
          center={[s.latitude, s.longitude]}
          radius={s.highlighted ? 9 : 6}
          pathOptions={{
            color: s.selected ? "#0f766e" : "#475569",
            fillColor: s.selected ? "#0f766e" : s.highlighted ? "#0d9488" : "#94a3b8",
            fillOpacity: s.selected ? 0.9 : 0.6,
            weight: s.selected || s.highlighted ? 2.5 : 1.5,
          }}
          eventHandlers={
            onStationClick ? { click: () => onStationClick(s.id) } : undefined
          }
        >
          <Tooltip direction="top" offset={[0, -6]}>
            <span className="font-medium">{s.stationName}</span>{" "}
            <span className="text-xs">({s.climateId})</span>
          </Tooltip>
        </CircleMarker>
      ))}

      {site && (
        <Marker position={[site.latitude, site.longitude]} icon={SITE_ICON}>
          <Tooltip direction="top" offset={[0, -18]}>
            Dam site
          </Tooltip>
        </Marker>
      )}
    </MapContainer>
  );
}
