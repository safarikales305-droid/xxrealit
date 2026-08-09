export type ContentApiAccessStatus =
  | 'AUTHORIZED'
  | 'UNAUTHORIZED'
  | 'QUOTA_EXCEEDED'
  | 'TEMPORARY_ERROR'
  | 'UNKNOWN';

export function isQuotaExceededMessage(text?: string | null): boolean {
  if (!text?.trim()) return false;
  return /quota\s*exceeded/i.test(text);
}

export function parseCatalogQueryParam(catalog?: string): boolean {
  if (catalog === '0' || catalog === 'false') return false;
  return true;
}

export function resolveContentApiAccessStatus(input: {
  contentApiOk: boolean;
  permissionDenied: boolean;
  quotaBlocked: boolean;
  lastFailedStatus?: number | null;
  lastFailedMessage?: string | null;
}): ContentApiAccessStatus {
  if (input.quotaBlocked) return 'QUOTA_EXCEEDED';
  if (input.permissionDenied) return 'UNAUTHORIZED';
  if (input.contentApiOk) return 'AUTHORIZED';

  const status = input.lastFailedStatus ?? 0;
  const message = input.lastFailedMessage ?? '';
  if (status === 403 && isQuotaExceededMessage(message)) return 'QUOTA_EXCEEDED';
  if (status === 401 || status === 403) return 'UNAUTHORIZED';
  if (status >= 500 || status === 429 || status === 408) return 'TEMPORARY_ERROR';
  if (status >= 400) return 'TEMPORARY_ERROR';
  return 'UNKNOWN';
}

export function shouldBlockContentApiRequest(input: {
  quotaBlocked: boolean;
  permissionDenied: boolean;
}): boolean {
  return input.quotaBlocked || input.permissionDenied;
}
