import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CompanyDirectoryCategory } from '@prisma/client';
import { mapAresActivitiesToCategories, naceCodesForCategory } from './ares-activity.mapper';
import { buildCompanySlug, parseIcoFromCompanySlug, slugifyCompanyName } from './company-directory.slug';

describe('company-directory slug', () => {
  it('builds stable slug with ico suffix', () => {
    const slug = buildCompanySlug('Stavební firma XY', '12345678', CompanyDirectoryCategory.STAVEBNICTVI);
    assert.equal(slug, 'stavebni-firma-xy-12345678');
    assert.equal(parseIcoFromCompanySlug(slug), '12345678');
  });

  it('slugifies diacritics', () => {
    assert.equal(slugifyCompanyName('Česká firma'), 'ceska-firma');
  });
});

describe('ares activity mapper', () => {
  it('maps construction nace prefix', () => {
    const cats = mapAresActivitiesToCategories(['41200'], CompanyDirectoryCategory.STAVEBNICTVI);
    assert.ok(cats.includes(CompanyDirectoryCategory.STAVEBNICTVI));
  });

  it('falls back to OTHER for unknown activities', () => {
    const cats = mapAresActivitiesToCategories(['00']);
    assert.deepEqual(cats, [CompanyDirectoryCategory.OSTATNI]);
  });

  it('returns nace codes for category', () => {
    assert.ok(naceCodesForCategory(CompanyDirectoryCategory.REALITY).length > 0);
  });
});
