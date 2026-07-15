import {
  extractMetaGraphErrorFields,
  type MetaGraphErrorBody,
} from './meta-graph-error.util';

export type MetaObjectLiveStatus = {
  ok: boolean;
  status: string | null;
  effectiveStatus: string | null;
  name: string | null;
};

export const META_ARCHIVED_AD_SET_HISTORY_LINES = [
  'Původní Ad Set archivován Meta.',
  'Byl vytvořen nový Ad Set.',
] as const;

export const META_ARCHIVED_CAMPAIGN_HISTORY_LINE =
  'Původní Campaign archivována Meta — bude vytvořena nová.';

const UNUSABLE_META_OBJECT_STATUSES = new Set(['ARCHIVED', 'DELETED']);

export function normalizeMetaObjectStatus(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return value.trim().toUpperCase();
}

export function isMetaObjectStatusUnusable(
  status: string | null | undefined,
  effectiveStatus?: string | null,
): boolean {
  const normalized = [
    normalizeMetaObjectStatus(status),
    normalizeMetaObjectStatus(effectiveStatus),
  ].filter((value): value is string => Boolean(value));
  return normalized.some((value) => UNUSABLE_META_OBJECT_STATUSES.has(value));
}

export function isMetaObjectUsableForLaunch(live: MetaObjectLiveStatus): boolean {
  if (!live.ok) return false;
  if (isMetaObjectStatusUnusable(live.status, live.effectiveStatus)) return false;
  return Boolean(live.status || live.effectiveStatus);
}

export function isMetaArchivedAdSetGraphError(input: {
  errorCode?: string | null;
  errorSubcode?: string | null;
  message?: string | null;
  errorUserMsg?: string | null;
  response?: unknown;
}): boolean {
  if (input.errorCode === '100' && input.errorSubcode === '1487860') {
    return true;
  }

  const combined = `${input.message ?? ''} ${input.errorUserMsg ?? ''}`.toLowerCase();
  if (combined.includes('invalid ad state for archived ad set')) {
    return true;
  }
  if (combined.includes('invalid parameter') && combined.includes('archived ad set')) {
    return true;
  }

  if (input.response && typeof input.response === 'object') {
    const fields = extractMetaGraphErrorFields(input.response as MetaGraphErrorBody);
    if (fields.code === '100' && fields.error_subcode === '1487860') {
      return true;
    }
    const responseText = `${fields.message ?? ''} ${fields.error_user_msg ?? ''}`.toLowerCase();
    if (responseText.includes('invalid ad state for archived ad set')) {
      return true;
    }
  }

  return false;
}

export function appendMetaLaunchHistory(
  launchPayloads: { launchHistory?: string[] | null },
  ...lines: string[]
): string[] {
  const existing = Array.isArray(launchPayloads.launchHistory)
    ? [...launchPayloads.launchHistory]
    : [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || existing.includes(trimmed)) continue;
    existing.push(trimmed);
  }
  launchPayloads.launchHistory = existing;
  return existing;
}
