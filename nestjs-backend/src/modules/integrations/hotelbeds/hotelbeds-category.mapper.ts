/** Mapování Hotelbeds typů na XXREALIT kategorie */
export type XxrealitCategory =
  | 'hotely'
  | 'apartmany'
  | 'penziony'
  | 'chaty'
  | 'chalupy'
  | 'wellness'
  | 'kempy'
  | 'resorty'
  | 'luxusni'
  | 'ostatni';

const ACCOMMODATION_TYPE_MAP: Record<string, XxrealitCategory> = {
  HOTEL: 'hotely',
  APARTHOTEL: 'apartmany',
  APARTMENT: 'apartmany',
  HOSTEL: 'penziony',
  GUESTHOUSE: 'penziony',
  PENSION: 'penziony',
  VILLA: 'chaty',
  CHALET: 'chaty',
  CABIN: 'chaty',
  COTTAGE: 'chalupy',
  RESORT: 'resorty',
  CAMPING: 'kempy',
  APART: 'apartmany',
};

const KEYWORD_RULES: Array<{ category: XxrealitCategory; patterns: RegExp[] }> = [
  { category: 'apartmany', patterns: [/apart/i, /aparthotel/i, /apartment/i] },
  { category: 'penziony', patterns: [/pension/i, /penzion/i, /hostel/i, /guesthouse/i, /guest house/i, /bed and breakfast/i] },
  { category: 'chaty', patterns: [/chalet/i, /cabin/i, /chata/i, /\bvilla\b/i] },
  { category: 'chalupy', patterns: [/chalup/i, /cottage/i, /country house/i] },
  { category: 'resorty', patterns: [/resort/i] },
  { category: 'kempy', patterns: [/camp/i, /kemp/i, /caravan/i] },
  { category: 'wellness', patterns: [/wellness/i, /\bspa\b/i, /thermal/i] },
  { category: 'luxusni', patterns: [/luxury/i, /luxus/i, /5 star/i, /5est/i] },
];

export function mapHotelbedsToCategory(input: {
  accommodationTypeCode?: string | null;
  categoryName?: string | null;
  categoryCode?: string | null;
  name?: string | null;
}): XxrealitCategory {
  const typeCode = input.accommodationTypeCode?.trim().toUpperCase();
  if (typeCode && ACCOMMODATION_TYPE_MAP[typeCode]) {
    return ACCOMMODATION_TYPE_MAP[typeCode];
  }

  const haystack = [
    input.accommodationTypeCode,
    input.categoryName,
    input.categoryCode,
    input.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  for (const rule of KEYWORD_RULES) {
    if (rule.patterns.some((p) => p.test(haystack))) return rule.category;
  }

  if (/hotel/i.test(haystack)) return 'hotely';
  return 'hotely';
}

export function categoryMatchesFilter(
  hotelCategory: XxrealitCategory,
  requested?: string | null,
): boolean {
  if (!requested || requested === 'vse') return true;
  if (requested === 'chaty' || requested === 'chalupy') {
    return hotelCategory === 'chaty' || hotelCategory === 'chalupy';
  }
  if (requested === 'mesto' || requested === 'hory' || requested === 'u-more') {
    return true;
  }
  return hotelCategory === requested;
}
