import { safeNormalizePropertyFromApi, type PropertyFeedItem } from '@/types/property';

export type PropertyDetailAuthor = {
  id: string;
  email: string;
  name?: string | null;
  avatar?: string | null;
  role?: string;
};

export type PropertyDetailPayload = {
  property: Record<string, unknown>;
  user: PropertyDetailAuthor;
  otherProperties: unknown[];
};

export function normalizePropertyDetailPayload(
  raw: unknown,
): {
  property: PropertyFeedItem | null;
  user: PropertyDetailAuthor | null;
  other: PropertyFeedItem[];
} | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const userRaw = o.user;
  if (!userRaw || typeof userRaw !== 'object') return null;
  const u = userRaw as Record<string, unknown>;
  const id = typeof u.id === 'string' ? u.id : '';
  const email = typeof u.email === 'string' ? u.email : '';
  if (!id || !email) return null;

  const user: PropertyDetailAuthor = {
    id,
    email,
    name: typeof u.name === 'string' ? u.name : null,
    avatar: u.avatar === null || typeof u.avatar === 'string' ? u.avatar : null,
    role: typeof u.role === 'string' ? u.role : undefined,
  };

  const property = safeNormalizePropertyFromApi(o.property);
  const otherRaw = o.otherProperties;
  const other: PropertyFeedItem[] = [];
  if (Array.isArray(otherRaw)) {
    for (const item of otherRaw) {
      const n = safeNormalizePropertyFromApi(item);
      if (n) other.push(n);
    }
  }

  return { property, user, other };
}
