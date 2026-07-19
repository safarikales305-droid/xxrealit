export type CzGeoLocationKind =
  | 'kraj'
  | 'okres'
  | 'orp'
  | 'mesto'
  | 'mestska-cast'
  | 'obec'
  | 'vesnice'
  | 'psc'
  | 'lokalita'
  | 'cast-obce';

export type CzGeoLocation = {
  slug: string;
  name: string;
  /** Lokál (např. „Pardubicích“, „Praze“) — bez předložky. */
  locative: string;
  kind: CzGeoLocationKind;
  parentSlug?: string;
  regionSlug?: string;
  districtSlug?: string;
  /** Vyhledávací termíny pro shodu s inzeráty (město, okres, kraj). */
  searchTerms: string[];
  population?: number;
};

function loc(slug: string, name: string, locative: string): Pick<CzGeoLocation, 'slug' | 'name' | 'locative'> {
  return { slug, name, locative };
}

/** 14 krajů ČR. */
const KRAJE: CzGeoLocation[] = [
  { ...loc('praha', 'Praha', 'Praze'), kind: 'kraj', searchTerms: ['Praha', 'Hlavní město Praha'] },
  { ...loc('stredocesky-kraj', 'Středočeský kraj', 'Středočeském kraji'), kind: 'kraj', searchTerms: ['Středočeský', 'Středočeský kraj'] },
  { ...loc('jihocesky-kraj', 'Jihočeský kraj', 'Jihočeském kraji'), kind: 'kraj', searchTerms: ['Jihočeský', 'Jihočeský kraj'] },
  { ...loc('plzensky-kraj', 'Plzeňský kraj', 'Plzeňském kraji'), kind: 'kraj', searchTerms: ['Plzeňský', 'Plzeňský kraj'] },
  { ...loc('karlovarsky-kraj', 'Karlovarský kraj', 'Karlovarském kraji'), kind: 'kraj', searchTerms: ['Karlovarský', 'Karlovarský kraj'] },
  { ...loc('ustecky-kraj', 'Ústecký kraj', 'Ústeckém kraji'), kind: 'kraj', searchTerms: ['Ústecký', 'Ústecký kraj'] },
  { ...loc('liberecky-kraj', 'Liberecký kraj', 'Libereckém kraji'), kind: 'kraj', searchTerms: ['Liberecký', 'Liberecký kraj'] },
  { ...loc('kralovehradecky-kraj', 'Královéhradecký kraj', 'Královéhradeckém kraji'), kind: 'kraj', searchTerms: ['Královéhradecký', 'Královéhradecký kraj'] },
  { ...loc('pardubicky-kraj', 'Pardubický kraj', 'Pardubickém kraji'), kind: 'kraj', searchTerms: ['Pardubický', 'Pardubický kraj'] },
  { ...loc('kraj-vysocina', 'Kraj Vysočina', 'Kraji Vysočina'), kind: 'kraj', searchTerms: ['Vysočina', 'Kraj Vysočina'] },
  { ...loc('jihomoravsky-kraj', 'Jihomoravský kraj', 'Jihomoravském kraji'), kind: 'kraj', searchTerms: ['Jihomoravský', 'Jihomoravský kraj'] },
  { ...loc('olomoucky-kraj', 'Olomoucký kraj', 'Olomouckém kraji'), kind: 'kraj', searchTerms: ['Olomoucký', 'Olomoucký kraj'] },
  { ...loc('zlinsky-kraj', 'Zlínský kraj', 'Zlínském kraji'), kind: 'kraj', searchTerms: ['Zlínský', 'Zlínský kraj'] },
  { ...loc('moravskoslezsky-kraj', 'Moravskoslezský kraj', 'Moravskoslezském kraji'), kind: 'kraj', searchTerms: ['Moravskoslezský', 'Moravskoslezský kraj'] },
];

type CitySeed = {
  slug: string;
  name: string;
  locative: string;
  regionSlug: string;
  districtSlug?: string;
  parentSlug?: string;
  kind?: CzGeoLocationKind;
  population?: number;
};

/** Statutární města, okresní města a klíčové lokality. Rozšiřitelné importem JSON (~6250 obcí). */
const CITIES: CitySeed[] = [
  { slug: 'brno', name: 'Brno', locative: 'Brně', regionSlug: 'jihomoravsky-kraj', districtSlug: 'brno-mesto', kind: 'mesto', population: 384000 },
  { slug: 'ostrava', name: 'Ostrava', locative: 'Ostravě', regionSlug: 'moravskoslezsky-kraj', districtSlug: 'ostrava-mesto', kind: 'mesto', population: 283000 },
  { slug: 'plzen', name: 'Plzeň', locative: 'Plzni', regionSlug: 'plzensky-kraj', districtSlug: 'plzen-mesto', kind: 'mesto', population: 175000 },
  { slug: 'liberec', name: 'Liberec', locative: 'Liberci', regionSlug: 'liberecky-kraj', districtSlug: 'liberec', kind: 'mesto', population: 104000 },
  { slug: 'olomouc', name: 'Olomouc', locative: 'Olomouci', regionSlug: 'olomoucky-kraj', districtSlug: 'olomouc', kind: 'mesto', population: 100000 },
  { slug: 'ceske-budejovice', name: 'České Budějovice', locative: 'Českých Budějovicích', regionSlug: 'jihocesky-kraj', districtSlug: 'ceske-budejovice', kind: 'mesto', population: 95000 },
  { slug: 'hradec-kralove', name: 'Hradec Králové', locative: 'Hradci Králové', regionSlug: 'kralovehradecky-kraj', districtSlug: 'hradec-kralove', kind: 'mesto', population: 93000 },
  { slug: 'pardubice', name: 'Pardubice', locative: 'Pardubicích', regionSlug: 'pardubicky-kraj', districtSlug: 'pardubice', kind: 'mesto', population: 92000 },
  { slug: 'usti-nad-labem', name: 'Ústí nad Labem', locative: 'Ústí nad Labem', regionSlug: 'ustecky-kraj', districtSlug: 'usti-nad-labem', kind: 'mesto', population: 91000 },
  { slug: 'zlin', name: 'Zlín', locative: 'Zlíně', regionSlug: 'zlinsky-kraj', districtSlug: 'zlin', kind: 'mesto', population: 74000 },
  { slug: 'kladno', name: 'Kladno', locative: 'Kladně', regionSlug: 'stredocesky-kraj', districtSlug: 'kladno', kind: 'mesto', population: 69000 },
  { slug: 'havirov', name: 'Havířov', locative: 'Havířově', regionSlug: 'moravskoslezsky-kraj', districtSlug: 'karvina', kind: 'mesto', population: 70000 },
  { slug: 'most', name: 'Most', locative: 'Mostě', regionSlug: 'ustecky-kraj', districtSlug: 'most', kind: 'mesto', population: 64000 },
  { slug: 'opava', name: 'Opava', locative: 'Opavě', regionSlug: 'moravskoslezsky-kraj', districtSlug: 'opava', kind: 'mesto', population: 56000 },
  { slug: 'frydek-mistek', name: 'Frýdek-Místek', locative: 'Frýdku-Místku', regionSlug: 'moravskoslezsky-kraj', districtSlug: 'frydek-mistek', kind: 'mesto', population: 55000 },
  { slug: 'jihlava', name: 'Jihlava', locative: 'Jihlavě', regionSlug: 'kraj-vysocina', districtSlug: 'jihlava', kind: 'mesto', population: 51000 },
  { slug: 'teplice', name: 'Teplice', locative: 'Teplicích', regionSlug: 'ustecky-kraj', districtSlug: 'teplice', kind: 'mesto', population: 49000 },
  { slug: 'karlovy-vary', name: 'Karlovy Vary', locative: 'Karlových Varech', regionSlug: 'karlovarsky-kraj', districtSlug: 'karlovy-vary', kind: 'mesto', population: 48000 },
  { slug: 'decin', name: 'Děčín', locative: 'Děčíně', regionSlug: 'ustecky-kraj', districtSlug: 'decin', kind: 'mesto', population: 48000 },
  { slug: 'chomutov', name: 'Chomutov', locative: 'Chomutově', regionSlug: 'ustecky-kraj', districtSlug: 'chomutov', kind: 'mesto', population: 48000 },
  { slug: 'mlada-boleslav', name: 'Mladá Boleslav', locative: 'Mladé Boleslavi', regionSlug: 'stredocesky-kraj', districtSlug: 'mlada-boleslav', kind: 'mesto', population: 45000 },
  { slug: 'prostejov', name: 'Prostějov', locative: 'Prostějově', regionSlug: 'olomoucky-kraj', districtSlug: 'prostejov', kind: 'mesto', population: 44000 },
  { slug: 'prerov', name: 'Přerov', locative: 'Přerově', regionSlug: 'olomoucky-kraj', districtSlug: 'prerov', kind: 'mesto', population: 43000 },
  { slug: 'ceska-lipa', name: 'Česká Lípa', locative: 'České Lípě', regionSlug: 'liberecky-kraj', districtSlug: 'ceska-lipa', kind: 'mesto', population: 37000 },
  { slug: 'trebic', name: 'Třebíč', locative: 'Třebíči', regionSlug: 'kraj-vysocina', districtSlug: 'trebic', kind: 'mesto', population: 35000 },
  { slug: 'tabor', name: 'Tábor', locative: 'Táboře', regionSlug: 'jihocesky-kraj', districtSlug: 'tabor', kind: 'mesto', population: 34000 },
  { slug: 'znojmo', name: 'Znojmo', locative: 'Znojmě', regionSlug: 'jihomoravsky-kraj', districtSlug: 'znojmo', kind: 'mesto', population: 34000 },
  { slug: 'kolin', name: 'Kolín', locative: 'Kolíně', regionSlug: 'stredocesky-kraj', districtSlug: 'kolin', kind: 'mesto', population: 33000 },
  { slug: 'pribram', name: 'Příbram', locative: 'Příbrami', regionSlug: 'stredocesky-kraj', districtSlug: 'pribram', kind: 'mesto', population: 32000 },
  { slug: 'cheb', name: 'Cheb', locative: 'Chebu', regionSlug: 'karlovarsky-kraj', districtSlug: 'cheb', kind: 'mesto', population: 32000 },
  { slug: 'trutnov', name: 'Trutnov', locative: 'Trutnově', regionSlug: 'kralovehradecky-kraj', districtSlug: 'trutnov', kind: 'mesto', population: 30000 },
  { slug: 'pisek', name: 'Písek', locative: 'Písku', regionSlug: 'jihocesky-kraj', districtSlug: 'pisek', kind: 'mesto', population: 30000 },
  { slug: 'kromeriz', name: 'Kroměříž', locative: 'Kroměříži', regionSlug: 'zlinsky-kraj', districtSlug: 'kromeriz', kind: 'mesto', population: 28000 },
  { slug: 'sumperk', name: 'Šumperk', locative: 'Šumperku', regionSlug: 'olomoucky-kraj', districtSlug: 'sumperk', kind: 'mesto', population: 25000 },
  { slug: 'vsetin', name: 'Vsetín', locative: 'Vsetíně', regionSlug: 'zlinsky-kraj', districtSlug: 'vsetin', kind: 'mesto', population: 25000 },
  { slug: 'uherske-hradiste', name: 'Uherské Hradiště', locative: 'Uherském Hradišti', regionSlug: 'zlinsky-kraj', districtSlug: 'uherske-hradiste', kind: 'mesto', population: 25000 },
  { slug: 'chrudim', name: 'Chrudim', locative: 'Chrudimi', regionSlug: 'pardubicky-kraj', districtSlug: 'chrudim', kind: 'mesto', population: 23000 },
  { slug: 'novy-jicin', name: 'Nový Jičín', locative: 'Novém Jičíně', regionSlug: 'moravskoslezsky-kraj', districtSlug: 'novy-jicin', kind: 'mesto', population: 23000 },
  { slug: 'karvina', name: 'Karviná', locative: 'Karviné', regionSlug: 'moravskoslezsky-kraj', districtSlug: 'karvina', kind: 'mesto', population: 52000 },
  { slug: 'jesenik', name: 'Jeseník', locative: 'Jeseníku', regionSlug: 'olomoucky-kraj', districtSlug: 'jesenik', kind: 'mesto', population: 11000 },
  { slug: 'nachod', name: 'Náchod', locative: 'Náchodě', regionSlug: 'kralovehradecky-kraj', districtSlug: 'nachod', kind: 'mesto', population: 20000 },
  { slug: 'jablonec-nad-nisou', name: 'Jablonec nad Nisou', locative: 'Jablonci nad Nisou', regionSlug: 'liberecky-kraj', districtSlug: 'jablonec-nad-nisou', kind: 'mesto', population: 45000 },
];

const OKRESY: CitySeed[] = [
  { slug: 'pardubice-okres', name: 'Okres Pardubice', locative: 'okrese Pardubice', regionSlug: 'pardubicky-kraj', kind: 'okres' },
  { slug: 'chrudim-okres', name: 'Okres Chrudim', locative: 'okrese Chrudim', regionSlug: 'pardubicky-kraj', kind: 'okres' },
  { slug: 'hradec-kralove-okres', name: 'Okres Hradec Králové', locative: 'okrese Hradec Králové', regionSlug: 'kralovehradecky-kraj', kind: 'okres' },
  { slug: 'brno-venkov', name: 'Okres Brno-venkov', locative: 'okrese Brno-venkov', regionSlug: 'jihomoravsky-kraj', kind: 'okres' },
];

function cityToGeo(c: CitySeed): CzGeoLocation {
  const region = KRAJE.find((k) => k.slug === c.regionSlug);
  const searchTerms = [c.name, c.locative, region?.name ?? '', c.districtSlug ?? ''].filter(Boolean);
  return {
    slug: c.slug,
    name: c.name,
    locative: c.locative,
    kind: c.kind ?? 'mesto',
    parentSlug: c.parentSlug,
    regionSlug: c.regionSlug,
    districtSlug: c.districtSlug,
    searchTerms: [...new Set(searchTerms)],
    population: c.population,
  };
}

const CITY_GEOS = CITIES.map(cityToGeo);
const OKRES_GEOS: CzGeoLocation[] = OKRESY.map((o) => ({
  ...cityToGeo(o),
  kind: 'okres' as const,
}));

/** Kompletní index lokalit pro programatické SEO (rozšiřitelný importem JSON). */
export const CZ_GEO_LOCATIONS: CzGeoLocation[] = [...KRAJE, ...OKRES_GEOS, ...CITY_GEOS];

const bySlug = new Map<string, CzGeoLocation>();
for (const entry of CZ_GEO_LOCATIONS) {
  if (!bySlug.has(entry.slug)) bySlug.set(entry.slug, entry);
}

export function findCzGeoLocation(slug: string): CzGeoLocation | null {
  const key = slug.trim().toLowerCase();
  return bySlug.get(key) ?? null;
}

export function listCzGeoLocations(kind?: CzGeoLocationKind): CzGeoLocation[] {
  if (!kind) return CZ_GEO_LOCATIONS;
  return CZ_GEO_LOCATIONS.filter((l) => l.kind === kind);
}

export function listCzGeoSlugsForSitemap(): string[] {
  return [...bySlug.keys()];
}
