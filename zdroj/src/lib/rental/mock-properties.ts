export type PropertyType = 'byt' | 'dum' | 'pozemek';

export type MockProperty = {
  id: string;
  title: string;
  description: string;
  price: number | null;
  location: string;
  type: PropertyType;
  imageUrl: string;
};

export const MOCK_PROPERTIES: MockProperty[] = [
  {
    id: '1',
    title: 'Světlý 3+kk s balkonem',
    description:
      'Kompletně zrekonstruovaný byt v klidné části města, orientace na jih, sklep.',
    price: 6_890_000,
    location: 'Brno — Žabovřesky',
    type: 'byt',
    imageUrl: 'https://picsum.photos/seed/re1/800/520',
  },
  {
    id: '2',
    title: 'Rodinný dům se zahradou',
    description:
      'Dvoupodlažní dům 5+kk, garáž, zahrada 400 m², voda z obecního řadu.',
    price: 12_500_000,
    location: 'Praha — východ',
    type: 'dum',
    imageUrl: 'https://picsum.photos/seed/re2/800/520',
  },
  {
    id: '3',
    title: 'Stavební pozemek',
    description:
      'Rovinatý pozemek s platným územním rozhodnutím, příjezd z obecní cesty.',
    price: 3_200_000,
    location: 'Olomoucko',
    type: 'pozemek',
    imageUrl: 'https://picsum.photos/seed/re3/800/520',
  },
  {
    id: '4',
    title: 'Garsonka po rekonstrukci',
    description: 'Ideální pro investici nebo start, nízké náklady na bydlení.',
    price: 3_450_000,
    location: 'Ostrava — centrum',
    type: 'byt',
    imageUrl: 'https://picsum.photos/seed/re4/800/520',
  },
  {
    id: '5',
    title: 'Vila s bazénem',
    description: 'Luxusní vila 6+kk, bazén, zázemí pro domácí wellness.',
    price: 24_900_000,
    location: 'Praha — západ',
    type: 'dum',
    imageUrl: 'https://picsum.photos/seed/re5/800/520',
  },
  {
    id: '6',
    title: 'Lesní pozemek',
    description: 'Pozemek určený k rekreaci, část lesa, přístup z asfaltky.',
    price: 1_850_000,
    location: 'Vysočina',
    type: 'pozemek',
    imageUrl: 'https://picsum.photos/seed/re6/800/520',
  },
];

export const MY_LISTINGS_MOCK: MockProperty[] = [
  MOCK_PROPERTIES[0]!,
  MOCK_PROPERTIES[3]!,
];

export function getMockPropertyById(id: string): MockProperty | undefined {
  return MOCK_PROPERTIES.find((p) => p.id === id);
}

export function propertyTypeLabel(t: PropertyType): string {
  switch (t) {
    case 'byt':
      return 'Byt';
    case 'dum':
      return 'Dům';
    case 'pozemek':
      return 'Pozemek';
    default:
      return t;
  }
}

export function formatCzk(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
    return 'Cena na dotaz';
  }
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(n);
}
