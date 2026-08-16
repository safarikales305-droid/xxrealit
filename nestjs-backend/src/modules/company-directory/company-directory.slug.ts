import { CompanyDirectoryCategory } from '@prisma/client';
import { CATEGORY_SLUG_PREFIX } from './company-directory.constants';

export function slugifyCompanyName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function buildCompanySlug(
  name: string,
  ico: string,
  category?: CompanyDirectoryCategory | null,
): string {
  const prefix = category ? CATEGORY_SLUG_PREFIX[category] : 'firma';
  const base = slugifyCompanyName(name) || 'subjekt';
  const normalizedIco = ico.replace(/\D/g, '').padStart(8, '0');
  return `${prefix}-${base}-${normalizedIco}`;
}

export function parseIcoFromCompanySlug(slug: string): string | null {
  const m = /-(\d{8})$/.exec(slug);
  return m?.[1] ?? null;
}
