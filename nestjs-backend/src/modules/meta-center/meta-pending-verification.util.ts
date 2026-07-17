import {
  extractMetaGraphErrorFields,
  type MetaGraphErrorBody,
} from './meta-graph-error.util';
import type { MetaLaunchSteps } from './meta-campaign-api-payload.util';

export const META_PENDING_VERIFICATION_STATUS = 'PENDING_META_VERIFICATION' as const;
export const META_PENDING_VERIFICATION_DB_STATUS = 'pending_meta_verification' as const;
export const META_PENDING_VERIFICATION_SUBCODE = '3858385';

export const META_ACCOUNT_QUALITY_URL = 'https://business.facebook.com/accountquality/';
export const META_ADS_MANAGER_URL = 'https://adsmanager.facebook.com/';
export const META_ADS_MANAGER_ACCOUNT_OVERVIEW_URL =
  'https://adsmanager.facebook.com/adsmanager/manage/campaigns';

export const META_PENDING_VERIFICATION_TITLE =
  '⚠ Meta z bezpečnostních důvodů blokuje vytvoření reklamy';

export const META_PENDING_VERIFICATION_BODY_AD_STEP = [
  'Meta z bezpečnostních důvodů blokuje vytvoření nebo úpravu reklamy.',
  'Campaign, sada reklam a kreativa jsou vytvořené správně.',
  'Dokončete požadovanou kontrolu ve Správci reklam a potom klikněte na Dokončit reklamu.',
].join('\n');

export const META_PENDING_VERIFICATION_BODY_GENERIC = [
  'Meta dočasně zablokovala vytváření nových reklam z bezpečnostních důvodů.',
  '',
  'Pro pokračování dokončete ověření reklamního účtu v Meta a zkuste akci znovu.',
].join('\n');

export type MetaPendingVerificationLogEntry = {
  status: typeof META_PENDING_VERIFICATION_STATUS;
  campaignId: string | null;
  adSetId: string | null;
  creativeId: string | null;
  trace_id: string | null;
  fbtrace_id: string | null;
  error_code: string | null;
  error_subcode: string | null;
  timestamp: string;
};

export function extractFbTraceId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const err = (body as MetaGraphErrorBody).error;
  if (!err || typeof err !== 'object') return null;
  return typeof err.fbtrace_id === 'string' ? err.fbtrace_id : null;
}

export function isMetaPendingVerificationError(input: {
  errorCode?: string | null;
  errorSubcode?: string | null;
  errorUserTitle?: string | null;
  message?: string | null;
  response?: unknown;
}): boolean {
  if (input.errorCode === '31') return true;
  if (input.errorSubcode === META_PENDING_VERIFICATION_SUBCODE) return true;

  const title = (input.errorUserTitle ?? '').toLowerCase();
  if (title.includes('ověřte svůj účet')) return true;

  const message = (input.message ?? '').toLowerCase();
  if (message.includes('this request requires the user to take a pending action')) {
    return true;
  }

  if (input.response && typeof input.response === 'object') {
    const fields = extractMetaGraphErrorFields(input.response as MetaGraphErrorBody);
    if (fields.code === '31') return true;
    if (fields.error_subcode === META_PENDING_VERIFICATION_SUBCODE) return true;
    if ((fields.error_user_title ?? '').toLowerCase().includes('ověřte svůj účet')) {
      return true;
    }
    if (
      (fields.message ?? '')
        .toLowerCase()
        .includes('this request requires the user to take a pending action')
    ) {
      return true;
    }
  }

  return false;
}

export type MetaPendingVerificationSupportBox = {
  businessId: string | null;
  adAccountId: string | null;
  pageId: string | null;
  catalogId: string | null;
  datasetId: string | null;
  errorCode: string;
  errorSubcode: string;
  traceId: string | null;
  graphApiVersion: string;
  failedEndpoint: string;
  supportText: string;
  copyBlock: string;
};

export const META_PENDING_VERIFICATION_SUPPORT_TEXT =
  'Meta Marketing API vrací OAuthException code 31, subcode 3858385 – This request requires the user to take a pending action. Campaign, Ad Set a Creative byly vytvořeny úspěšně, ale vytvoření objektu Ad je blokováno. V Account Quality není vidět žádné omezení. Prosíme o kontrolu a odstranění interní bezpečnostní akce na reklamním účtu.';

export function buildPendingVerificationSupportBox(input: {
  businessId?: string | null;
  adAccountId?: string | null;
  pageId?: string | null;
  catalogId?: string | null;
  datasetId?: string | null;
  traceId?: string | null;
  graphApiVersion?: string;
  failedEndpoint?: string;
}): MetaPendingVerificationSupportBox {
  const adAccountRaw = (input.adAccountId ?? '').replace(/^act_/, '');
  const failedEndpoint =
    input.failedEndpoint ??
    (adAccountRaw ? `POST /act_${adAccountRaw}/ads` : 'POST /act_{ad_account_id}/ads');
  const copyBlock = [
    `Business ID: ${input.businessId ?? '—'}`,
    `Ad Account ID: ${adAccountRaw || '—'}`,
    `Page ID: ${input.pageId ?? '—'}`,
    `Catalog ID: ${input.catalogId ?? '—'}`,
    `Dataset ID: ${input.datasetId ?? '—'}`,
    `Error code: 31`,
    `Error subcode: ${META_PENDING_VERIFICATION_SUBCODE}`,
    `Trace ID: ${input.traceId ?? '—'}`,
    `Graph API version: ${input.graphApiVersion ?? 'v25.0'}`,
    `Failed endpoint: ${failedEndpoint}`,
    '',
    META_PENDING_VERIFICATION_SUPPORT_TEXT,
  ].join('\n');

  return {
    businessId: input.businessId ?? null,
    adAccountId: adAccountRaw || null,
    pageId: input.pageId ?? null,
    catalogId: input.catalogId ?? null,
    datasetId: input.datasetId ?? null,
    errorCode: '31',
    errorSubcode: META_PENDING_VERIFICATION_SUBCODE,
    traceId: input.traceId ?? null,
    graphApiVersion: input.graphApiVersion ?? 'v25.0',
    failedEndpoint,
    supportText: META_PENDING_VERIFICATION_SUPPORT_TEXT,
    copyBlock,
  };
}

export function buildPendingVerificationUserMessage(launchSteps?: MetaLaunchSteps | null): string {
  const campaignOk = launchSteps?.campaign?.ok === true;
  const adSetOk = launchSteps?.adSet?.ok === true;
  const creativeOk = launchSteps?.creative?.ok === true;
  const adMissing = launchSteps?.ad?.ok !== true;

  if (campaignOk && adSetOk && creativeOk && adMissing) {
    return META_PENDING_VERIFICATION_BODY_AD_STEP;
  }
  return META_PENDING_VERIFICATION_BODY_GENERIC;
}

export function buildPendingVerificationLogEntry(input: {
  campaignId?: string | null;
  adSetId?: string | null;
  creativeId?: string | null;
  response?: unknown;
  errorCode?: string | null;
  errorSubcode?: string | null;
  traceId?: string | null;
  timestamp?: Date;
}): MetaPendingVerificationLogEntry {
  const fields =
    input.response && typeof input.response === 'object'
      ? extractMetaGraphErrorFields(input.response as MetaGraphErrorBody)
      : null;

  return {
    status: META_PENDING_VERIFICATION_STATUS,
    campaignId: input.campaignId ?? null,
    adSetId: input.adSetId ?? null,
    creativeId: input.creativeId ?? null,
    trace_id: input.traceId ?? fields?.trace_id ?? null,
    fbtrace_id: extractFbTraceId(input.response),
    error_code: input.errorCode ?? fields?.code ?? null,
    error_subcode: input.errorSubcode ?? fields?.error_subcode ?? null,
    timestamp: (input.timestamp ?? new Date()).toISOString(),
  };
}
