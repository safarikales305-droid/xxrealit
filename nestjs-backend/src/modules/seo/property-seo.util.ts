/**
 * Generuje SEO slug z názvu inzerátu.
 * "Prodej bytu 3+kk Brno" → "prodej-bytu-3kk-brno"
 */
export function generatePropertySlug(title: string, city?: string | null): string {
  const base = [title, city].filter(Boolean).join(' ');
  return base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+\s-]/g, '')
    .replace(/\+/g, 'plus')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

export function buildListingSeoTitle(input: {
  title: string;
  city?: string | null;
  price?: number | null;
  currency?: string | null;
}): string {
  const pricePart =
    input.price != null && input.price > 0
      ? ` | ${new Intl.NumberFormat('cs-CZ').format(input.price)} ${input.currency ?? 'Kč'}`
      : '';
  const cityPart = input.city?.trim() ? ` ${input.city.trim()}` : '';
  return `${input.title.trim()}${cityPart}${pricePart} | XXREALIT`;
}

export function buildListingSeoDescription(input: {
  title: string;
  city?: string | null;
  description?: string | null;
  offerType?: string | null;
  propertyType?: string | null;
}): string {
  const parts = [
    `${input.offerType ?? 'Prodej'} ${input.propertyType ?? 'nemovitosti'}${input.city ? ` v ${input.city}` : ''}.`,
    (input.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 140),
    'Fotografie, video, mapa, kontakt na makléře.',
  ].filter(Boolean);
  return parts.join(' ').slice(0, 300);
}

export function buildListingSeoKeywords(input: {
  city?: string | null;
  offerType?: string | null;
  propertyType?: string | null;
  title?: string | null;
}): string[] {
  const keys = new Set<string>();
  if (input.city) keys.add(input.city.toLowerCase());
  if (input.offerType) keys.add(input.offerType.toLowerCase());
  if (input.propertyType) keys.add(input.propertyType.toLowerCase());
  keys.add('nemovitosti');
  keys.add('reality');
  keys.add('xxrealit');
  (input.title ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5)
    .forEach((w) => keys.add(w));
  return [...keys];
}

export async function ensureUniquePropertySlug(
  prisma: { property: { findFirst: (args: unknown) => Promise<{ id: string } | null> } },
  baseSlug: string,
  excludeId?: string,
): Promise<string> {
  let slug = baseSlug || 'inzerat';
  let n = 0;
  while (true) {
    const candidate = n === 0 ? slug : `${slug}-${n}`;
    const existing = await prisma.property.findFirst({
      where: {
        slug: candidate,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return candidate;
    n += 1;
  }
}
