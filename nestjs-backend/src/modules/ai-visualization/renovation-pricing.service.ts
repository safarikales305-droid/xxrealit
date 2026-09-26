import { Injectable } from '@nestjs/common';
import type { AiRenovationMaterialTier, AiVisualizationRenovationLevel } from '@prisma/client';
import {
  MATERIAL_TIER_MULTIPLIER,
  RENOVATION_PRICING_VERSION,
  RENOVATION_UNIT_RATES,
  type RenovationLineItem,
  type RenovationPricingSnapshot,
} from './renovation-pricing.defaults';

@Injectable()
export class RenovationPricingService {
  readonly version = RENOVATION_PRICING_VERSION;

  getBaselineContextForAi(region: string): Record<string, unknown> {
    return {
      pricingVersion: this.version,
      region,
      unitRates: RENOVATION_UNIT_RATES,
      materialTierMultipliers: MATERIAL_TIER_MULTIPLIER,
    };
  }

  computeDeterministicEstimate(input: {
    propertyType: string;
    areaSqm: number;
    renovationLevel: AiVisualizationRenovationLevel;
    materialTier: AiRenovationMaterialTier;
    scopePartial: boolean;
    region: string;
  }): RenovationPricingSnapshot {
    const area = Math.max(4, input.areaSqm);
    const tier = MATERIAL_TIER_MULTIPLIER[input.materialTier] ?? 1;
    const major = input.renovationLevel === 'MAJOR' ? 1.35 : input.renovationLevel === 'LIGHT' ? 0.65 : 1;
    const partial = input.scopePartial ? 0.75 : 1;
    const mul = tier * major * partial;

    const isExterior = input.propertyType === 'exterior' || input.propertyType === 'garden';
    const lines: RenovationLineItem[] = isExterior
      ? [
          this.line('demolition', 'Demontáž a příprava', RENOVATION_UNIT_RATES.demolitionPerSqm * area * 0.4, mul),
          this.line('facade', 'Fasáda / omítky', RENOVATION_UNIT_RATES.facadePerSqm * area, mul),
          this.line('windows', 'Okna / výplně', RENOVATION_UNIT_RATES.windowsPerUnit * 4, mul),
          this.line('roof', 'Střecha / klempířina', RENOVATION_UNIT_RATES.roofPerSqm * area * 0.35, mul),
          this.line('labor', 'Montáž a práce', RENOVATION_UNIT_RATES.laborPerSqm * area * 0.8, mul),
        ]
      : [
          this.line('demolition', 'Demontáž a příprava', RENOVATION_UNIT_RATES.demolitionPerSqm * area * 0.5, mul),
          this.line('electrical', 'Elektroinstalace', RENOVATION_UNIT_RATES.electricalPerSqm * area * 0.6, mul),
          this.line('plumbing', 'Voda / odpady', RENOVATION_UNIT_RATES.plumbingPerSqm * area * 0.5, mul),
          this.line('flooring', 'Podlahy', RENOVATION_UNIT_RATES.flooringPerSqm * area, mul),
          this.line('tiling', 'Obklady', RENOVATION_UNIT_RATES.tilingPerSqm * area * 0.45, mul),
          this.line('painting', 'Malby', RENOVATION_UNIT_RATES.paintingPerSqm * area * 1.2, mul),
          this.line('furniture', 'Nábytek / vybavení', RENOVATION_UNIT_RATES.furniturePerSqm * area * 0.35, mul),
          this.line('labor', 'Montáž a práce', RENOVATION_UNIT_RATES.laborPerSqm * area, mul),
        ];

    return this.snapshotFromLines(lines, input.region);
  }

  mergeAiLineItems(
    baseline: RenovationPricingSnapshot,
    aiLines: RenovationLineItem[] | null,
  ): RenovationPricingSnapshot {
    if (!aiLines?.length) return baseline;
    return this.snapshotFromLines(aiLines, baseline.region);
  }

  private line(id: string, label: string, base: number, mul: number): RenovationLineItem {
    const mid = Math.round(base * mul);
    return {
      id,
      label,
      amountMin: Math.round(mid * 0.88),
      amountMax: Math.round(mid * 1.12),
    };
  }

  private snapshotFromLines(lines: RenovationLineItem[], region: string): RenovationPricingSnapshot {
    const estimateMin = lines.reduce((s, l) => s + l.amountMin, 0);
    const estimateMax = lines.reduce((s, l) => s + l.amountMax, 0);
    const reserveMin = Math.round(estimateMin * 0.1);
    const reserveMax = Math.round(estimateMax * 0.1);
    return {
      pricingVersion: this.version,
      region,
      lineItems: lines,
      estimateMin,
      estimateMax,
      reserveMin,
      reserveMax,
      totalMinWithReserve: estimateMin + reserveMin,
      totalMaxWithReserve: estimateMax + reserveMax,
    };
  }
}
