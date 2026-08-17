import type { AresEconomicSubject } from './ares.types';

export type AresImportSkipReason =
  | 'SKIPPED_LIQUIDATION'
  | 'SKIPPED_DISSOLVED'
  | 'SKIPPED_INACTIVE';

export function getAresImportSkipReason(subject: AresEconomicSubject): AresImportSkipReason | null {
  const name = (subject.obchodniJmeno ?? '').toLowerCase();
  if (/\bv\s+likvidaci\b|\bv\s+likv\b/.test(name)) {
    return 'SKIPPED_LIQUIDATION';
  }

  const ros = subject.seznamRegistraci?.stavZdrojeRos?.toUpperCase() ?? '';
  const res = subject.seznamRegistraci?.stavZdrojeRes?.toUpperCase() ?? '';
  const combined = `${ros} ${res}`.trim();

  if (combined && !combined.includes('AKTIVNI')) {
    if (/ZANIK|VYMaz|VYMAZ|ZRUŠ|ZRUS|NEPLATN/i.test(combined)) {
      return 'SKIPPED_DISSOLVED';
    }
    if (/LIKVID|NEAKTIV|ZANIK/i.test(combined)) {
      return 'SKIPPED_INACTIVE';
    }
    return 'SKIPPED_INACTIVE';
  }

  return null;
}
