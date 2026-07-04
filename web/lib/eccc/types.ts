/**
 * MSC GeoMet OGC API – Features types (verified live 2026-07-04, see README
 * endpoint-verification checklist). Field-name conventions differ by family:
 * climate-* collections use UPPER_CASE; ahccd-* use bilingual snake_case.
 */

export const GEOMET_BASE =
  process.env.GEOMET_BASE_URL ?? "https://api.weather.gc.ca";

/** Verified collection ids (spec A2). */
export const COLLECTIONS = {
  stations: "climate-stations",
  daily: "climate-daily",
  hourly: "climate-hourly",
  monthly: "climate-monthly",
  normals: "climate-normals",
  ahccdStations: "ahccd-stations",
  ahccdAnnual: "ahccd-annual",
  ahccdSeasonal: "ahccd-seasonal",
  ahccdMonthly: "ahccd-monthly",
  ahccdTrends: "ahccd-trends",
} as const;

export type CollectionKey = keyof typeof COLLECTIONS;
export type CollectionId = (typeof COLLECTIONS)[CollectionKey];

/** Pullable series collections offered in the Data tab. */
export const PULLABLE_COLLECTIONS: CollectionKey[] = [
  "daily",
  "hourly",
  "monthly",
  "normals",
  "ahccdAnnual",
  "ahccdMonthly",
];

export interface GeoJsonFeature<P = Record<string, unknown>> {
  type: "Feature";
  id?: string | number;
  geometry: { type: "Point"; coordinates: [number, number] } | null;
  properties: P;
}

export interface FeatureCollection<P = Record<string, unknown>> {
  type: "FeatureCollection";
  features: GeoJsonFeature<P>[];
  numberMatched?: number;
  numberReturned?: number;
}

/** climate-stations properties (subset we consume). */
export interface StationProps {
  STN_ID: number;
  STATION_NAME: string;
  PROV_STATE_TERR_CODE: string;
  /** String metres, e.g. "688.80". */
  ELEVATION: string | null;
  CLIMATE_IDENTIFIER: string;
  TC_IDENTIFIER: string | null;
  WMO_IDENTIFIER: string | null;
  FIRST_DATE: string | null;
  LAST_DATE: string | null;
  HLY_FIRST_DATE: string | null;
  HLY_LAST_DATE: string | null;
  DLY_FIRST_DATE: string | null;
  DLY_LAST_DATE: string | null;
  MLY_FIRST_DATE: string | null;
  MLY_LAST_DATE: string | null;
  HAS_MONTHLY_SUMMARY: "Y" | "N";
  HAS_NORMALS_DATA: "Y" | "N";
  HAS_HOURLY_DATA: "Y" | "N";
}

/** climate-daily properties (subset). */
export interface DailyProps {
  CLIMATE_IDENTIFIER: string;
  LOCAL_DATE: string;
  LOCAL_YEAR: number;
  LOCAL_MONTH: number;
  LOCAL_DAY: number;
  TOTAL_PRECIPITATION: number | null;
  TOTAL_PRECIPITATION_FLAG: string | null;
  TOTAL_RAIN: number | null;
  TOTAL_SNOW: number | null;
  SNOW_ON_GROUND: number | null;
  MAX_TEMPERATURE: number | null;
  MIN_TEMPERATURE: number | null;
  MEAN_TEMPERATURE: number | null;
  SPEED_MAX_GUST: number | null;
}

export interface FetchFeaturesOptions {
  /** Property equality filters, e.g. { CLIMATE_IDENTIFIER: "3031093" }. */
  filters?: Record<string, string | number>;
  /** OGC datetime: "start/end" (dates or RFC3339). */
  datetime?: string;
  /** bbox: [minLon, minLat, maxLon, maxLat]. */
  bbox?: [number, number, number, number];
  /** Server-side field selection — keeps payloads slim (verified working). */
  properties?: string[];
  sortby?: string;
  /** Hard cap on total features fetched across pages. */
  maxFeatures?: number;
}
