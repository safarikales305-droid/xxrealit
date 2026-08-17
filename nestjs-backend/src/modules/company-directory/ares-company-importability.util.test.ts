import assert from 'node:assert/strict';
import test from 'node:test';
import { getAresImportSkipReason } from './ares-company-importability.util';

test('skips liquidation in company name', () => {
  assert.equal(
    getAresImportSkipReason({
      ico: '12345678',
      obchodniJmeno: 'Test s.r.o. v likvidaci',
    }),
    'SKIPPED_LIQUIDATION',
  );
});

test('allows active company', () => {
  assert.equal(
    getAresImportSkipReason({
      ico: '12345678',
      obchodniJmeno: 'Test s.r.o.',
      seznamRegistraci: { stavZdrojeRos: 'AKTIVNI' },
    }),
    null,
  );
});
