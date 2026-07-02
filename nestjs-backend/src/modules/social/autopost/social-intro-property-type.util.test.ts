import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SocialIntroPropertyType } from '@prisma/client';
import {
  normalizePropertyType,
  resolveListingNormalizedType,
  resolveSocialIntroPropertyType,
  socialIntroEnumToNormalized,
} from './social-intro-property-type.util';

test('normalizePropertyType maps HOUSE and DUM to house', () => {
  assert.equal(normalizePropertyType('HOUSE'), 'house');
  assert.equal(normalizePropertyType('DUM'), 'house');
  assert.equal(normalizePropertyType('Dům'), 'house');
  assert.equal(normalizePropertyType('rodinny_dum'), 'house');
});

test('normalizePropertyType maps apartment variants', () => {
  assert.equal(normalizePropertyType('APARTMENT'), 'apartment');
  assert.equal(normalizePropertyType('BYT'), 'apartment');
  assert.equal(normalizePropertyType('Byt'), 'apartment');
});

test('normalizePropertyType maps land commercial garage other', () => {
  assert.equal(normalizePropertyType('LAND'), 'land');
  assert.equal(normalizePropertyType('POZEMEK'), 'land');
  assert.equal(normalizePropertyType('COMMERCIAL'), 'commercial');
  assert.equal(normalizePropertyType('KOMERCNI'), 'commercial');
  assert.equal(normalizePropertyType('GARAGE'), 'garage');
  assert.equal(normalizePropertyType('GARAZ'), 'garage');
  assert.equal(normalizePropertyType('OTHER'), 'other');
  assert.equal(normalizePropertyType('OSTATNI'), 'other');
});

test('socialIntroEnumToNormalized matches listing normalization', () => {
  assert.equal(socialIntroEnumToNormalized(SocialIntroPropertyType.DUM), 'house');
  assert.equal(normalizePropertyType('HOUSE'), socialIntroEnumToNormalized(SocialIntroPropertyType.DUM));
});

test('resolveListingNormalizedType prefers propertyTypeKey', () => {
  assert.equal(
    resolveListingNormalizedType({ propertyTypeKey: 'HOUSE', propertyType: 'byt' }),
    'house',
  );
});

test('resolveSocialIntroPropertyType maps house from DB key', () => {
  assert.equal(
    resolveSocialIntroPropertyType({ propertyTypeKey: 'HOUSE', offerType: 'prodej' }),
    SocialIntroPropertyType.DUM,
  );
});
