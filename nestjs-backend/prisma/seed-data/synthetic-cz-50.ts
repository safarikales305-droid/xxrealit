/**
 * 50 syntetických českých demo inzerátů — texty a čísla jsou generované pro účely vývoje,
 * nejsou převzaty z jiných realitních portálů. Obrázky: picsum.photos (generické placeholdery).
 */

import type { ListingJson } from '../listing-seed-types';

const DEMO_VIDEO_MP4 =
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

type CityPack = { city: string; region: string; lat: number; lng: number };

const CITY_PACKS: CityPack[] = [
  { city: 'Praha', region: 'Hlavní město Praha', lat: 50.0755, lng: 14.4378 },
  { city: 'Brno', region: 'Jihomoravský kraj', lat: 49.1951, lng: 16.6068 },
  { city: 'Ostrava', region: 'Moravskoslezský kraj', lat: 49.8209, lng: 18.2625 },
  { city: 'Plzeň', region: 'Plzeňský kraj', lat: 49.7384, lng: 13.3736 },
  { city: 'Liberec', region: 'Liberecký kraj', lat: 50.7663, lng: 15.0543 },
  { city: 'Pardubice', region: 'Pardubický kraj', lat: 50.0343, lng: 15.7812 },
  { city: 'Hradec Králové', region: 'Královéhradecký kraj', lat: 50.2092, lng: 15.8328 },
  { city: 'Olomouc', region: 'Olomoucký kraj', lat: 49.5938, lng: 17.2509 },
  { city: 'České Budějovice', region: 'Jihočeský kraj', lat: 48.9745, lng: 14.4743 },
  { city: 'Jihlava', region: 'Kraj Vysočina', lat: 49.3962, lng: 15.5911 },
  { city: 'Zlín', region: 'Zlínský kraj', lat: 49.2265, lng: 17.6707 },
  { city: 'Ústí nad Labem', region: 'Ústecký kraj', lat: 50.6607, lng: 14.0323 },
  { city: 'Karlovy Vary', region: 'Karlovarský kraj', lat: 50.2329, lng: 12.8711 },
  { city: 'Mladá Boleslav', region: 'Středočeský kraj', lat: 50.4114, lng: 14.9032 },
  { city: 'Český Krumlov', region: 'Jihočeský kraj', lat: 48.8109, lng: 14.315 },
  { city: 'Třebíč', region: 'Kraj Vysočina', lat: 49.2148, lng: 15.8797 },
  { city: 'Kroměříž', region: 'Zlínský kraj', lat: 49.2988, lng: 17.393 },
  { city: 'Havířov', region: 'Moravskoslezský kraj', lat: 49.7798, lng: 18.4369 },
  { city: 'Opava', region: 'Moravskoslezský kraj', lat: 49.9387, lng: 17.9026 },
  { city: 'Kladno', region: 'Středočeský kraj', lat: 50.1473, lng: 14.1028 },
];

const AGENTS = [
  'Ing. Petra Dvořáková',
  'Bc. Tomáš Malina',
  'Mgr. Lenka Svobodová',
  'Jan Růžička',
  'Eliška Procházková',
  'Martin Černý',
  'Kateřina Horáková',
  'Ondřej Veselý',
  'Lucie Nováková',
  'Pavel Kratochvíl',
];

const AGENCIES = [
  'Demo Reality Portál s.r.o.',
  'XX Realitní partner',
  'Ukázková realitka ČR',
  'Syntetické nemovitosti a.s.',
  'Portálové listingy demo s.r.o.',
];

const CONDITIONS = [
  'novostavba',
  'velmi dobrý',
  'dobrý',
  'po částečné rekonstrukci',
  'před rekonstrukcí',
];

const ENERGY = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

function picsum(seed: string, w = 960, h = 640): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;
}

function withVideo(i: number): boolean {
  return i % 5 === 0 || i % 5 === 2 || i === 7 || i === 19 || i === 31;
}

function jitterCoord(base: number, i: number, isLat: boolean): number {
  const step = isLat ? 0.012 : 0.018;
  return Math.round((base + ((i % 7) - 3) * step) * 1e5) / 1e5;
}

function buildDescription(opts: {
  region: string;
  disposition: string;
  lat: number;
  lng: number;
  extras: string;
}): string {
  return [
    'Text je syntetický ukázkový obsah pro vývoj portálu — nejedná se o reálnou nabídku.',
    `Kraj / region: ${opts.region}. Dispozice / typ: ${opts.disposition}.`,
    `Orientační souřadnice (demo): ${opts.lat.toFixed(5)}, ${opts.lng.toFixed(5)}.`,
    opts.extras,
  ].join('\n\n');
}

export function getSyntheticCz50Listings(): ListingJson[] {
  const out: ListingJson[] = [];

  for (let i = 0; i < 50; i++) {
    const pack = CITY_PACKS[i % CITY_PACKS.length]!;
    const lat = jitterCoord(pack.lat, i, true);
    const lng = jitterCoord(pack.lng, i, false);
    const agent = AGENTS[i % AGENTS.length]!;
    const agency = AGENCIES[i % AGENCIES.length]!;
    const condition = CONDITIONS[i % CONDITIONS.length]!;
    const energy = ENERGY[i % ENERGY.length]!;
    const idTag = `synth-${i + 1}`;

    const streetNo = 10 + ((i * 17) % 180);
    const address = `Ukázková ${streetNo}, ${pack.city} (demo adresa)`;

    const imgSeed = `xxrealit-${idTag}`;
    const images = [picsum(`${imgSeed}-a`), picsum(`${imgSeed}-b`, 800, 533), picsum(`${imgSeed}-c`, 1024, 683)];

    const equipment = [
      `Realitní kancelář: ${agency}`,
      `Kontaktní makléř: ${agent}`,
      `Kraj: ${pack.region}`,
    ].join('\n');

    const createdAt = new Date(Date.now() - (50 - i) * 36 * 3600 * 1000).toISOString();

    let title = '';
    let description = '';
    let price = 0;
    let propertyType = 'byt';
    let offerType = 'prodej';
    let subType = '';
    let area: number | undefined;
    let landArea: number | undefined;
    let floor: number | undefined;
    let totalFloors: number | undefined;
    let parking = false;
    let cellar = false;
    let extras = '';

    if (i < 10) {
      // Byt — prodej
      offerType = 'prodej';
      propertyType = 'byt';
      const disp = ['1+kk', '1+1', '2+kk', '2+1', '3+kk', '3+1', '4+kk'][i % 7]!;
      subType = disp;
      area = 32 + (i % 8) * 7 + (i % 3) * 2;
      floor = 1 + (i % 11);
      totalFloors = 8 + (i % 6);
      price = 4_200_000 + i * 420_000 + (i % 5) * 95_000;
      parking = i % 2 === 0;
      cellar = i % 3 === 0;
      title = `Prodej bytu ${disp}, ${pack.city} — ukázkový listing ${i + 1}`;
      extras = `Panel / zděné jádro dle typu ukázky ${i + 1}. Balkon dle varianty. Vhodné k nastěhování po dohodě.`;
      description = buildDescription({
        region: pack.region,
        disposition: disp,
        lat,
        lng,
        extras,
      });
    } else if (i < 20) {
      // Byt — pronájem
      offerType = 'pronajem';
      propertyType = 'byt';
      const disp = ['1+kk', '2+kk', '2+1', '3+kk'][i % 4]!;
      subType = disp;
      area = 38 + (i % 6) * 5;
      floor = 2 + (i % 9);
      totalFloors = 6 + (i % 5);
      price = 14_500 + (i % 9) * 1_800 + (i % 4) * 500;
      parking = i % 2 === 1;
      title = `Pronájem bytu ${disp}, ${pack.city} — demo ${i + 1}`;
      extras = `Nájem uveden bez energií (demo). Kauce ve výši jednoho nájmu. Minimální doba nájmu dle dohody.`;
      description = buildDescription({
        region: pack.region,
        disposition: disp,
        lat,
        lng,
        extras,
      });
    } else if (i < 30) {
      // Rodinný dům
      offerType = 'prodej';
      propertyType = 'dum';
      subType = ['řadový', 'dvojdům', 'samostatně stojící', 'vila'][i % 4]!;
      area = 110 + (i % 12) * 12;
      landArea = 350 + (i % 15) * 45;
      floor = undefined;
      totalFloors = 2 + (i % 2);
      price = 7_800_000 + (i % 10) * 890_000;
      parking = true;
      cellar = i % 2 === 0;
      title = `Rodinný dům (${subType}), ${pack.city} — syntetická nabídka ${i + 1}`;
      extras = `Zahrada orientovaná dle varianty ukázky. Garáž nebo parkovací stání dle typu. Technický popis je ilustrativní.`;
      description = buildDescription({
        region: pack.region,
        disposition: subType,
        lat,
        lng,
        extras,
      });
    } else if (i < 40) {
      // Pozemek
      offerType = i % 4 === 0 ? 'pronajem' : 'prodej';
      propertyType = 'pozemek';
      subType = ['stavební', 'orná půda', 'zahrada', 'lesní'][i % 4]!;
      landArea = 520 + (i % 20) * 180;
      area = undefined;
      floor = undefined;
      totalFloors = undefined;
      price =
        offerType === 'pronajem'
          ? 8_000 + (i % 6) * 2_500
          : 1_150_000 + (i % 14) * 185_000;
      title =
        offerType === 'pronajem'
          ? `Pronájem pozemku (${subType}), okres ${pack.city} — demo ${i + 1}`
          : `Prodej pozemku (${subType}), ${pack.city} — demo ${i + 1}`;
      extras = `Inženýrské sítě dle lokality ukázky. Určení pozemku je pouze příklad pro vývoj mapy.`;
      description = buildDescription({
        region: pack.region,
        disposition: subType,
        lat,
        lng,
        extras,
      });
    } else {
      // Komerční prostor
      offerType = i % 3 === 0 ? 'pronajem' : 'prodej';
      propertyType = 'komerce';
      subType = ['kanceláře', 'obchod', 'sklad', 'provozovna', 'smíšené'][i % 5]!;
      area = 55 + (i % 18) * 22;
      landArea = i % 2 === 0 ? 200 + (i % 5) * 120 : undefined;
      floor = i % 5 === 0 ? undefined : 1 + (i % 4);
      totalFloors = floor != null ? 4 + (i % 4) : undefined;
      price =
        offerType === 'pronajem'
          ? 320 * area + (i % 7) * 4_000
          : 12_000_000 + (i % 8) * 2_100_000;
      parking = true;
      title =
        offerType === 'pronajem'
          ? `Pronájem komerčních prostor (${subType}), ${pack.city} — demo ${i + 1}`
          : `Prodej komerčního objektu (${subType}), ${pack.city} — demo ${i + 1}`;
      extras = `Vstup z ulice, výloha dle varianty. Energetický štítek a vytápění jsou ukázkové údaje.`;
      description = buildDescription({
        region: pack.region,
        disposition: subType,
        lat,
        lng,
        extras,
      });
    }

    out.push({
      title,
      description,
      price: Math.round(price),
      city: pack.city,
      address,
      approved: true,
      status: 'APPROVED',
      currency: 'CZK',
      offerType,
      propertyType,
      subType,
      area,
      landArea,
      floor,
      totalFloors,
      condition,
      construction: 'zděná',
      ownership: 'osobní',
      energyLabel: energy,
      equipment,
      parking,
      cellar,
      images,
      videoUrl: withVideo(i) ? DEMO_VIDEO_MP4 : null,
      contactName: agent,
      contactPhone: `+420 777 ${String(100 + (i % 900)).padStart(3, '0')} ${String((i * 13) % 1000).padStart(3, '0')}`,
      contactEmail: `demo-inzerat-${i + 1}@synthetic.local`,
      createdAt,
    });
  }

  return out;
}
