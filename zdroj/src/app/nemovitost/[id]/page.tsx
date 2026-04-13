import { notFound } from 'next/navigation';
import { NemovitostDetailView } from '@/components/nemovitost/NemovitostDetailView';
import { getServerSideApiBaseUrl } from '@/lib/api';
import { normalizePropertyDetailPayload } from '@/lib/property-detail';
import { getServerAuthorizationHeader } from '@/lib/server-bearer';

type Props = {
  params: Promise<{ id: string }>;
};

async function fetchPropertyDetail(id: string): Promise<unknown | null> {
  const apiBase = getServerSideApiBaseUrl();
  if (!apiBase) return null;
  const authorization = await getServerAuthorizationHeader();
  const url = `${apiBase}/properties/${encodeURIComponent(id)}`;
  const res = await fetch(url, authorization
    ? {
        cache: 'no-store',
        headers: { Authorization: authorization },
      }
    : {
        next: { revalidate: 30 },
      });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error('PROPERTY_DETAIL_FETCH_FAILED');
  }
  return res.json().catch(() => null);
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

export default async function NemovitostDetailPage({ params }: Props) {
  const { id } = await params;
  const raw = await fetchPropertyDetail(id);
  if (!raw) {
    notFound();
  }
  const parsed = normalizePropertyDetailPayload(raw);

  if (!parsed?.property || !parsed.user) {
    notFound();
  }

  const rawRoot = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rawProperty = rawRoot.property;
  const extraFields = pickExtraFields(rawProperty);

  return (
    <NemovitostDetailView
      propertyId={id}
      property={parsed.property}
      author={parsed.user}
      other={parsed.other}
      extraFields={extraFields}
    />
  );
}
