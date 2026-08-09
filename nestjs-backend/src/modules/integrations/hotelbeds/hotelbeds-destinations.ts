export type DestinationGeo = {
  label: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
};

const DESTINATIONS: Record<string, DestinationGeo> = {
  praha: { label: 'Praha', latitude: 50.0755, longitude: 14.4378, radiusKm: 15 },
  prague: { label: 'Praha', latitude: 50.0755, longitude: 14.4378, radiusKm: 15 },
  brno: { label: 'Brno', latitude: 49.1951, longitude: 16.6068, radiusKm: 12 },
  'karlovy-vary': { label: 'Karlovy Vary', latitude: 50.2319, longitude: 12.8719, radiusKm: 10 },
  'karlovy vary': { label: 'Karlovy Vary', latitude: 50.2319, longitude: 12.8719, radiusKm: 10 },
  'cesky-krumlov': { label: 'Český Krumlov', latitude: 48.8127, longitude: 14.3175, radiusKm: 8 },
  'český krumlov': { label: 'Český Krumlov', latitude: 48.8127, longitude: 14.3175, radiusKm: 8 },
};

export function resolveDestination(input?: string): DestinationGeo {
  const raw = (input ?? 'Praha').trim().toLowerCase();
  const slug = raw.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, '-');
  if (DESTINATIONS[raw]) return DESTINATIONS[raw];
  if (DESTINATIONS[slug]) return DESTINATIONS[slug];
  return { label: input?.trim() || 'Praha', latitude: 50.0755, longitude: 14.4378, radiusKm: 15 };
}

export function defaultSearchDates(): { checkIn: string; checkOut: string } {
  const checkIn = addDays(7);
  const checkOut = addDays(9);
  return { checkIn, checkOut };
}

function addDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
