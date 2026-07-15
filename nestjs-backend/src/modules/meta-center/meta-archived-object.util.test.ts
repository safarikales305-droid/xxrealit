import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendMetaLaunchHistory,
  isMetaArchivedAdSetGraphError,
  isMetaObjectStatusUnusable,
  isMetaObjectUsableForLaunch,
} from './meta-archived-object.util';

test('isMetaObjectStatusUnusable detects ARCHIVED and DELETED', () => {
  assert.equal(isMetaObjectStatusUnusable('ARCHIVED'), true);
  assert.equal(isMetaObjectStatusUnusable('PAUSED', 'DELETED'), true);
  assert.equal(isMetaObjectStatusUnusable('ACTIVE', 'PAUSED'), false);
});

test('isMetaObjectUsableForLaunch rejects missing Graph data', () => {
  assert.equal(
    isMetaObjectUsableForLaunch({
      ok: false,
      status: null,
      effectiveStatus: null,
      name: null,
    }),
    false,
  );
});

test('isMetaArchivedAdSetGraphError detects code 100 subcode 1487860', () => {
  assert.equal(
    isMetaArchivedAdSetGraphError({
      errorCode: '100',
      errorSubcode: '1487860',
      message: 'Invalid parameter',
    }),
    true,
  );
});

test('isMetaArchivedAdSetGraphError detects archived ad set message', () => {
  assert.equal(
    isMetaArchivedAdSetGraphError({
      message: 'Invalid ad state for archived ad set',
    }),
    true,
  );
});

test('appendMetaLaunchHistory deduplicates lines', () => {
  const payloads: { launchHistory?: string[] } = {};
  appendMetaLaunchHistory(payloads, 'První řádek', 'První řádek', 'Druhý řádek');
  assert.deepEqual(payloads.launchHistory, ['První řádek', 'Druhý řádek']);
});
