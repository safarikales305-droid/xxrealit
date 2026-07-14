import test from 'node:test';
import assert from 'node:assert/strict';
import {
  META_HOUSING_MIN_RADIUS_KM,
  META_HOUSING_TARGETING_ERROR_SUBCODE,
  buildHousingCustomLocation,
  buildHousingGeoDebug,
  buildHousingGeoTargeting,
  convertTargetingCitiesToCustomLocations,
  isMetaHousingTargetingError,
  normalizeHousingRadiusKm,
  parseTargetingCityKeys,
} from './meta-housing-geo.util';

test('normalizeHousingRadiusKm clamps below minimum', () => {
  assert.deepEqual(normalizeHousingRadiusKm(10), {
    radiusKm: META_HOUSING_MIN_RADIUS_KM,
    adjusted: true,
  });
  assert.deepEqual(normalizeHousingRadiusKm(25), { radiusKm: 25, adjusted: false });
});

test('buildHousingGeoTargeting uses custom_locations only', () => {
  const targeting = buildHousingGeoTargeting({
    latitude: 50.0755,
    longitude: 14.4378,
    radiusKm: 15,
  });
  const geo = targeting.geo_locations as Record<string, unknown>;
  assert.ok(!('cities' in geo));
  const custom = geo.custom_locations as Array<Record<string, unknown>>;
  assert.equal(custom.length, 1);
  assert.equal(custom[0].latitude, 50.0755);
  assert.equal(custom[0].longitude, 14.4378);
  assert.equal(custom[0].radius, META_HOUSING_MIN_RADIUS_KM);
  assert.equal(custom[0].distance_unit, 'kilometer');
});

test('buildHousingGeoDebug exposes launch debug fields', () => {
  const debug = buildHousingGeoDebug({
    cityKey: 777934,
    latitude: 50.0755,
    longitude: 14.4378,
    radiusKm: 17,
    coordinateSource: 'cache',
  });
  assert.equal(debug.cityKey, 777934);
  assert.equal(debug.latitude, 50.0755);
  assert.equal(debug.longitude, 14.4378);
  assert.equal(debug.radius, 17);
  assert.equal(debug.distanceUnit, 'kilometer');
  assert.equal(debug.radiusAdjusted, false);
});

test('isMetaHousingTargetingError detects subcode 2909035', () => {
  assert.equal(
    isMetaHousingTargetingError({
      ok: false,
      httpStatus: 400,
      errorCode: '100',
      errorMessage: 'Invalid parameter',
      data: { error: { error_subcode: Number(META_HOUSING_TARGETING_ERROR_SUBCODE) } },
      requestUrl: 'https://graph.facebook.com/v25.0/act_1/adsets',
      requestMethod: 'POST',
    }),
    true,
  );
  assert.equal(
    isMetaHousingTargetingError({
      ok: false,
      httpStatus: 400,
      errorCode: '100',
      errorMessage: 'Other',
      data: { error: { error_subcode: 123 } },
      requestUrl: 'https://graph.facebook.com/v25.0/act_1/adsets',
      requestMethod: 'POST',
    }),
    false,
  );
});

test('convertTargetingCitiesToCustomLocations replaces cities with custom_locations', async () => {
  const converted = await convertTargetingCitiesToCustomLocations(
    { geo_locations: { cities: [{ key: '777934' }] } },
    async (cityKey) => {
      assert.equal(cityKey, 777934);
      return { latitude: 49.1951, longitude: 16.6068, coordinateSource: 'cache' };
    },
    17,
  );
  assert.ok(converted);
  const geo = converted!.targeting.geo_locations as Record<string, unknown>;
  assert.ok(!Array.isArray(geo.cities) || geo.cities.length === 0);
  const custom = geo.custom_locations as Array<Record<string, unknown>>;
  assert.equal(custom[0].radius, 17);
  assert.equal(converted!.housingGeoDebug.cityKey, 777934);
});

test('parseTargetingCityKeys reads numeric and string keys', () => {
  assert.deepEqual(parseTargetingCityKeys({ geo_locations: { cities: [{ key: 777934 }] } }), [777934]);
  assert.deepEqual(parseTargetingCityKeys({ geo_locations: { cities: [{ key: '777934' }] } }), [777934]);
});
