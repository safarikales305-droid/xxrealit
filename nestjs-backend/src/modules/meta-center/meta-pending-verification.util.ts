import {
  extractMetaGraphErrorFields,
  type MetaGraphErrorBody,
} from './meta-graph-error.util';
import type { MetaLaunchSteps } from './meta-campaign-api-payload.util';

export const META_PENDING_VERIFICATION_STATUS = 'PENDING_META_VERIFICATION' as const;
export const META_PENDING_VERIFICATION_DB_STATUS = 'pending_meta_verification' as const;

export const META_ACCOUNT_QUALITY_URL = 'https://business.facebook.com/accountquality/';
export const META_ADS_MANAGER_URL = 'https://adsmanager.facebook.com/';

export const META_PENDING_VERIFICATION_TITLE =
  '⚠ Meta vyžaduje ověření reklamního účtu';

export const META_PENDING_VERIFICATION_BODY_AD_STEP = [
  'Meta dočasně zablokovala vytváření nových reklam z bezpečnostních důvodů.',
  '',
  'Kampaň, Ad Set i Creative byly úspěšně vytvořeny.',
  'Chybí pouze vytvoření samotné reklamy.',
  '',
  'Pro pokračování otevřete Správce reklam a dokončete ověření účtu.',
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
  errorUserTitle?: string | null;
  message?: string | null;
  response?: unknown;
}): boolean {
  if (input.errorCode === '31') return true;

  const title = (input.errorUserTitle ?? '').toLowerCase();
  if (title.includes('ověřte svůj účet')) return true;

  const message = (input.message ?? '').toLowerCase();
  if (message.includes('this request requires the user to take a pending action')) {
    return true;
  }

  if (input.response && typeof input.response === 'object') {
    const fields = extractMetaGraphErrorFields(input.response as MetaGraphErrorBody);
    if (fields.code === '31') return true;
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
