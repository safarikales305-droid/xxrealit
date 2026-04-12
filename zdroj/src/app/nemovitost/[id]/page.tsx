import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { NemovitostDetailView } from '@/components/nemovitost/NemovitostDetailView';
import { normalizePropertyDetailPayload } from '@/lib/property-detail';

type Props = {
  params: Promise<{ id: string }>;
};

async function fetchPropertyDetail(id: string): Promise<unknown | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const cookie = h.get('cookie') ?? '';
  const url = `${proto}://${host}/api/properties/${encodeURIComponent(id)}`;

  const res = await fetch(url, {
    cache: 'no-store',
    headers: cookie ? { cookie } : {},
  });

  if (res.status === 404) return null;
  if (!res.ok) return null;
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
