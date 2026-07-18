import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runMetaAdPreflightChecks,
  summarizePreflightChecks,
  type MetaGraphFetcher,
} from './meta-ad-preflight.util';
import type { MetaGraphResult } from './meta-graph-client.service';

function ok<T>(data: T): MetaGraphResult<T> {
  return {
    ok: true,
    data,
    httpStatus: 200,
    requestUrl: 'https://graph.facebook.com/v25.0/test',
    requestMethod: 'GET',
  };
}

function fail(message: string, code = '100'): MetaGraphResult<never> {
  return {
    ok: false,
    httpStatus: 400,
    errorCode: code,
    errorMessage: message,
    data: { error: { message, code: Number(code) } },
    requestUrl: 'https://graph.facebook.com/v25.0/test',
    requestMethod: 'GET',
  };
}

test('summarizePreflightChecks fails when any error severity check fails', () => {
  const summary = summarizePreflightChecks([
    { key: 'a', ok: true, severity: 'info', message: 'ok' },
    { key: 'b', ok: false, severity: 'error', message: 'creative wrong account' },
  ]);
  assert.equal(summary.ok, false);
  assert.match(summary.message, /creative wrong account/);
});

test('runMetaAdPreflightChecks blocks creative from different ad account', async () => {
  const graph: MetaGraphFetcher = {
    async get<T>(path: string): Promise<MetaGraphResult<T>> {
      if (path.startsWith('/act_')) {
        return ok({
          id: 'act_111',
          name: 'Test account',
          account_status: 1,
        }) as MetaGraphResult<T>;
      }
      if (path === '/me') return ok({ id: 'u1', name: 'User' }) as MetaGraphResult<T>;
      if (path === '/me/permissions') {
        return ok({
          data: [
            { permission: 'ads_management', status: 'granted' },
            { permission: 'ads_read', status: 'granted' },
            { permission: 'business_management', status: 'granted' },
            { permission: 'pages_read_engagement', status: 'granted' },
            { permission: 'pages_manage_ads', status: 'granted' },
          ],
        }) as MetaGraphResult<T>;
      }
      if (path === '/1122348867622129') {
        return ok({ id: '1122348867622129', name: 'XXrealit.cz', link: 'https://facebook.com/xxrealit' }) as MetaGraphResult<T>;
      }
      if (path === '/cr-wrong') {
        return ok({
          id: 'cr-wrong',
          account_id: 'act_999',
          status: 'ACTIVE',
          product_set_id: '1012438134826074',
          object_story_spec: { page_id: '1122348867622129' },
        }) as MetaGraphResult<T>;
      }
      if (path === '/as1') {
        return ok({
          id: 'as1',
          account_id: 'act_111',
          campaign_id: 'c1',
          effective_status: 'ACTIVE',
        }) as MetaGraphResult<T>;
      }
      if (path === '/1327331349483915') {
        return ok({ id: '1327331349483915', name: 'Catalog', business: { id: '1495460465477109' } }) as MetaGraphResult<T>;
      }
      if (path === '/1012438134826074') {
        return ok({
          id: '1012438134826074',
          name: 'Product set',
          product_catalog: { id: '1327331349483915' },
        }) as MetaGraphResult<T>;
      }
      return fail(`Unknown path ${path}`) as MetaGraphResult<T>;
    },
  };

  const checks = await runMetaAdPreflightChecks({
    graph,
    token: 'token',
    ctx: {
      adAccountId: 'act_111',
      businessId: '1495460465477109',
      pageId: '1122348867622129',
      catalogId: '1327331349483915',
      productSetId: '1012438134826074',
      campaignId: 'c1',
      adSetId: 'as1',
      creativeId: 'cr-wrong',
      graphApiVersion: 'v25.0',
    },
    tokenDebug: { is_valid: true, expires_at: 9999999999, scopes: ['ads_management'] },
  });

  const creativeCheck = checks.find((c) => c.key === 'creative');
  assert.equal(creativeCheck?.ok, false);
  assert.match(creativeCheck?.message ?? '', /jinému reklamnímu účtu/i);
  assert.equal(summarizePreflightChecks(checks).ok, false);
});

test('runMetaAdPreflightChecks treats HTTP 200 Graph error body as failure path via graph client contract', async () => {
  const graph: MetaGraphFetcher = {
    async get<T>(_path: string): Promise<MetaGraphResult<T>> {
      return fail('Invalid OAuth access token', '190') as MetaGraphResult<T>;
    },
  };
  const checks = await runMetaAdPreflightChecks({
    graph,
    token: 'bad-token',
    ctx: {
      adAccountId: 'act_111',
      businessId: null,
      pageId: null,
      catalogId: null,
      productSetId: null,
      campaignId: null,
      adSetId: null,
      creativeId: null,
      graphApiVersion: 'v25.0',
    },
  });
  assert.equal(checks.some((c) => c.key === 'ad_account' && !c.ok), true);
});

test('runMetaAdPreflightChecks warns on unsupported Graph API v25 fields without blocking', async () => {
  let pageCalls = 0;
  const graph: MetaGraphFetcher = {
    async get<T>(path: string, _token: string, query?: Record<string, string>): Promise<MetaGraphResult<T>> {
      if (path.startsWith('/act_')) {
        if (query?.fields?.includes('disable_reason')) {
          return fail('(#100) Tried accessing nonexistent field (disable_reason)', '100') as MetaGraphResult<T>;
        }
        return ok({
          id: 'act_111',
          name: 'Test account',
          account_status: 1,
        }) as MetaGraphResult<T>;
      }
      if (path === '/me') return ok({ id: 'u1', name: 'User' }) as MetaGraphResult<T>;
      if (path === '/me/permissions') {
        return ok({
          data: [
            { permission: 'ads_management', status: 'granted' },
            { permission: 'ads_read', status: 'granted' },
            { permission: 'business_management', status: 'granted' },
            { permission: 'pages_read_engagement', status: 'granted' },
            { permission: 'pages_manage_ads', status: 'granted' },
          ],
        }) as MetaGraphResult<T>;
      }
      if (path === '/1122348867622129') {
        pageCalls += 1;
        if (query?.fields === 'id,name,link') {
          return fail('(#100) Tried accessing nonexistent field (link)', '100') as MetaGraphResult<T>;
        }
        return ok({ id: '1122348867622129', name: 'XXrealit.cz' }) as MetaGraphResult<T>;
      }
      if (path === '/cr1') {
        return ok({
          id: 'cr1',
          account_id: 'act_111',
          status: 'ACTIVE',
          object_story_spec: { page_id: '1122348867622129' },
        }) as MetaGraphResult<T>;
      }
      if (path === '/as1') {
        return ok({
          id: 'as1',
          account_id: 'act_111',
          campaign_id: 'c1',
          effective_status: 'ACTIVE',
        }) as MetaGraphResult<T>;
      }
      return fail(`Unknown path ${path}`) as MetaGraphResult<T>;
    },
  };

  const checks = await runMetaAdPreflightChecks({
    graph,
    token: 'token',
    ctx: {
      adAccountId: 'act_111',
      businessId: null,
      pageId: '1122348867622129',
      catalogId: null,
      productSetId: null,
      campaignId: 'c1',
      adSetId: 'as1',
      creativeId: 'cr1',
      graphApiVersion: 'v25.0',
    },
    tokenDebug: { is_valid: true },
  });

  assert.equal(pageCalls, 2);
  const summary = summarizePreflightChecks(checks);
  assert.equal(summary.ok, true);
  assert.equal(summary.hasUnsupportedFieldsWarning, true);
  assert.match(summary.message, /diagnostická pole nejsou ve verzi Graph API v25 podporována/i);
  assert.equal(checks.some((c) => c.key === 'ad_account' && c.ok), true);
  assert.equal(checks.some((c) => c.key === 'page' && c.ok), true);
});
