import { Prisma } from '@prisma/client';

export function computeDisplayedValue(input: {
  realValue: number;
  multiplier: number;
  manualValue: number | null;
}): number {
  if (input.manualValue != null && Number.isFinite(input.manualValue)) {
    return Math.round(input.manualValue);
  }
  return Math.round(input.realValue * input.multiplier);
}

export function toPrismaJson(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}
