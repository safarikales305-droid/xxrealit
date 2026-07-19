import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeoLocationSlug, foldSeoAscii, normalizeSeoLocationKind } from './seo-location.util';

test('foldSeoAscii removes diacritics', () => {
  assert.equal(foldSeoAscii('Hradec Králové'), 'hradec-kralove');
});

test('buildSeoLocationSlug creates ascii slug', () => {
  assert.equal(buildSeoLocationSlug('České Budějovice'), 'ceske-budejovice');
});

test('normalizeSeoLocationKind maps Czech labels', () => {
  assert.equal(normalizeSeoLocationKind('město'), 'MESTO');
  assert.equal(normalizeSeoLocationKind('KRAJ'), 'KRAJ');
});
