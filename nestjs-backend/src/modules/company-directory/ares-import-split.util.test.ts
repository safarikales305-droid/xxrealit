import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CompanyDirectoryCategory } from '@prisma/client';
import {
  buildAresSearchFilter,
  buildInitialPartitions,
  isPragueLocation,
  isWholeCountryRegion,
  subdivideNaceCode,
  splitAresSearchFilter,
  splitPartitionFurther,
} from './ares-import-split.util';

describe('ares-import-split', () => {
  it('detects whole country region', () => {
    assert.equal(isWholeCountryRegion('Celá ČR'), true);
    assert.equal(isWholeCountryRegion('čr'), true);
    assert.equal(isWholeCountryRegion('Pardubický kraj'), false);
  });

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
    assert.equal(filter.sidlo?.textovaAdresa, undefined);
  });

  it('whole country creates region partitions with category preserved', () => {
    const base = buildAresSearchFilter({
      category: CompanyDirectoryCategory.STAVEBNICTVI,
      region: 'Celá ČR',
    });
    const parts = buildInitialPartitions(base, {
      category: CompanyDirectoryCategory.STAVEBNICTVI,
      region: 'Celá ČR',
      wholeCountry: true,
    });
    assert.ok(parts.length >= 14 * 3, `expected >=42 partitions, got ${parts.length}`);
    assert.ok(parts.every((p) => p.filter.czNace?.length === 1));
    assert.ok(parts.every((p) => p.filter.sidlo?.kodKraje != null || p.filter.sidlo?.nazevObce?.startsWith('Praha')));
    assert.equal(parts.some((p) => p.filter.sidlo?.textovaAdresa === 'čr'), false);
  });

  it('region import returns a single partition without recursion', () => {
    const base = buildAresSearchFilter({
      category: CompanyDirectoryCategory.STAVEBNICTVI,
      region: 'Pardubický kraj',
    });
    const parts = buildInitialPartitions(base, {
      category: CompanyDirectoryCategory.STAVEBNICTVI,
      region: 'Pardubický kraj',
    });
    assert.equal(parts.length, 1);
    assert.equal(parts[0]?.filter.sidlo?.kodKraje, 94);
  });

  it('city import returns a single partition', () => {
    const base = buildAresSearchFilter({
      category: CompanyDirectoryCategory.STAVEBNICTVI,
      city: 'Pardubice',
      region: 'Pardubický kraj',
    });
    const parts = buildInitialPartitions(base, {
      category: CompanyDirectoryCategory.STAVEBNICTVI,
      city: 'Pardubice',
      region: 'Pardubický kraj',
    });
    assert.equal(parts.length, 1);
    assert.equal(parts[0]?.filter.sidlo?.nazevObce, 'Pardubice');
  });

  it('subdivides NACE 42 into finer codes', () => {
    const subs = subdivideNaceCode('42');
    assert.ok(subs.length > 1);
    assert.ok(subs.includes('421'));
  });

  it('splits Praha 1 + NACE 42 when geo exhausted', () => {
    const filter = buildAresSearchFilter({
      category: CompanyDirectoryCategory.STAVEBNICTVI,
      city: 'Praha 1',
      region: 'Hlavní město Praha',
    });
    filter.czNace = ['42'];
    const parts = splitPartitionFurther(
      filter,
      {
        category: CompanyDirectoryCategory.STAVEBNICTVI,
        city: 'Praha 1',
        region: 'Hlavní město Praha',
      },
      2,
    );
    assert.ok(parts.length > 1, `expected NACE split, got ${parts.length}`);
    assert.ok(parts.some((p) => p.filter.czNace?.includes('421')));
  });
});
