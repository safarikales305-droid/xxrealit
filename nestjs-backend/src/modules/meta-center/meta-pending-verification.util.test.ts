import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPendingVerificationLogEntry,
  buildPendingVerificationUserMessage,
  isMetaPendingVerificationError,
  META_PENDING_VERIFICATION_BODY_AD_STEP,
} from './meta-pending-verification.util';

test('isMetaPendingVerificationError detects error_code 31', () => {
  assert.equal(isMetaPendingVerificationError({ errorCode: '31' }), true);
});

test('isMetaPendingVerificationError detects Czech user title', () => {
  assert.equal(
    isMetaPendingVerificationError({ errorUserTitle: 'Ověřte svůj účet' }),
    true,
  );
});

test('isMetaPendingVerificationError detects pending action message', () => {
  assert.equal(
    isMetaPendingVerificationError({
      message: 'This request requires the user to take a pending action',
    }),
    true,
  );
});

test('isMetaPendingVerificationError reads fields from Graph response body', () => {
  assert.equal(
    isMetaPendingVerificationError({
      response: {
        error: {
          code: 31,
          message: 'Permissions error',
          error_user_title: 'Ověřte svůj účet',
        },
      },
    }),
    true,
  );
});

test('buildPendingVerificationUserMessage uses ad-step copy when assets exist', () => {
  const message = buildPendingVerificationUserMessage({
    campaign: { ok: true, id: 'c1' },
    adSet: { ok: true, id: 'a1' },
    creative: { ok: true, id: 'cr1' },
    ad: { ok: false },
  });
  assert.equal(message, META_PENDING_VERIFICATION_BODY_AD_STEP);
});

test('buildPendingVerificationLogEntry stores required audit fields', () => {
  const entry = buildPendingVerificationLogEntry({
    campaignId: 'camp_1',
    adSetId: 'adset_1',
    creativeId: 'creative_1',
    errorCode: '31',
    errorSubcode: '123',
    traceId: 'trace_abc',
    response: {
      error: {
        code: 31,
        error_subcode: 123,
        fbtrace_id: 'fbtrace_xyz',
        message: 'pending action',
      },
    },
    timestamp: new Date('2026-05-31T10:00:00.000Z'),
  });
  assert.equal(entry.status, 'PENDING_META_VERIFICATION');
  assert.equal(entry.campaignId, 'camp_1');
  assert.equal(entry.adSetId, 'adset_1');
  assert.equal(entry.creativeId, 'creative_1');
  assert.equal(entry.trace_id, 'trace_abc');
  assert.equal(entry.fbtrace_id, 'fbtrace_xyz');
  assert.equal(entry.error_code, '31');
  assert.equal(entry.error_subcode, '123');
  assert.equal(entry.timestamp, '2026-05-31T10:00:00.000Z');
});
