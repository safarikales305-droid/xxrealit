import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMetaAdCreatePayload } from './meta-ad-create-payload.util';
import { planMetaLaunchResume } from './meta-catalog-creative.util';
import {
  isMetaPendingVerificationError,
  META_PENDING_VERIFICATION_SUBCODE,
  buildPendingVerificationSupportBox,
} from './meta-pending-verification.util';

test('buildMetaAdCreatePayload serializes creative once for Meta form', () => {
  const bundle = buildMetaAdCreatePayload({
    name: 'pardubice — reklama',
    adSetId: '120247728538550403',
    creativeId: '1645922059842191',
    status: 'PAUSED',
  });
  assert.deepEqual(bundle.logical.creative, { creative_id: '1645922059842191' });
  assert.equal(bundle.metaPostBody.creative, JSON.stringify({ creative_id: '1645922059842191' }));
  assert.equal(bundle.metaForm.creative, JSON.stringify({ creative_id: '1645922059842191' }));
  assert.doesNotMatch(bundle.metaForm.creative, /^"\\"\{/);
});

test('planMetaLaunchResume creates only ad when upstream IDs exist', () => {
  const plan = planMetaLaunchResume({
    metaCampaignId: 'c1',
    metaAdSetId: 'as1',
    metaCreativeId: 'cr1',
    metaAdId: null,
  });
  assert.deepEqual(plan, {
    createCampaign: false,
    createAdSet: false,
    createCreative: false,
    createAd: true,
  });
});

test('planMetaLaunchResume skips all when ad exists', () => {
  const plan = planMetaLaunchResume({
    metaCampaignId: 'c1',
    metaAdSetId: 'as1',
    metaCreativeId: 'cr1',
    metaAdId: 'ad1',
  });
  assert.equal(plan.createAd, false);
});

test('isMetaPendingVerificationError detects subcode 3858385', () => {
  assert.equal(
    isMetaPendingVerificationError({ errorSubcode: META_PENDING_VERIFICATION_SUBCODE }),
    true,
  );
  assert.equal(
    isMetaPendingVerificationError({
      response: { error: { code: 31, error_subcode: 3858385 } },
    }),
    true,
  );
});

test('buildPendingVerificationSupportBox excludes access token', () => {
  const box = buildPendingVerificationSupportBox({
    businessId: '1495460465477109',
    adAccountId: 'act_4707060146067894',
    pageId: '1122348867622129',
    catalogId: '1327331349483915',
    datasetId: '2837910273226343',
    traceId: 'trace-abc',
    graphApiVersion: 'v25.0',
  });
  assert.match(box.copyBlock, /Error subcode: 3858385/);
  assert.match(box.copyBlock, /4707060146067894/);
  assert.doesNotMatch(box.copyBlock, /access_token/i);
  assert.doesNotMatch(box.copyBlock, /EAA/);
});
