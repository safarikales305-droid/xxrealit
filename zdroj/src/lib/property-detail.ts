import {
  normalizeProperty,
  safeNormalizePropertyFromApi,
  type PropertyFeedItem,
  type PropertyFromApi,
} from '@/types/property';

export type PropertyDetailAuthor = {
  id: string;
  name?: string | null;
  phone?: string | null;
  phonePublic?: boolean;
  avatar?: string | null;
  role?: string;
};

export type PropertyDetailPayload = {
  property: Record<string, unknown>;
  user: PropertyDetailAuthor;
  otherProperties: unknown[];
};

function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length ? t : null;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v != null && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function pickUserFromDetail(
  root: Record<string, unknown>,
  property: Record<string, unknown> | null,
): PropertyDetailAuthor | null {
  const userRaw = root.user;
  const u = asRecord(userRaw);
  if (u) {
    const id = str(u.id) ?? '';
    if (id) {
      return {
        id,
        name: str(u.name),
        phone: str(u.phone),
        phonePublic: u.phonePublic === true,
        avatar: u.avatar === null ? null : str(u.avatar),
        role: typeof u.role === 'string' ? u.role : undefined,
      };
    }
  }
  if (property) {
    const uid = str(property.userId);
    if (uid) {
      return {
        id: uid,
        name: str(property.contactName),
        phone: str(property.contactPhone),
        phonePublic: true,
        avatar: null,
        role: undefined,
      };
    }
  }
  return null;
}

function normalizePropertyFromDetailShape(prop: Record<string, unknown>): PropertyFeedItem | null {
  const fromSafe =
    safeNormalizePropertyFromApi(prop) ??
    safeNormalizePropertyFromApi({
      ...prop,
      title: str(prop.title) || 'Inzerát bez názvu',
    });
  if (fromSafe) return fromSafe;
  const id = str(prop.id) ?? '';
  if (!id) return null;
  try {
    return normalizeProperty({
      id,
      title: str(prop.title) || 'Inzerát bez názvu',
      price: prop.price as PropertyFromApi['price'],
      city: typeof prop.city === 'string' ? prop.city : undefined,
      address:
        prop.address === null || typeof prop.address === 'string'
          ? (prop.address as string | null)
          : undefined,
      images: Array.isArray(prop.images) ? (prop.images as string[]) : [],
      media: Array.isArray(prop.media) ? (prop.media as PropertyFromApi['media']) : undefined,
      photos: Array.isArray(prop.photos) ? (prop.photos as PropertyFromApi['photos']) : undefined,
      description:
        prop.description === null || typeof prop.description === 'string'
          ? (prop.description as string | null)
          : undefined,
      userId: str(prop.userId) ?? undefined,
      contactName:
        prop.contactName === null || typeof prop.contactName === 'string'
          ? (prop.contactName as string | null)
          : undefined,
      contactPhone:
        prop.contactPhone === null || typeof prop.contactPhone === 'string'
          ? (prop.contactPhone as string | null)
          : undefined,
      contactEmail:
        prop.contactEmail === null || typeof prop.contactEmail === 'string'
          ? (prop.contactEmail as string | null)
          : undefined,
      videoUrl: prop.videoUrl as PropertyFromApi['videoUrl'],
      thumbnail: prop.thumbnail as PropertyFromApi['thumbnail'],
      imageUrl: prop.imageUrl as PropertyFromApi['imageUrl'],
      coverImage: prop.coverImage as PropertyFromApi['coverImage'],
      liked: typeof prop.liked === 'boolean' ? prop.liked : undefined,
      isOwnerListing: typeof prop.isOwnerListing === 'boolean' ? prop.isOwnerListing : undefined,
      directContactVisible:
        typeof prop.directContactVisible === 'boolean' ? prop.directContactVisible : undefined,
    });
  } catch {
    return null;
  }
}

/**
 * Mapuje odpověď GET /properties/:id na typy UI.
 * Odolné vůči chybějícím větvím (`user`, galerie, cena) a importovaným neúplným řádkům.
 */
export function normalizePropertyDetailPayload(
  raw: unknown,
  opts?: { listingId?: string; devLog?: boolean },
): {
  property: PropertyFeedItem | null;
  user: PropertyDetailAuthor | null;
  other: PropertyFeedItem[];
} | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const prop =
    asRecord(o.property) ??
    asRecord(o.data) ??
    asRecord((o.data as Record<string, unknown> | undefined)?.property);

  const user = pickUserFromDetail(o, prop);
  if (!user?.id) {
    if (opts?.devLog && process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('[property-detail] missing user', {
        listingId: opts.listingId,
        keys: Object.keys(o),
        hasProperty: Boolean(prop),
        propertyKeys: prop ? Object.keys(prop).slice(0, 40) : [],
      });
    }
    return null;
  }

  const property = prop ? normalizePropertyFromDetailShape(prop) : null;

  if (opts?.devLog && process.env.NODE_ENV === 'development') {
    const missing: string[] = [];
    if (!prop) missing.push('property');
    if (prop && !str(prop.id)) missing.push('property.id');
    if (prop && !str(prop.title) && !String(prop.title ?? '').trim()) missing.push('property.title');
    // eslint-disable-next-line no-console
    console.info('[property-detail] normalized', {
      listingId: opts.listingId,
      missing: missing.length ? missing : undefined,
      hasUser: true,
      hasPropertyRow: Boolean(property),
    });
  }

  const otherRaw = (o.otherProperties ?? o.other ?? o.similar) as unknown;
  const other: PropertyFeedItem[] = [];
  if (Array.isArray(otherRaw)) {
    for (const item of otherRaw) {
      const n = safeNormalizePropertyFromApi(item);
      if (n) other.push(n);
      else {
        const r = asRecord(item);
        if (r) {
          const fallback = safeNormalizePropertyFromApi({
            ...r,
            title: str(r.title) || 'Inzerát bez názvu',
          });
          if (fallback) other.push(fallback);
        }
      }
    }
  }

  return { property, user, other };
}
