export const RENOVATION_PRICING_VERSION = '2026.03.1';

/** Orientační jednotkové sazby (Kč) — verze dat, ne pevný AI prompt. */
export const RENOVATION_UNIT_RATES = {
  demolitionPerSqm: 1200,
  electricalPerSqm: 1800,
  plumbingPerSqm: 1600,
  flooringPerSqm: 1400,
  tilingPerSqm: 2200,
  paintingPerSqm: 450,
  furniturePerSqm: 3500,
  laborPerSqm: 2500,
  facadePerSqm: 2800,
  windowsPerUnit: 18000,
  roofPerSqm: 3200,
} as const;

export const MATERIAL_TIER_MULTIPLIER = {
  ECONOMY: 0.85,
  STANDARD: 1,
  PREMIUM: 1.35,
} as const;

export type RenovationLineItem = {
  id: string;
  label: string;
  amountMin: number;
  amountMax: number;
};

export type RenovationPricingSnapshot = {
  pricingVersion: string;
  region: string;
  lineItems: RenovationLineItem[];
  estimateMin: number;
  estimateMax: number;
  reserveMin: number;
  reserveMax: number;
  totalMinWithReserve: number;
  totalMaxWithReserve: number;
};
