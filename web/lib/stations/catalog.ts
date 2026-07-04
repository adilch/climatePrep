import { fetchAllFeatures } from "@/lib/eccc/geomet";
import type { StationProps, GeoJsonFeature } from "@/lib/eccc/types";
import type { NewStation } from "@/lib/db/schema";

/**
 * Map a GeoMet climate-stations feature to a stations row (spec §5.5).
 * Coordinates MUST come from the GeoJSON geometry — the LATITUDE/LONGITUDE
 * properties are scaled integers (verified 2026-07-04).
 */
export function stationFeatureToRow(
  f: GeoJsonFeature<StationProps>,
): NewStation | null {
  const p = f.properties;
  if (!f.geometry || !p.CLIMATE_IDENTIFIER) return null;
  const [longitude, latitude] = f.geometry.coordinates;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const firstYear = yearOf(p.FIRST_DATE);
  const lastYear = yearOf(p.LAST_DATE);
  const elevation = p.ELEVATION != null ? Number(p.ELEVATION) : null;

  return {
    source: "msc_geomet",
    stnId: p.STN_ID ?? null,
    climateId: p.CLIMATE_IDENTIFIER,
    wmoId: p.WMO_IDENTIFIER ?? null,
    tcId: p.TC_IDENTIFIER ?? null,
    stationName: p.STATION_NAME ?? p.CLIMATE_IDENTIFIER,
    province: p.PROV_STATE_TERR_CODE ?? null,
    latitude,
    longitude,
    elevationM: Number.isFinite(elevation) ? elevation : null,
    firstYear,
    lastYear,
    recordLengthYears:
      firstYear !== null && lastYear !== null ? lastYear - firstYear + 1 : null,
    availableCollections: {
      daily: span(p.DLY_FIRST_DATE, p.DLY_LAST_DATE),
      hourly: span(p.HLY_FIRST_DATE, p.HLY_LAST_DATE),
      monthly: span(p.MLY_FIRST_DATE, p.MLY_LAST_DATE),
      hasMonthlySummary: p.HAS_MONTHLY_SUMMARY === "Y",
      hasNormals: p.HAS_NORMALS_DATA === "Y",
      hasHourly: p.HAS_HOURLY_DATA === "Y",
    },
    rawMetadata: p as unknown as Record<string, unknown>,
    catalogUpdatedAt: new Date(),
  };
}

function yearOf(date: string | null): number | null {
  if (!date) return null;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) && y > 1800 ? y : null;
}

function span(first: string | null, last: string | null) {
  if (!first || !last) return null;
  return { first: first.slice(0, 10), last: last.slice(0, 10) };
}

/** Fetch the full ECCC station catalog (one paged request; ~8 700 stations). */
export async function fetchStationCatalog(province?: string) {
  const { features, numberMatched, endpointUrl } =
    await fetchAllFeatures<StationProps>("stations", {
      filters: province ? { PROV_STATE_TERR_CODE: province } : {},
    });
  const rows = features
    .map(stationFeatureToRow)
    .filter((r): r is NewStation => r !== null);
  return { rows, numberMatched, endpointUrl };
}
