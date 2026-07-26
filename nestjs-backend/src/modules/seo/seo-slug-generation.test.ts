import test from 'node:test';
import assert from 'node:assert/strict';
import { foldSeoAscii } from './seo-location.util';
import { buildProgrammaticSeoPath } from './programmatic-seo.util';

test('foldSeoAscii transliterates Czech diacritics', () => {
  assert.equal(foldSeoAscii('Praha'), 'praha');
  assert.equal(foldSeoAscii('České Budějovice'), 'ceske-budejovice');
  assert.equal(foldSeoAscii('Pronájem'), 'pronajem');
});

test('buildProgrammaticSeoPath creates unique paths per intent and location', () => {
  assert.equal(buildProgrammaticSeoPath('prodej-bytu', 'praha'), '/prodej-bytu/praha');
  assert.equal(buildProgrammaticSeoPath('pronajem-bytu', 'praha'), '/pronajem-bytu/praha');
  assert.equal(buildProgrammaticSeoPath('prodej-domu', 'ceske-budejovice'), '/prodej-domu/ceske-budejovice');
  assert.notEqual(
    buildProgrammaticSeoPath('prodej-bytu', 'praha'),
    buildProgrammaticSeoPath('pronajem-bytu', 'praha'),
  );
});

test('cursor pagination advances through unique location-intent pairs', () => {
  const intents = ['prodej-bytu', 'pronajem-bytu', 'prodej-domu'] as const;
  const cursors = [0, 1, 2, 3, 4, 5].map((c) => {
    const pair = {
      locationOffset: Math.floor(c / intents.length),
      intentIndex: c % intents.length,
    };
    return { cursor: c, ...pair, intent: intents[pair.intentIndex] };
  });
  assert.equal(cursors[0].locationOffset, 0);
  assert.equal(cursors[2].locationOffset, 0);
  assert.equal(cursors[3].locationOffset, 1);
  assert.equal(cursors[0].intent, 'prodej-bytu');
  assert.equal(cursors[1].intent, 'pronajem-bytu');
});
