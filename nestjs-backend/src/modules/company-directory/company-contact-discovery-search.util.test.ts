import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildContactDiscoverySearchQueries,
  normalizeCompanyNameForSearch,
  removeDiacritics,
  scoreWebsiteCandidate,
} from './company-contact-discovery-search.util';

test('normalizeCompanyNameForSearch strips legal suffix', () => {
  assert.equal(
    normalizeCompanyNameForSearch('Chládek a Tintěra, Pardubice a.s.'),
    'Chládek a Tintěra Pardubice',
  );
});

test('buildContactDiscoverySearchQueries includes ICO variants', () => {
  const queries = buildContactDiscoverySearchQueries({
    name: 'Chládek a Tintěra, Pardubice a.s.',
    ico: '25253361',
    city: 'Pardubice',
    region: 'Pardubický kraj',
  });
  assert.ok(queries.some((q) => q.includes('25253361')));
  assert.ok(queries.some((q) => q.toLowerCase().includes('pardubice')));
});

test('scoreWebsiteCandidate boosts ICO match', () => {
  const score = scoreWebsiteCandidate(
    { name: 'Chládek a Tintěra, Pardubice a.s.', ico: '25253361', city: 'Pardubice', region: null, phone: null },
    {
      url: 'https://www.chladek-tintera.cz',
      title: 'Chládek a Tintěra',
      snippet: 'IČO 25253361 Pardubice',
    },
  );
  assert.ok(score >= 0.5);
});

test('removeDiacritics', () => {
  assert.equal(removeDiacritics('Chládek'), 'Chladek');
});
