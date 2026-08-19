import { ARES_BASE_URL } from './company-directory.constants';

/** Verified against https://ares.gov.cz/swagger-ui/ (ekonomicke-subjekty-v-be REST API). */
export const ARES_API_VERSION = 'ekonomicke-subjekty-v-be REST';
export const ARES_SEARCH_ENDPOINT = `${ARES_BASE_URL}/ekonomicke-subjekty/vyhledat`;
export const ARES_LOOKUP_ENDPOINT = `${ARES_BASE_URL}/ekonomicke-subjekty/{ico}`;

export const ARES_PAGINATION = {
  offsetParam: 'start',
  pageSizeParam: 'pocet',
  maxPageSize: 100,
  maxResultsPerQuery: 1000,
  totalField: 'pocetCelkem',
} as const;

/**
 * Verified behaviour (2026-05):
 * - `sidlo.nazevObce`, `sidlo.kodKraje`, `sidlo.nazevOkresu` are NOT valid alone and are IGNORED when combined with czNace.
 * - `sidlo.kodObce` is the reliable municipality filter.
 * - `sidlo.textovaAdresa` works but often exceeds 1000 results.
 * - `czNace` alone or with `kodObce` works.
 */
export const ARES_SUPPORTED_FILTERS = [
  'start',
  'pocet',
  'ico[]',
  'obchodniJmeno',
  'czNace[]',
  'pravniForma[]',
  'sidlo.kodObce',
  'sidlo.textovaAdresa',
] as const;
