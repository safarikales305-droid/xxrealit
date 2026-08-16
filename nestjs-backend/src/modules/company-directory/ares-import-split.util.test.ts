import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CompanyDirectoryCategory } from '@prisma/client';
import {
  buildAresSearchFilter,
  isPragueLocation,
  splitAresSearchFilter,
} from './ares-import-split.util';

describe('ares-import-split', () => {
  it('detects Prague location', () => {
    assert.equal(isPragueLocation('Praha', null), true);
    assert.equal(isPragueLocation('praha', 'Hlavní město Praha'), true);
    assert.equal(isPragueLocation('Pardubice', null), false);
  });

  it('splits Prague + construction into district sub-queries', () => {
    const base = buildAresSearchFilter({
      category: CompanyDirectoryCategory.STAVEBNICTVI,
      city: 'Praha',
      region: 'Hlavní město Praha',
    });
    const parts = splitAresSearchFilter(base, {
      city: 'Praha',
      region: 'Hlavní město Praha',
      category: CompanyDirectoryCategory.STAVEBNICTVI,
    });
    assert.ok(parts.length >= 23 * 3, `expected many sub-queries, got ${parts.length}`);
    assert.ok(parts.some((p) => p.sidlo?.nazevObce === 'Praha 1'));
    assert.ok(parts.some((p) => p.czNace?.includes('41')));
  });

  it('uses kodKraje for region filter', () => {
    const filter = buildAresSearchFilter({
      category: CompanyDirectoryCategory.STAVEBNICTVI,
      region: 'Pardubický kraj',
    });
    assert.equal(filter.sidlo?.kodKraje, 94);
    assert.ok(filter.czNace?.includes('41'));
  });
});
