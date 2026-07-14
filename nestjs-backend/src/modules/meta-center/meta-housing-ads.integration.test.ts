import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHousingCustomLocation,
  buildHousingGeoTargeting,
  convertTargetingCitiesToCustomLocations,
  isMetaHousingTargetingError,
  META_HOUSING_MIN_RADIUS_KM,
  META_HOUSING_TARGETING_ERROR_SUBCODE,
  normalizeHousingRadiusKm,
  parseTargetingCityKeys,
} from './meta-housing-geo.util';

/**
 * Integrační test Housing Ads cílení — ověřuje celý řetězec:
 * city výběr → custom_locations (ne cities) → retry po 2909035.
 */
test('Housing Ads: city selection produces custom_locations with min 17 km radius', () => {
  const cityKey = 777934;
  const latitude = 50.0755;
  const longitude = 14.4378;
  const userRadiusKm = 10;

  const { radiusKm, adjusted } = normalizeHousingRadiusKm(userRadiusKm);
  assert.equal(radiusKm, META_HOUSING_MIN_RADIUS_KM);
  assert.equal(adjusted, true);

  const targeting = buildHousingGeoTargeting({ latitude, longitude, radiusKm });
  const geo = targeting.geo_locations as Record<string, unknown>;

  assert.ok(!('cities' in geo), 'Housing nesmí posílat geo_locations.cities');
  const custom = geo.custom_locations as Array<Record<string, unknown>>;
  assert.equal(custom.length, 1);
  assert.equal(custom[0].latitude, latitude);
  assert.equal(custom[0].longitude, longitude);
  assert.equal(custom[0].radius, META_HOUSING_MIN_RADIUS_KM);
  assert.equal(custom[0].distance_unit, 'kilometer');

  const adSetTargeting = JSON.stringify({ targeting });
  assert.ok(!adSetTargeting.includes('"cities"'), 'Ad Set targeting nesmí obsahovat cities');
  assert.ok(adSetTargeting.includes('"custom_locations"'));

  void cityKey;
});

test('Housing Ads: legacy cities payload converts on 2909035 retry', async () => {
  const legacyTargeting = {
    geo_locations: {
      cities: [{ key: 777934 }],
    },
  };

  assert.deepEqual(parseTargetingCityKeys(legacyTargeting), [777934]);

  const converted = await convertTargetingCitiesToCustomLocations(
    legacyTargeting,
    async () => ({
      latitude: 49.1951,
      longitude: 16.6068,
      coordinateSource: 'cache',
    }),
    15,
  );

  assert.ok(converted);
  const geo = converted!.targeting.geo_locations as Record<string, unknown>;
  assert.ok(!Array.isArray(geo.cities) || (geo.cities as unknown[]).length === 0);
  const custom = geo.custom_locations as Array<Record<string, unknown>>;
  assert.equal(custom[0].radius, META_HOUSING_MIN_RADIUS_KM);
  assert.equal(converted!.housingGeoDebug.cityKey, 777934);
  assert.equal(converted!.housingGeoDebug.distanceUnit, 'kilometer');
});

test('Housing Ads: Meta error 2909035 triggers retry path detection', () => {
  const housingError = {
    ok: false as const,
    httpStatus: 400,
    errorCode: '100',
    errorMessage: 'Invalid parameter',
    data: {
      error: {
        message: 'Housing Ads Targeting',
        error_subcode: Number(META_HOUSING_TARGETING_ERROR_SUBCODE),
      },
    },
    requestUrl: 'https://graph.facebook.com/v25.0/act_1/adsets',
    requestMethod: 'POST' as const,
  };

  assert.equal(isMetaHousingTargetingError(housingError), true);

  const retryPayload = {
    ...housingError,
    targeting: buildHousingGeoTargeting({
      latitude: 49.1951,
      longitude: 16.6068,
      radiusKm: META_HOUSING_MIN_RADIUS_KM,
    }),
  };

  const loc = buildHousingCustomLocation({
    latitude: 49.1951,
    longitude: 16.6068,
    radiusKm: META_HOUSING_MIN_RADIUS_KM,
  });
  assert.equal(loc.radius, 17);
  assert.equal(loc.distance_unit, 'kilometer');
  void retryPayload;
});

test('Housing Ads: remarketing merge preserves custom_audiences', async () => {
  const legacyTargeting = {
    geo_locations: { cities: [{ key: 12345 }] },
    custom_audiences: [{ id: 'aud_1' }],
  };

  const converted = await convertTargetingCitiesToCustomLocations(
    legacyTargeting,
    async () => ({
      latitude: 50.0,
      longitude: 14.0,
      coordinateSource: 'geocode',
    }),
    20,
  );

  assert.ok(converted);
  assert.deepEqual(converted!.targeting.custom_audiences, [{ id: 'aud_1' }]);
  const geo = converted!.targeting.geo_locations as Record<string, unknown>;
  assert.ok(Array.isArray(geo.custom_locations));
});
