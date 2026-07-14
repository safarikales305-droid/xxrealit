import type { MetaGraphResult } from './meta-graph-client.service';
import { extractMetaGraphErrorFields } from './meta-graph-error.util';

export const META_HOUSING_MIN_RADIUS_KM = 17;
export const META_HOUSING_TARGETING_ERROR_SUBCODE = '2909035';
export const META_HOUSING_RADIUS_ADJUSTED_MESSAGE =
  'Meta Housing vyžaduje minimálně 17 km. Radius byl automaticky upraven.';

export type MetaHousingGeoDebug = {
  cityKey: number | null;
  latitude: number;
  longitude: number;
  radius: number;
  distanceUnit: 'kilometer';
  radiusAdjusted: boolean;
  coordinateSource?: 'cache' | 'meta_search' | 'geocode' | 'input';
};

export function normalizeHousingRadiusKm(radiusKm: number): { radiusKm: number; adjusted: boolean } {
  const requested = radiusKm > 0 ? radiusKm : META_HOUSING_MIN_RADIUS_KM;
  if (requested < META_HOUSING_MIN_RADIUS_KM) {
    return { radiusKm: META_HOUSING_MIN_RADIUS_KM, adjusted: true };
  }
  return { radiusKm: requested, adjusted: false };
}

export function buildHousingCustomLocation(input: {
  latitude: number;
  longitude: number;
  radiusKm: number;
}): {
  latitude: number;
  longitude: number;
  radius: number;
  distance_unit: 'kilometer';
} {
  const { radiusKm } = normalizeHousingRadiusKm(input.radiusKm);
  return {
    latitude: input.latitude,
    longitude: input.longitude,
    radius: radiusKm,
    distance_unit: 'kilometer',
  };
}

export function buildHousingGeoTargeting(input: {
  latitude: number;
  longitude: number;
  radiusKm: number;
}): Record<string, unknown> {
  return {
    geo_locations: {
      custom_locations: [buildHousingCustomLocation(input)],
    },
  };
}

export function buildHousingGeoDebug(input: {
  cityKey: number | null;
  latitude: number;
  longitude: number;
  radiusKm: number;
  coordinateSource?: MetaHousingGeoDebug['coordinateSource'];
}): MetaHousingGeoDebug {
  const { radiusKm, adjusted } = normalizeHousingRadiusKm(input.radiusKm);
  return {
    cityKey: input.cityKey,
    latitude: input.latitude,
    longitude: input.longitude,
    radius: radiusKm,
    distanceUnit: 'kilometer',
    radiusAdjusted: adjusted,
    coordinateSource: input.coordinateSource,
  };
}

export function isMetaHousingTargetingError(result: MetaGraphResult<unknown>): boolean {
  if (result.ok) return false;
  const fields = extractMetaGraphErrorFields(result.data);
  return fields.error_subcode === META_HOUSING_TARGETING_ERROR_SUBCODE;
}

export function parseTargetingCityKeys(targeting: Record<string, unknown>): number[] {
  const geo = targeting.geo_locations;
  if (!geo || typeof geo !== 'object') return [];
  const cities = (geo as Record<string, unknown>).cities;
  if (!Array.isArray(cities)) return [];
  return cities
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const key = (entry as { key?: string | number }).key;
      const parsed = typeof key === 'number' ? key : Number.parseInt(String(key ?? ''), 10);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    })
    .filter((key): key is number => key != null);
}

export function mergeHousingTargeting(
  existing: Record<string, unknown>,
  housingGeo: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...existing,
    ...housingGeo,
  };
  if (Array.isArray(existing.custom_audiences)) {
    merged.custom_audiences = existing.custom_audiences;
  }
  return merged;
}

export async function convertTargetingCitiesToCustomLocations(
  targeting: Record<string, unknown>,
  resolveCoords: (cityKey: number) => Promise<{
    latitude: number;
    longitude: number;
    coordinateSource: MetaHousingGeoDebug['coordinateSource'];
  } | null>,
  radiusKm: number,
): Promise<{ targeting: Record<string, unknown>; housingGeoDebug: MetaHousingGeoDebug } | null> {
  const cityKeys = parseTargetingCityKeys(targeting);
  if (!cityKeys.length) return null;

  const cityKey = cityKeys[0];
  const coords = await resolveCoords(cityKey);
  if (!coords) return null;

  const housingGeo = buildHousingGeoTargeting({
    latitude: coords.latitude,
    longitude: coords.longitude,
    radiusKm,
  });
  const merged = mergeHousingTargeting(targeting, housingGeo);
  const housingGeoDebug = buildHousingGeoDebug({
    cityKey,
    latitude: coords.latitude,
    longitude: coords.longitude,
    radiusKm,
    coordinateSource: coords.coordinateSource,
  });

  return { targeting: merged, housingGeoDebug };
}
