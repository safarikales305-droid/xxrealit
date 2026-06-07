import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NemovitostDetailView } from '@/components/nemovitost/NemovitostDetailView';
import { getServerSideApiBaseUrl } from '@/lib/api';
import { buildListingOpenGraphMetadata } from '@/lib/listing-og-metadata';
import { normalizePropertyDetailPayload } from '@/lib/property-detail';
import { fetchPropertyForOgMetadata } from '@/lib/property-public';
import { getServerAuthorizationHeader } from '@/lib/server-bearer';
import { ShareGateShell } from '@/components/share/ShareGateShell';
import { ShareListingInactive, ShareListingNotFound } from '@/components/share/ShareListingStatus';
import { fetchPublicListingShare } from '@/lib/listing-share-public';
import { PropertyDetailFetchError } from './fetch-error';

type Props = {
  params: Promise<{ id: string }>;
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const listing = await fetchPropertyForOgMetadata(id, 'classic');
  if (!listing) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('[og-metadata] fetch failed for', id, '— Facebook může zobrazit logo portálu');
    }
    return {
      title: 'Inzerát nemovitosti',
      robots: { index: true, follow: true },
    };
  }
  return buildListingOpenGraphMetadata(listing);
}

async function fetchPropertyDetail(
  id: string,
): Promise<{ ok: boolean; status: number; body: unknown | null }> {
  const apiBase = getServerSideApiBaseUrl();
  if (!apiBase) return { ok: false, status: 0, body: null };
  const authorization = await getServerAuthorizationHeader();
  const url = `${apiBase}/properties/${encodeURIComponent(id)}`;
  const res = await fetch(
    url,
    authorization
      ? {
          cache: 'no-store',
          headers: { Authorization: authorization },
        }
      : {
          next: { revalidate: 30 },
        },
  );

  if (res.status === 404) return { ok: false, status: 404, body: null };
  if (!res.ok) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.error('[property-detail] fetch failed', { id, status: res.status, url });
    }
    return { ok: false, status: res.status, body: null };
  }
  const body = await res.json().catch(() => null);
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.info('[property-detail] raw response keys', {
      id,
      keys: body && typeof body === 'object' ? Object.keys(body as object) : [],
    });
  }
  return { ok: true, status: 200, body };
}

function pickExtraFields(rawProp: unknown): Record<string, unknown> {
  if (!rawProp || typeof rawProp !== 'object') return {};
  const o = rawProp as Record<string, unknown>;
  const pick = (k: string) => o[k];
  return {
    area: pick('area'),
    landArea: pick('landArea'),
    floor: pick('floor'),
    totalFloors: pick('totalFloors'),
    propertyType: pick('propertyType'),
    offerType: pick('offerType') ?? pick('type'),
    condition: pick('condition'),
    energyLabel: pick('energyLabel'),
  };
}

function renderFromPublicShare(
  id: string,
  property: Record<string, unknown>,
  user: Record<string, unknown>,
) {
  const parsed = normalizePropertyDetailPayload(
    { property, user, otherProperties: [] },
    { listingId: id, devLog: true },
  );
  if (!parsed?.user || !parsed.property) return null;
  return (
    <ShareGateShell type="CLASSIC_LISTING" listingId={id}>
      <NemovitostDetailView
        propertyId={id}
        property={parsed.property}
        author={parsed.user}
        other={[]}
        extraFields={pickExtraFields(property)}
      />
    </ShareGateShell>
  );
}

export default async function NemovitostDetailPage({ params }: Props) {
  const { id } = await params;
  const publicShare = await fetchPublicListingShare(id, 'classic');
  if (!publicShare.ok) {
    if (publicShare.status === 410) {
      return <ShareListingInactive listingId={id} />;
    }
    if (publicShare.status === 404) {
      return (
        <ShareListingNotFound
          title="Inzerát nenalezen"
          message={publicShare.message}
          listingId={id}
        />
      );
    }
  }

  const result = await fetchPropertyDetail(id);

  if (result.status === 404 || (result.status === 0 && !result.body)) {
    if (publicShare.ok) {
      const fallback = renderFromPublicShare(id, publicShare.property, publicShare.user);
      if (fallback) return fallback;
    }
    notFound();
  }
  if (!result.ok || result.body == null) {
    if (publicShare.ok) {
      const fallback = renderFromPublicShare(id, publicShare.property, publicShare.user);
      if (fallback) return fallback;
    }
    return <PropertyDetailFetchError listingId={id} status={result.status || 502} />;
  }

  const parsed = normalizePropertyDetailPayload(result.body, {
    listingId: id,
    devLog: true,
  });

  if (!parsed?.user || !parsed.property) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('[property-detail] normalize failed', {
        id,
        hasUser: Boolean(parsed?.user),
        hasProperty: Boolean(parsed?.property),
      });
    }
    notFound();
  }

  const rawRoot =
    result.body && typeof result.body === 'object' ? (result.body as Record<string, unknown>) : {};
  const rawProperty = rawRoot.property ?? rawRoot.data;
  const extraFields = pickExtraFields(rawProperty);

  return (
    <ShareGateShell type="CLASSIC_LISTING" listingId={id}>
      <NemovitostDetailView
        propertyId={id}
        property={parsed.property}
        author={parsed.user}
        other={parsed.other}
        extraFields={extraFields}
      />
    </ShareGateShell>
  );
}
