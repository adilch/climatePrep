/**
 * Station ranking for the finder (spec A1): candidates ranked by distance,
 * record length, and elevation difference — elevation matters in the Alberta
 * foothills, where a valley-floor gauge 10 km away can be less representative
 * than a bench station 20 km away.
 *
 * The score is deliberately simple and transparent (it appears in reports):
 *   score = wD·distScore + wR·recordScore + wE·elevScore   ∈ [0, 1]
 *   distScore   = max(0, 1 − d/dMax)           (linear decay to dMax km)
 *   recordScore = min(1, years/yearsFull)       (saturates at yearsFull)
 *   elevScore   = max(0, 1 − |Δelev|/elevMax)   (1 when unknown → no penalty,
 *                                                flagged in the UI instead)
 */

export interface RankWeights {
  distance: number;
  record: number;
  elevation: number;
}

export interface RankParams {
  weights: RankWeights;
  /** Distance (km) at which distScore reaches 0. */
  dMaxKm: number;
  /** Record length (years) at which recordScore saturates at 1. */
  yearsFull: number;
  /** |Δelev| (m) at which elevScore reaches 0. */
  elevMaxM: number;
}

export const DEFAULT_RANK_PARAMS: RankParams = {
  weights: { distance: 0.5, record: 0.3, elevation: 0.2 },
  dMaxKm: 150,
  yearsFull: 60,
  elevMaxM: 500,
};

const EARTH_RADIUS_KM = 6371.0088;

/** Great-circle distance (haversine), km. */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface RankableStation {
  latitude: number;
  longitude: number;
  elevationM: number | null;
  recordLengthYears: number | null;
}

export interface RankComponents {
  distanceKm: number;
  elevationDiffM: number | null;
  recordLengthYears: number;
  distScore: number;
  recordScore: number;
  elevScore: number;
  score: number;
}

export function rankStation(
  site: { latitude: number; longitude: number; elevationM?: number | null },
  station: RankableStation,
  params: RankParams = DEFAULT_RANK_PARAMS,
): RankComponents {
  const distanceKm = haversineKm(
    site.latitude,
    site.longitude,
    station.latitude,
    station.longitude,
  );
  const years = station.recordLengthYears ?? 0;

  const elevationDiffM =
    site.elevationM != null && station.elevationM != null
      ? station.elevationM - site.elevationM
      : null;

  const distScore = Math.max(0, 1 - distanceKm / params.dMaxKm);
  const recordScore = Math.min(1, years / params.yearsFull);
  const elevScore =
    elevationDiffM === null
      ? 1 // unknown elevation is not penalized; the UI flags it instead
      : Math.max(0, 1 - Math.abs(elevationDiffM) / params.elevMaxM);

  const { distance: wD, record: wR, elevation: wE } = params.weights;
  const score = wD * distScore + wR * recordScore + wE * elevScore;

  return {
    distanceKm,
    elevationDiffM,
    recordLengthYears: years,
    distScore,
    recordScore,
    elevScore,
    score,
  };
}
