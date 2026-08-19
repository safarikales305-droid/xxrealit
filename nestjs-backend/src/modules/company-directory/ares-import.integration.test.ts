import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aresRequestHash, responseIcoFingerprint } from './ares-request-hash.util';
import { buildNaceMasterPartitions } from './ares-master-partitions.util';
import { sanitizeAresRequestBody } from './ares-import-diagnostics.util';
import {
  ARES_IMPORT_BATCH_SIZE,
  ARES_IMPORT_BATCH_SIZE_OPTIONS,
  ARES_PAGE_SIZE,
} from './company-directory.constants';

describe('ares batch constants', () => {
  it('uses ARES page size 100 separate from worker batch default 500', () => {
    assert.equal(ARES_PAGE_SIZE, 100);
    assert.equal(ARES_IMPORT_BATCH_SIZE, 500);
    assert.ok(ARES_IMPORT_BATCH_SIZE_OPTIONS.includes(500));
  });

  it('batch size 500 implies 5 ARES pages per full worker batch', () => {
    const pagesPerBatch = Math.ceil(ARES_IMPORT_BATCH_SIZE / ARES_PAGE_SIZE);
    assert.equal(pagesPerBatch, 5);
  });
});

describe('ares-request-hash', () => {
  it('produces stable hash for equivalent filters', () => {
    const a = aresRequestHash({ start: 0, pocet: 100, czNace: ['42'], sidlo: { kodObce: 571768 } });
    const b = aresRequestHash({ pocet: 100, start: 0, sidlo: { kodObce: 571768 }, czNace: ['42'] });
    assert.equal(a, b);
  });

  it('fingerprints sorted unique ICO set', () => {
    const fp = responseIcoFingerprint(['12345678', '87654321', '12345678']);
    assert.equal(fp.length, 32);
  });
});

describe('nace master partitions', () => {
  it('builds many national NACE partitions without category', () => {
    const parts = buildNaceMasterPartitions(100);
    assert.ok(parts.length > 100);
    assert.ok(parts.every((p) => p.filter.czNace?.length === 1));
    assert.equal(parts.find((p) => p.naceCode === '42')?.label, 'nace=42');
  });
});

describe('ares search filter sanitize', () => {
  it('keeps kodObce in request body', () => {
    const body = sanitizeAresRequestBody({ start: 0, pocet: 100, sidlo: { kodObce: 571768 } });
    assert.equal(body.sidlo?.kodObce, 571768);
  });
});
