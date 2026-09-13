import type { ParsedFacebookGraphError } from './facebook-graph-autopost.util';

export type MetaGraphErrorKind =
  | 'RATE_LIMIT'
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'PERMISSION_MISSING'
  | 'META_TEMPORARY'
  | 'NOT_FOUND'
  | 'UNKNOWN';

export function isMetaGraphRateLimitError(
  error: Pick<ParsedFacebookGraphError, 'code' | 'message' | 'httpStatus'>,
): boolean {
  const lower = error.message.toLowerCase();
  return (
    error.code === 4 ||
    error.httpStatus === 429 ||
    lower.includes('application request limit') ||
    lower.includes('(#4)') ||
    lower.includes('rate limit')
  );
}

export function classifyMetaGraphError(
  error: Pick<ParsedFacebookGraphError, 'code' | 'message' | 'httpStatus' | 'error_subcode'>,
): MetaGraphErrorKind {
  if (isMetaGraphRateLimitError(error)) return 'RATE_LIMIT';
  if (error.code === 190) {
    if (error.error_subcode === 463 || error.error_subcode === 467) return 'TOKEN_EXPIRED';
    return 'TOKEN_INVALID';
  }
  const lower = error.message.toLowerCase();
  if (lower.includes('expired') || lower.includes('session has expired')) return 'TOKEN_EXPIRED';
  if (
    error.code === 200 ||
    error.code === 10 ||
    lower.includes('permission') ||
    lower.includes('pages_manage_posts')
  ) {
    return 'PERMISSION_MISSING';
  }
  if (error.httpStatus >= 500) return 'META_TEMPORARY';
  if (lower.includes('timeout') || lower.includes('temporarily unavailable')) return 'META_TEMPORARY';
  if (lower.includes('does not exist') || lower.includes('unsupported get request')) return 'NOT_FOUND';
  return 'UNKNOWN';
}

export function isMetaGraphAuthError(kind: MetaGraphErrorKind): boolean {
  return (
    kind === 'TOKEN_INVALID' ||
    kind === 'TOKEN_EXPIRED' ||
    kind === 'PERMISSION_MISSING'
  );
}
